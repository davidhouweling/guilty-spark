# Copilot Review Loop

Runs a continuous fix-and-re-review loop against GitHub Copilot on the current PR until Copilot reports no new issues.

## Setup

Identify the current PR number:

```bash
gh pr view --json number --jq '.number'
```

Use that number throughout (referred to as `{PR}` below).

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
    print(last['id'], last['submitted_at'], last['commit_id'][:8])
else:
    print('NO_REVIEW')
"
```

Record the latest review ID. If `NO_REVIEW`, request one (Step 4) then schedule a 10-minute wakeup.

## Step 2 — Check if the review is clean

Fetch the review's inline comments:

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews/{REVIEW_ID}/comments"
```

**Clean** if the JSON array is empty (`[]`), OR if the review body contains "generated no new comments".

Also check for a `copilot-swe-agent[bot]` issue comment that appeared after the last push:

```bash
gh api "repos/{owner}/{repo}/issues/{PR}/comments?per_page=100" | python3 -c "
import json, sys
comments = json.load(sys.stdin)
for c in reversed(comments):
    if 'copilot-swe-agent' in c.get('user', {}).get('login', ''):
        print(c['body'][:200])
        break
"
```

If the latest `copilot-swe-agent` comment body contains any of: `clean`, `no issues`, `good to merge`, `no new comments`, `all.*tests pass` — treat as clean.

**If clean: stop and tell the user Copilot found no issues. The loop is complete.**

## Step 3 — Process each comment

For each inline comment from the review:

1. **Assess validity.** Read the file and surrounding context. Determine if the concern is real.

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Then:

   ```bash
   npm run done
   ```

   `npm run done` runs: prettier → typecheck → eslint --fix → vitest run related. Fix any errors it reports and re-run until clean.

3. **If invalid/refuted:** Note the reason clearly. Do not make code changes for this comment.

4. Commit all fixes together:

   ```bash
   git add <changed files>
   git commit -m "fix(...): <description>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```

## Step 4 — Push, reply, resolve, re-request

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

**Resolve every thread** via GraphQL. First get thread node IDs:

```bash
gh api graphql -f query='
{
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {PR}) {
      reviewThreads(last: 20) {
        nodes {
          id
          isResolved
          comments(first: 1) { nodes { databaseId } }
        }
      }
    }
  }
}'
```

Then resolve each unresolved thread for the comments you just replied to:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "{NODE_ID}"}) { thread { isResolved } } }'
```

**Triggering a new Copilot review:**

After `git push`, request a review immediately:

```bash
gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
```

This works but the review from `copilot-pull-request-reviewer` may arrive with a significant delay (potentially hours, not minutes). It is still the correct command to use.

For a faster sanity check while waiting, also post:

```bash
gh pr comment {PR} --body "@copilot review"
```

This triggers `copilot-swe-agent[bot]` within ~5 minutes. If it replies with clean language (see Step 2), and no new `copilot-pull-request-reviewer` review has appeared, treat the loop as complete.

Note: `gh pr edit --add-reviewer copilot` and `gh pr edit --add-reviewer github-copilot` do not work (GraphQL cannot resolve those logins).

## Step 5 — Wait and loop

Schedule a wakeup for **10 minutes**. On wakeup, go back to Step 1.

- Check both `copilot-pull-request-reviewer` PR reviews AND `copilot-swe-agent[bot]` issue comments (Step 2).
- If `copilot-swe-agent` says clean and no new `copilot-pull-request-reviewer` review has appeared → stop, the loop is complete.
- If no response from either after 10 minutes, wait **5 more minutes** then check once more.
- If still nothing after 15 minutes total: stop and inform the user (the `copilot-pull-request-reviewer` review may arrive hours later — it was successfully requested).

## Repo-specific notes

- `npm run done` = prettier → typecheck (tsc + astro check) → eslint --fix → vitest run related
- Commit message format: `fix(scope): description` with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Owner: `davidhouweling`, Repo: `guilty-spark`
- ESLint rules to watch for: `strict-boolean-expressions`, `no-unnecessary-condition` — avoid redundant null checks and `??` on non-nullable types
- Always check the thread resolution status before resolving to avoid double-resolve errors
