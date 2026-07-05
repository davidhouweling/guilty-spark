---
agent: agent
description: "Process the latest Copilot PR review: fix valid issues, reply to all comments, resolve threads, request a new review, poll every minute for up to 15 minutes, and reschedule itself with /after until the review is clean."
---

Run one iteration of the Copilot review loop on the current PR in the GitHub Copilot CLI interactive session. From the VS Code integrated terminal, start that session with `copilot`. Experimental scheduling must be enabled first with `/experimental on` or `--experimental`.

Keep the loop quiet between iterations. Do not give a per-iteration handoff message to the user. Instead, accumulate a running findings ledger in the session context. While waiting for a fresh Copilot review, poll the PR every 1 minute for up to 15 minutes using `/after 1m`. If no new review arrives in that window, fall back to `/after 10m`. Only when the review is clean should you produce the final report, including a markdown table of every Copilot review finding from the whole loop, whether it was fixed or refuted, and how it was handled.

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
else:
    print('NO_REVIEW')
"
```

If `NO_REVIEW`: request a review (Step 6) and schedule this same prompt again with `/after 1m`. Keep polling every minute until either a new review appears or 15 minutes have elapsed; if the 15-minute polling window expires with no new review, reschedule with `/after 10m`.

## Step 3 — Check if the review is clean

**Check 1 — inline comments on the PR review:**

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews/{REVIEW_ID}/comments"
```

Clean if the array is empty or the review body contains "generated no new comments".

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

If clean: stop scheduling, preserve the accumulated findings ledger, and emit the final report with a markdown table of all findings from the loop.

## Step 4 — Process each inline comment

For each comment:

1. **Assess validity.** Read the referenced file and surrounding context. Is the concern real?

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Run:

   ```bash
   npm run done
   ```

   (`npm run done` = prettier → typecheck → eslint --fix → vitest run related.) Fix any errors it reports and re-run until clean.

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

Note: `gh pr edit --add-reviewer copilot` and `gh pr edit --add-reviewer github-copilot` do not work — use `copilot-pull-request-reviewer` exactly. Do **not** post `@copilot review` — that triggers the unrelated `copilot-swe-agent[bot]` bot.

If the review is not clean, schedule the next iteration with `/after 1m` while you are still within the 15-minute polling window; otherwise schedule with `/after 10m`. Do not give a user-facing handoff.

If the review is clean, do not schedule another run. Produce the final report only once, with this shape:

| Round | Finding | Status        | How handled | Evidence                                |
| ----- | ------- | ------------- | ----------- | --------------------------------------- |
| 1     | ...     | fixed/refuted | ...         | thread id, commit SHA, or relevant path |

## How To Start

In the VS Code integrated terminal, run `copilot` to open the interactive CLI session, then enable experimental scheduling:

```copilot
/experimental on
```

After that, run this prompt once and let the loop reschedule itself with `/after 1m` while polling for up to 15 minutes, then `/after 10m` if no new review appears.

## Repo-specific notes

- Owner: `davidhouweling`, Repo: `guilty-spark`
- `npm run done` = prettier → typecheck (tsc + astro check) → eslint --fix → vitest run related
- Commit message: `fix(scope): description`
- ESLint rules to watch: `strict-boolean-expressions`, `no-unnecessary-condition`
- Always check `isResolved` before resolving a thread to avoid errors
