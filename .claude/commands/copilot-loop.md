# Copilot Review Loop

Processes the latest Copilot PR review: fixes valid issues — both inline comments and suppressed (low-confidence) comments buried in the review body — replies to all inline comments, resolves threads, requests a new review, then polls until clean. "Clean" means zero inline comments AND zero suppressed comments. Poll state (PR, iteration, last review ID) is carried forward in the scheduled prompt string — no external storage needed. Keep the loop quiet. Emit the final report only when the review is clean.

## Setup

Resolve `PR` using the first match:

1. Direct argument — e.g. `/copilot-loop 643`
2. `PR:` key in the invocation prompt — e.g. `PR:643` (present on scheduled runs)
3. Fallback — `gh pr view --json number --jq '.number'`

Parse these from the invocation prompt if present (tokens follow the format `key:value` and can appear anywhere in the prompt text; default to zero values on manual runs):

- `iteration` — consecutive polls without a new review (e.g. `iteration:3`; default `0`)
- `lastReviewId` — ID of the last processed review (e.g. `lastReviewId:4631032003`; default empty)

Stop all active loop schedules for this PR by listing and stopping every schedule whose prompt contains "copilot-loop skill to process the Copilot PR review. PR:{PR}":

```
manage_schedule(action: 'list')
// for each matching schedule:
manage_schedule(action: 'stop', id: <matching id>)
```

## Step 1 — Find the latest Copilot PR review

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

**If `NO_REVIEW`:** on the first poll only (`iteration == 0`), request a review:

```bash
gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
```

Then (for all NO_REVIEW polls), compute `nextIteration = iteration + 1`, use interval `1m` if `nextIteration ≤ 15` else `10m`, schedule the next poll, and stop:

```
manage_schedule(action: 'create', interval: '{interval}',
  prompt: 'Run the copilot-loop skill to process the Copilot PR review. PR:{PR} iteration:{nextIteration}')
```

## Step 2 — Check if a new review has arrived

If `{REVIEW_ID}` equals `lastReviewId`, the new review hasn't arrived yet.

Compute `nextIteration = iteration + 1`. Use interval `1m` if `nextIteration ≤ 15`, else `10m`. Reschedule and stop:

```
manage_schedule(action: 'create', interval: '{interval}',
  prompt: 'Run the copilot-loop skill to process the Copilot PR review. PR:{PR} iteration:{nextIteration} lastReviewId:{lastReviewId}')
```

## Step 3 — Check if the review is clean

Fetch the review's inline comments:

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews/{REVIEW_ID}/comments"
```

**Clean** requires ALL of:

- The inline comments JSON array is empty (`[]`), OR `BODY_CLEAN: True` was printed in Step 1.
- `HAS_SUPPRESSED: False` was printed in Step 1 — a `<details><summary>Suppressed comments (N)</summary>` block in the body means Copilot found low-confidence issues it chose not to post as real review comments. These still need triage; do not treat the review as clean while this section is present.

If clean: emit the final report and stop — do not reschedule.

| Round | Finding | Status | How handled | Evidence |
| ----- | ------- | ------ | ----------- | -------- |
| 1 | ... | fixed/refuted | ... | thread id, commit SHA, or path |
| 1 | ... (suppressed) | fixed/refuted | ... | commit SHA or path — no thread, suppressed comments have no comment ID |

## Step 4 — Process each finding

Process two sources of findings from this review:

1. **Inline comments** — from the `gh api .../comments` call above. Each has a `COMMENT_ID` used later for replying/resolving.
2. **Suppressed comments** — if `HAS_SUPPRESSED: True`, parse them out of the `BODY` text printed in Step 1. Each entry starts with a `**path/to/file.ts:LINE**` heading, followed by a `*` bullet with the finding text (sometimes noting "This issue also appears on line N of the same file") and a fenced code snippet for context.

   Treat each `**path:line**` heading as one finding. These have **no comment ID** — there is no PR comment or thread behind them, so no reply/resolve step applies to them (see Step 5).

For each finding (inline or suppressed):

1. **Assess validity.** Read the referenced file and surrounding context. Is the concern real?

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Then:

   ```bash
   npm run done
   ```

3. **If invalid/refuted:** Note the reason clearly. Do not make code changes for this comment.

4. Add one row to the findings ledger for every finding you process (inline or suppressed). Include the review round, the finding, whether it was fixed or refuted, and how it was handled — mark suppressed findings clearly (e.g. append "(suppressed)" to the finding text) since they skip the reply/resolve step.

5. Commit all fixes together once all findings are processed:

   ```bash
   git add <changed files>
   git commit -m "fix(...): <description>"
   ```

## Step 5 — Push, reply, resolve, request

Once all findings are addressed (or refuted):

```bash
git push
```

**Reply in-thread to every inline comment** (include the fix commit SHA or the refutation reason). Skip this for suppressed findings — they have no `COMMENT_ID` to reply to:

```bash
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Fixed in {SHA}. <one sentence explaining what changed>."
# or for refuted:
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Not actioned: <reason why the concern doesn't apply>."
```

**Resolve every unresolved Copilot thread** via GraphQL (inline comments only — suppressed findings have no thread). First get thread node IDs, including the author of the first comment so you can filter to Copilot-owned threads only:

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

Then resolve each unresolved thread whose first comment author login contains `"copilot"`:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "{NODE_ID}"}) { thread { isResolved } } }'
```

**Request a new Copilot review:**

```bash
gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
```

Note: `gh pr edit --add-reviewer copilot` and `gh pr edit --add-reviewer github-copilot` do not work. Use `copilot-pull-request-reviewer`. Do **not** post `@copilot review` — that triggers `copilot-swe-agent[bot]`.

Schedule the next poll at 1m, carrying the just-processed review ID forward so Step 2 can detect when a new review arrives:

```
manage_schedule(action: 'create', interval: '1m',
  prompt: 'Run the copilot-loop skill to process the Copilot PR review. PR:{PR} iteration:1 lastReviewId:{REVIEW_ID}')
```

## Repo-specific notes

- `npm run done` = prettier → typecheck (tsc + astro check) → eslint --fix → vitest run related
- Commit message format: `fix(scope): description`
- Owner: `davidhouweling`, Repo: `guilty-spark`
- ESLint rules to watch for: `strict-boolean-expressions`, `no-unnecessary-condition` — avoid redundant null checks and `??` on non-nullable types
- Always check `isResolved` before resolving a thread to avoid double-resolve errors
- Fixing a suppressed comment can surface a *new* suppressed comment on a later review (e.g. fixing one flagged pattern in a file can expose an adjacent one Copilot previously deprioritized) — this is expected; keep looping until a review has neither inline nor suppressed comments
