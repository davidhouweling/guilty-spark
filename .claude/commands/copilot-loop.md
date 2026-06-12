# Copilot Review Loop

Processes the latest Copilot PR review: fixes valid issues, replies to all comments, resolves threads, then requests a new review. Copilot does **not** auto-fire on push — the user manually invokes this command each time they want to run a loop iteration.

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

If `NO_REVIEW`: request one (Step 4) and stop — tell the user to re-run `/copilot-loop` once the review arrives (may take up to a few hours).

## Step 2 — Check if the review is clean

Fetch the review's inline comments:

```bash
gh api "repos/{owner}/{repo}/pulls/{PR}/reviews/{REVIEW_ID}/comments"
```

**Clean** if the JSON array is empty (`[]`), OR if the review body contains "generated no new comments".

**If clean: stop and tell the user Copilot found no issues. The loop is complete.**

## Step 3 — Process each comment

For each inline comment from the review:

1. **Assess validity.** Read the referenced file and surrounding context. Is the concern real?

2. **If valid:** Fix the code. Add or update tests if the fix changes observable behaviour. Then:

   ```bash
   npm run done
   ```

   `npm run done` runs: prettier → typecheck → eslint --fix → vitest run related. Fix any errors it reports and re-run until clean.

3. **If invalid/refuted:** Note the reason clearly. Do not make code changes for this comment.

4. Commit all fixes together once all comments are processed:

   ```bash
   git add <changed files>
   git commit -m "fix(...): <description>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
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

**Request a new Copilot review:**

```bash
gh pr edit {PR} --add-reviewer copilot-pull-request-reviewer
```

The review may take up to a few hours to arrive. Stop here and tell the user to re-run `/copilot-loop` once the new review appears.

Note: `gh pr edit --add-reviewer copilot` and `gh pr edit --add-reviewer github-copilot` do not work (GraphQL cannot resolve those logins). Do **not** post `@copilot review` — that triggers the unrelated `copilot-swe-agent[bot]` bot.

## Repo-specific notes

- `npm run done` = prettier → typecheck (tsc + astro check) → eslint --fix → vitest run related
- Commit message format: `fix(scope): description` with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Owner: `davidhouweling`, Repo: `guilty-spark`
- ESLint rules to watch for: `strict-boolean-expressions`, `no-unnecessary-condition` — avoid redundant null checks and `??` on non-nullable types
- Always check `isResolved` before resolving a thread to avoid double-resolve errors
