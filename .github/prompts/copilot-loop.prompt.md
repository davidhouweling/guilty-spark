---
agent: agent
description: "Process the latest Copilot PR review: fix valid issues, reply to all comments, resolve threads, then report whether the loop is done or should be re-run."
---

Run one iteration of the Copilot review loop on the current PR. At the end, tell me whether Copilot is satisfied or I should re-run this prompt after waiting for a new review.

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

If `NO_REVIEW`: push the current branch if there are unpushed commits, then stop and tell me to re-run this prompt in 10 minutes (Copilot auto-reviews on push).

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

**If clean: stop. Tell me Copilot found no issues and the loop is complete.**

## Step 4 — Process each inline comment

For each comment:

1. **Assess validity.** Read the referenced file and surrounding context. Is the concern real?

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Run:

   ```bash
   npm run done
   ```

   (`npm run done` = prettier → typecheck → eslint --fix → vitest run related.) Fix any errors it reports and re-run until clean.

3. **If invalid/refuted:** Note the reason. No code changes.

4. Commit all fixes together once all comments are processed:

   ```bash
   git add <changed files>
   git commit -m "fix(...): <description>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
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

**Resolve every thread.** Get thread node IDs:

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

Resolve each unresolved thread for the comments just replied to:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "{NODE_ID}"}) { thread { isResolved } } }'
```

## Step 6 — Request review and hand back

`copilot-pull-request-reviewer` auto-fires on every push, so after `git push` no explicit trigger is usually needed. If no new commit was pushed this iteration (all comments refuted), request a review manually:

```bash
gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
```

Do **not** post `@copilot review` — that triggers the separate `copilot-swe-agent[bot]` (tests/lint only, issue comment response), causing two simultaneous reviews. Stick to one trigger.

Note: `gh pr edit --add-reviewer copilot` and `gh pr edit --add-reviewer github-copilot` do not work — use `copilot-pull-request-reviewer` exactly.

**Report back:**

If a new commit was pushed:
> "Done. Fixes committed as {SHA} and pushed. Copilot will auto-review — re-run this prompt in ~10 minutes."

If all comments were refuted (no new commit):
> "Done. All comments refuted — no code changes. Review requested from `copilot-pull-request-reviewer` (may take up to a few hours). Re-run this prompt when the review appears."

## Repo-specific notes

- Owner: `davidhouweling`, Repo: `guilty-spark`
- `npm run done` = prettier → typecheck (tsc + astro check) → eslint --fix → vitest run related
- Commit message: `fix(scope): description` + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- ESLint rules to watch: `strict-boolean-expressions`, `no-unnecessary-condition`
- Always check `isResolved` before resolving a thread to avoid errors
