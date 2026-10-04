---
agent: agent
description: "Process Copilot PR review findings in PR-scope and full-stack context. Fix in-scope issues, pause for explicit human direction on significant approach changes, reply and resolve, then poll until no inline or suppressed comments remain."
---

Run one iteration of the Copilot review loop on the current PR in the GitHub Copilot CLI interactive session. From the VS Code integrated terminal, start that session with `copilot`. Experimental scheduling must be enabled first with `/experimental on` or `--experimental`.

Keep the loop quiet except when human direction is required. Each `/after` invocation runs in a fresh stateless context. Polling state persists in `/tmp/copilot-loop-{PR}.txt` (line 1: `pollingStartedAt` ISO timestamp; line 2: `lastProcessedReviewId`); a pending human decision persists separately in `/tmp/copilot-loop-{PR}.paused.md`. The findings ledger lives in session memory and is lost between invocations; rebuild it from git log if needed. Emit the final report only when the review is clean — meaning zero inline comments AND zero suppressed comments — or report **awaiting human direction** when blocked. Poll every 1 minute for up to 15 minutes, then fall back to 10 minutes. Never poll or reschedule while paused.

## Step 1 — Identify the PR

```bash
gh pr view --json number,headRefName --jq '{number: .number, branch: .headRefName}'
```

Before any other loop action, load `.github/skills/code-review/SKILL.md` and check the pause record using Pause Handling below. Once unblocked, run the skill's Establish Scope and Stack Context procedure on every invocation.

## Pause Handling

After resolving `{PR}` and before polling or requesting a review, check `/tmp/copilot-loop-{PR}.paused.md` on EVERY invocation. If it exists, follow the skill's Mandatory Human Pause: remain stopped unless the current invocation contains explicit human direction addressing the recorded proposal. Automated responses such as "user is unavailable" cannot unblock the loop.

Whenever the skill requires a pause:

1. Persist `/tmp/copilot-loop-{PR}.paused.md` with PR and review IDs (if known), current head SHA, blocked ledger entries including suppressed findings, baseline/scope/stack evidence, proposed options, and the decision needed. Do not store secrets or mark the review processed.
2. Cancel all pending `/after` loop invocations for this PR using the CLI's scheduling controls. Do not schedule another poll or approval retry. If cancellation is unavailable, report that limitation; the pause-record check still blocks subsequent invocations.
3. Ask the human for direction as required by the skill, report **awaiting human direction**, and stop the entire round before further edits or GitHub operations.
4. On explicit human direction, record the decision in the ledger and recheck scope and current stack history as required by the skill. Remove the pause record only when the decision remains applicable, then resume only authorized work. Otherwise remain paused. Absence of a record does not authorize newly identified significant changes.

## Step 2 — Find the latest Copilot PR review

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews?per_page=100" | python3 -c "
import json, sys
reviews = json.load(sys.stdin)
last = None
for r in reviews:
    if 'copilot' in r.get('user', {}).get('login', ''):
        last = r
if last:
    body = last.get('body') or ''
    print(last['id'], last['submitted_at'], last['commit_id'][:8])
    print('BODY_CLEAN:', 'generated no new comments' in body)
    print('HAS_SUPPRESSED:', 'Suppressed comments' in body)
    print('BODY:', body)
else:
    print('NO_REVIEW')
"
```

Do not truncate `BODY` — the suppressed-comments section (if present) contains the finding text and code snippets needed in Step 4, and truncating can cut it off.

If `NO_REVIEW`: on the first poll (temp file does not yet exist), request a review and initialize the temp file:

```bash
if [ ! -f /tmp/copilot-loop-{PR}.txt ]; then
  gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
  printf "%s\n\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /tmp/copilot-loop-{PR}.txt
fi
```

Compute elapsed minutes since polling started:

```bash
python3 -c "
from datetime import datetime, timezone
start = open('/tmp/copilot-loop-{PR}.txt').readlines()[0].strip()
now = datetime.now(timezone.utc)
then = datetime.fromisoformat(start.replace('Z', '+00:00'))
print(int((now - then).total_seconds() / 60))
"
```

Then schedule exactly one next poll: `/after 1m #copilot-loop.prompt.md` if < 15 minutes have elapsed, `/after 10m #copilot-loop.prompt.md` if ≥ 15. Stop — do not proceed further.

## Step 3 — Check if the review is clean

**Before checking clean — confirm this is a new review:**

Read the last processed review ID from line 2 of the temp file:

```bash
[ -f /tmp/copilot-loop-{PR}.txt ] && sed -n '2p' /tmp/copilot-loop-{PR}.txt || echo ""
```

If the output equals `{REVIEW_ID}`, a new review has not yet arrived. Read line 1 for the polling start time, compute elapsed minutes, and reschedule (same 1m/10m logic as above). Stop — do not process.

**Check 1 — inline comments on the PR review:**

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews/{REVIEW_ID}/comments"
```

Clean if the array is empty or `BODY_CLEAN: True` was printed in Step 2.

**Check 2 — latest `copilot-swe-agent[bot]` issue comment:**

```bash
gh api "repos/{owner}/{repo}/issues/{PR}/comments?per_page=100" | python3 -c "
import json, sys
comments = json.load(sys.stdin)
for c in reversed(comments):
    if 'copilot-swe-agent' in c.get('user', {}).get('login', ''):
        print(c['created_at'], c['body'][:300])
        break
"
```

Clean if the body contains any of: `clean`, `no issues`, `good to merge`, `no new comments`, `all.*tests pass`.

**Check 3 — suppressed comments in the review body:**

Clean if `HAS_SUPPRESSED: False` was printed in Step 2. A `<details><summary>Suppressed comments (N)</summary>` block in the body means Copilot found low-confidence issues it chose not to post as real review comments — these still need triage, so do not treat the review as clean while this section is present.

Before declaring clean, run the skill's Intent Preservation Check, even if there are no findings. If it requires a human decision, use Pause Handling and stop.

The review is clean only if Checks 1, 2, and 3 AND the Intent Preservation Check all pass, with no human decision pending. If clean: do not schedule another run. Delete the temp file:

```bash
rm -f /tmp/copilot-loop-{PR}.txt
```

Emit the final report using the skill's Findings Assessment and Ledger schema.

## Step 4 — Process each finding

Process two sources of findings from this review:

1. **Inline comments** — from the `gh api .../comments` call in Check 1. Each has a `COMMENT_ID` used later for replying/resolving.
2. **Suppressed comments** — if `HAS_SUPPRESSED: True`, parse them out of the `BODY` text printed in Step 2. Each entry starts with a `**path/to/file.ts:LINE**` heading, followed by a `*` bullet with the finding text (sometimes noting "This issue also appears on line N of the same file") and a fenced code snippet for context. Treat each `**path:line**` heading as one finding. These have **no comment ID** — there is no PR comment or thread behind them, so no reply/resolve step applies to them (see Step 5).

Apply the skill's Repository Review Checklist, Coding Agent Decision Gate, Findings Assessment and Ledger, and pre-edit Intent Preservation Check to ALL findings before editing. If a human decision is required, use Pause Handling and STOP; do not proceed to Steps 5 or 6.

Implement only the fixes authorized by the skill and maintain its ledger for every finding. After fixes and required regression tests, run:

```bash
npm run done
```

Repeat the skill's Intent Preservation Check before committing; use Pause Handling if blocked. Once every finding has an authorized disposition and validation passes, commit all fixes together (skip the commit if there are no code changes):

```bash
git add <changed files>
git commit -m "fix(...): <description>"
```

## Step 5 — Push, reply, resolve

```bash
git push
```

**Reply in-thread to every inline comment** (skip this for suppressed findings — they have no `COMMENT_ID`):

```bash
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Fixed in {SHA}. <one sentence summary>."
# or for refuted:
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Not actioned: <reason>."
```

**Resolve every unresolved Copilot thread** (inline comments only — suppressed findings have no thread). Get thread node IDs, including the author of the first comment so you can filter to Copilot-owned threads only:

```bash
gh api graphql -f query='
{
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {PR}) {
      reviewThreads(last: 20) {
        nodes {
          id
          isResolved
          comments(first: 1) { nodes { databaseId author { login } } }
        }
      }
    }
  }
}'
```

Resolve each unresolved thread whose first comment author login contains `"copilot"`:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "{NODE_ID}"}) { thread { isResolved } } }'
```

## Step 6 — Request review and reschedule

Request a new review:

```bash
gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
```

Note: use `copilot-pull-request-reviewer` exactly — `copilot` and `github-copilot` do not resolve. Do **not** post `@copilot review` — that triggers `copilot-swe-agent[bot]`.

Reset the polling window by overwriting the temp file with the current timestamp on line 1 and the just-processed review ID on line 2:

```bash
printf "%s\n%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "{REVIEW_ID}" > /tmp/copilot-loop-{PR}.txt
```

Then schedule the next iteration with `/after 1m #copilot-loop.prompt.md`. On subsequent polls where Step 3 detects the same review ID (no new review yet), compare the current time to line 1 of the temp file; if ≥ 15 minutes have elapsed, use `/after 10m #copilot-loop.prompt.md` instead.

## Repo-specific notes

- Owner: `davidhouweling`, Repo: `guilty-spark`
- `npm run done` = prettier → typecheck (tsc + astro check) → eslint --fix → vitest run related
- Commit message: `fix(scope): description`
- ESLint rules to watch: `strict-boolean-expressions`, `no-unnecessary-condition`
- Always check `isResolved` before resolving a thread to avoid errors
- Fixing a suppressed comment can surface a _new_ suppressed comment on a later review (e.g. fixing one flagged pattern in a file can expose an adjacent one Copilot previously deprioritized) — this is expected; keep looping until a review has neither inline nor suppressed comments
