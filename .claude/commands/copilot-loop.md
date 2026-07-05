# Copilot Review Loop

Processes the latest Copilot PR review: fixes valid issues, replies to all comments, resolves threads, requests a new review, then polls every minute for up to 15 minutes for the new review to arrive before falling back to a 10-minute reschedule.

Keep the loop quiet. Accumulate a running findings ledger in the session context. Poll every 1 minute for up to 15 minutes, then fall back to 10 minutes. Track polling start time and active schedule ID in the SQL session database (`sql` tool) — see Steps 1 and 4. Emit the final report only when the review is clean.

## Setup

Identify the current PR number:

```bash
gh pr view --json number --jq '.number'
```

Use that number throughout (referred to as `{PR}` below).

## Step 1 — Find the latest Copilot PR review

**First, stop the schedule that triggered this run:**

```sql
CREATE TABLE IF NOT EXISTS poll_state (key TEXT PRIMARY KEY, value TEXT);
SELECT value FROM poll_state WHERE key = 'scheduleId:{PR}';
```

If a row is returned, call `manage_schedule(action: 'stop', id: <value>)`, then delete it:

```sql
DELETE FROM poll_state WHERE key = 'scheduleId:{PR}';
```

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews?per_page=100" | python3 -c "
import json, sys
reviews = json.load(sys.stdin)
last = None
for r in reviews:
    if 'copilot' in r.get('user', {}).get('login', ''):
        last = r
if last:
    print(last['id'], last['submitted_at'], last['commit_id'][:8])
    print('BODY:', (last.get('body') or '').replace('\n', ' ')[:500])
else:
    print('NO_REVIEW')
"
```

If `NO_REVIEW`: request one (Step 4) and record the polling start time if not already set:

```sql
INSERT OR IGNORE INTO poll_state (key, value) VALUES ('pollingStartedAt:{PR}', datetime('now'));
```

Then schedule the next poll with `manage_schedule` (action: `create`, interval: `1m`, prompt: `Run the copilot-loop skill to process the Copilot PR review on this repository`) and store the returned schedule ID:

```sql
INSERT OR REPLACE INTO poll_state (key, value) VALUES ('scheduleId:{PR}', '<id returned by manage_schedule>');
```

On each subsequent run, compute elapsed minutes with `SELECT CAST((julianday('now') - julianday(value)) * 24 * 60 AS INTEGER) FROM poll_state WHERE key = 'pollingStartedAt:{PR}'`; if ≥ 15, use interval `10m` instead. Do not give a user-facing status update.

## Step 2 — Check if the review is clean

**Before checking clean — confirm this is a new review:**

```sql
SELECT value FROM poll_state WHERE key = 'lastProcessedReviewId:{PR}';
```

If the returned value equals `{REVIEW_ID}`, a new review has not yet arrived. Compute elapsed time and reschedule (same 1m/10m logic based on `pollingStartedAt`) and stop.

Fetch the review's inline comments:

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews/{REVIEW_ID}/comments"
```

**Clean** if the JSON array is empty (`[]`), OR if the `BODY:` line printed in Step 1 contains "generated no new comments".

**If clean:** clean up remaining SQL state:

```sql
DELETE FROM poll_state WHERE key IN ('pollingStartedAt:{PR}', 'lastProcessedReviewId:{PR}');
```

Emit the final report:

| Round | Finding | Status | How handled | Evidence |
| ----- | ------- | ------ | ----------- | -------- |
| 1 | ... | fixed/refuted | ... | thread id, commit SHA, or path |

## Step 3 — Process each comment

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

## Step 4 — Push, reply, resolve, request

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

Store the just-processed review ID so polling can detect when a new review arrives:

```sql
INSERT OR REPLACE INTO poll_state (key, value) VALUES ('lastProcessedReviewId:{PR}', '{REVIEW_ID}');
```

Reset `pollingStartedAt` and schedule the next poll (1m if < 15 min elapsed, else 10m):

```sql
INSERT OR REPLACE INTO poll_state (key, value) VALUES ('pollingStartedAt:{PR}', datetime('now'));
```

```sql
SELECT CAST((julianday('now') - julianday(value)) * 24 * 60 AS INTEGER) FROM poll_state WHERE key = 'pollingStartedAt:{PR}';
```

`manage_schedule` (action: `create`, interval: `1m` or `10m`, prompt: `Run the copilot-loop skill to process the Copilot PR review on this repository`). Store the returned ID:

```sql
INSERT OR REPLACE INTO poll_state (key, value) VALUES ('scheduleId:{PR}', '<returned id>');
```

Note: `gh pr edit --add-reviewer copilot` and `gh pr edit --add-reviewer github-copilot` do not work. Use `copilot-pull-request-reviewer`. Do **not** post `@copilot review` — that triggers `copilot-swe-agent[bot]`.

## Repo-specific notes

- `npm run done` = prettier → typecheck (tsc + astro check) → eslint --fix → vitest run related
- Commit message format: `fix(scope): description`
- Owner: `davidhouweling`, Repo: `guilty-spark`
- ESLint rules to watch for: `strict-boolean-expressions`, `no-unnecessary-condition` — avoid redundant null checks and `??` on non-nullable types
- Always check `isResolved` before resolving a thread to avoid double-resolve errors
