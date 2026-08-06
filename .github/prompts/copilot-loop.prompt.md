---
agent: agent
description: "Process the latest Copilot PR review: fix valid issues (including suppressed low-confidence comments buried in the review body), reply to all inline comments, resolve threads, request a new review, poll every minute for up to 15 minutes, and reschedule itself with /after until the review has neither inline nor suppressed comments."
---

Run one iteration of the Copilot review loop on the current PR in the GitHub Copilot CLI interactive session. From the VS Code integrated terminal, start that session with `copilot`. Experimental scheduling must be enabled first with `/experimental on` or `--experimental`.

Keep the loop quiet. Each `/after` invocation runs in a fresh stateless context — only `/tmp/copilot-loop-{PR}.txt` persists across runs (line 1: `pollingStartedAt` ISO timestamp; line 2: `lastProcessedReviewId`). The findings ledger lives in session memory and is lost between invocations; rebuild it from git log if needed. Emit the final report only when the review is clean — meaning zero inline comments AND zero suppressed comments. Poll every 1 minute for up to 15 minutes, then fall back to 10 minutes.

## Step 1 — Identify the PR

```bash
gh pr view --json number,headRefName --jq '{number: .number, branch: .headRefName}'
```

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

The review is clean only if Checks 1, 2, and 3 all pass. If clean: do not schedule another run. Delete the temp file:

```bash
rm -f /tmp/copilot-loop-{PR}.txt
```

Emit the final report:

| Round | Finding          | Status        | How handled | Evidence                       |
| ----- | ---------------- | ------------- | ----------- | ------------------------------ |
| 1     | ...              | fixed/refuted | ...         | thread id, commit SHA, or path |
| 1     | ... (suppressed) | fixed/refuted | ...         | commit SHA or path — no thread |

## Step 4 — Process each finding

Process two sources of findings from this review:

1. **Inline comments** — from the `gh api .../comments` call in Check 1. Each has a `COMMENT_ID` used later for replying/resolving.
2. **Suppressed comments** — if `HAS_SUPPRESSED: True`, parse them out of the `BODY` text printed in Step 2. Each entry starts with a `**path/to/file.ts:LINE**` heading, followed by a `*` bullet with the finding text (sometimes noting "This issue also appears on line N of the same file") and a fenced code snippet for context. Treat each `**path:line**` heading as one finding. These have **no comment ID** — there is no PR comment or thread behind them, so no reply/resolve step applies to them (see Step 5).

For each finding (inline or suppressed):

1. **Assess validity.** Read the referenced file and surrounding context. Is the concern real?

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Run:

   ```bash
   npm run done
   ```

3. **If invalid/refuted:** Note the reason. No code changes.

4. Add one row to the findings ledger for every finding you process (inline or suppressed). Include the review round, the finding, whether it was fixed or refuted, and how it was handled — mark suppressed findings clearly (e.g. append "(suppressed)" to the finding text) since they skip the reply/resolve step.

5. Commit all fixes together once all findings are processed:

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
- Fixing a suppressed comment can surface a *new* suppressed comment on a later review (e.g. fixing one flagged pattern in a file can expose an adjacent one Copilot previously deprioritized) — this is expected; keep looping until a review has neither inline nor suppressed comments
