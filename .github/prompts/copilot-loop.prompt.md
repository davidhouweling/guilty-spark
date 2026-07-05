---
agent: agent
description: "Process the latest Copilot PR review: fix valid issues, reply to all comments, resolve threads, request a new review, poll every minute for up to 15 minutes, and reschedule itself with /after until the review is clean."
---

Run one iteration of the Copilot review loop on the current PR in the GitHub Copilot CLI interactive session. From the VS Code integrated terminal, start that session with `copilot`. Experimental scheduling must be enabled first with `/experimental on` or `--experimental`.

Keep the loop quiet. Accumulate a running findings ledger in the session context. Persist `pollingStartedAt` to `/tmp/copilot-loop-{PR}.txt` (each `/after` invocation is stateless). Poll every 1 minute for up to 15 minutes, then fall back to 10 minutes. Emit the final report only when the review is clean.

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
    print(last['id'], last['submitted_at'], last['commit_id'][:8])
    print('BODY:', (last.get('body') or '').replace('\n', ' ')[:500])
else:
    print('NO_REVIEW')
"
```

If `NO_REVIEW`: request a review (Step 6). On first poll, write the current ISO timestamp to the temp file if it does not already exist:

```bash
[ -f /tmp/copilot-loop-{PR}.txt ] || date -u +%Y-%m-%dT%H:%M:%SZ > /tmp/copilot-loop-{PR}.txt
```

Schedule the next poll with `/after 1m #copilot-loop.prompt.md`. On each subsequent run, read the start time and compute elapsed minutes:

```bash
start=$(sed -n '1p' /tmp/copilot-loop-{PR}.txt)
echo $(( ( $(date -u +%s) - $(date -u -d "$start" +%s) ) / 60 ))
```

If ≥ 15 minutes have elapsed, reschedule with `/after 10m #copilot-loop.prompt.md` instead.

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

Clean if the array is empty or the `BODY:` line printed in Step 2 contains "generated no new comments".

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

If clean: do not schedule another run. Delete the temp file:

```bash
rm -f /tmp/copilot-loop-{PR}.txt
```

Emit the final report:

| Round | Finding | Status        | How handled | Evidence                       |
| ----- | ------- | ------------- | ----------- | ------------------------------ |
| 1     | ...     | fixed/refuted | ...         | thread id, commit SHA, or path |

## Step 4 — Process each inline comment

For each comment:

1. **Assess validity.** Read the referenced file and surrounding context. Is the concern real?

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Run:

   ```bash
   npm run done
   ```

3. **If invalid/refuted:** Note the reason. No code changes.

4. Add one row to the findings ledger for every comment you process. Include the review round, the finding, whether it was fixed or refuted, and how it was handled.

5. Commit all fixes together once all comments are processed:

   ```bash
   git add <changed files>
   git commit -m "fix(...): <description>"
   ```

## Step 5 — Push, reply, resolve

```bash
git push
```

**Reply in-thread to every comment:**

```bash
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Fixed in {SHA}. <one sentence summary>."
# or for refuted:
gh api repos/{owner}/{repo}/pulls/{PR}/comments/{COMMENT_ID}/replies \
  -X POST -f body="Not actioned: <reason>."
```

**Resolve every unresolved Copilot thread.** Get thread node IDs, including the author of the first comment so you can filter to Copilot-owned threads only:

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
