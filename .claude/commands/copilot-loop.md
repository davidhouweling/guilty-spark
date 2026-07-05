# Copilot Review Loop

Processes the latest Copilot PR review: fixes valid issues, replies to all comments, resolves threads, requests a new review, then polls until clean. Poll state (PR, iteration, last review ID) is carried forward in the scheduled prompt string — no external storage needed. Keep the loop quiet. Emit the final report only when the review is clean.

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
    print('BODY:', body.replace('\n', ' ')[:500])
else:
    print('NO_REVIEW')
"
```

**If `NO_REVIEW`:** on the first poll only (`iteration == 0`), request a review:

```bash
gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
```

Then (for all NO_REVIEW polls), compute `nextIteration = iteration + 1`, use interval `1m` if `nextIteration ≤ 15` else `10m`, schedule the next poll, and stop:

```
manage_schedule(action: 'create', interval: '{interval}',
  prompt: 'Run the copilot-loop skill to process the Copilot PR review. PR:{PR} iteration:{nextIteration} lastReviewId:')
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

**Clean** if the JSON array is empty (`[]`), OR if `BODY_CLEAN: True` was printed in Step 1.

If clean: emit the final report and stop — do not reschedule.

| Round | Finding | Status | How handled | Evidence |
| ----- | ------- | ------ | ----------- | -------- |
| 1 | ... | fixed/refuted | ... | thread id, commit SHA, or path |

## Step 4 — Process each comment

For each inline comment from the review:

1. **Assess validity.** Read the referenced file and surrounding context. Is the concern real?

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Then:

   ```bash
   npm run done
   ```

3. **If invalid/refuted:** Note the reason clearly. Do not make code changes for this comment.

4. Add one row to the findings ledger for every comment you process. Include the review round, the finding, whether it was fixed or refuted, and how it was handled.

5. Commit all fixes together once all comments are processed:

   ```bash
   git add <changed files>
   git commit -m "fix(...): <description>"
   ```

## Step 5 — Push, reply, resolve, request

Once all comments are addressed (or refuted):

```bash
git push
```

**Reply in-thread to every comment** (include the fix commit SHA or the refutation reason):

```bash
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Fixed in {SHA}. <one sentence explaining what changed>."
# or for refuted:
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Not actioned: <reason why the concern doesn't apply>."
```

**Resolve every unresolved Copilot thread** via GraphQL. First get thread node IDs, including the author of the first comment so you can filter to Copilot-owned threads only:

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
