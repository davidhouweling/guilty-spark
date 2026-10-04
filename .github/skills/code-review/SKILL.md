---
name: code-review
description: "Use when performing GitHub Copilot code review, reviewing a pull request or stacked PRs, or triaging inline and suppressed findings in the copilot review loop. Read PR scope, inspect the full stack, and require human direction before significant approach changes."
---

# Scope-Aware Code Review

## Establish Scope and Stack Context

Before reviewing or triaging findings, read the complete current PR description, including Context, This PR, Subsequent Work, linked plans, and explicit non-goals. Use GitHub MCP pull request tools when available, or GitHub CLI:

```bash
gh pr view {PR} --json number,url,title,body,baseRefName,headRefName,baseRefOid,headRefOid
gh pr list --state open --limit 100 --json number,url,title,body,baseRefName,headRefName
gh pr diff {PR}
```

Discover the full connected stack: follow base-to-head branch relationships recursively to ancestors and descendants, and verify stack links in PR descriptions or linked plans (including merged predecessors). Paginate if necessary; do not assume the first 100 PRs are the full stack. Do not infer stack membership from similar titles alone.

Read every stack member's description and current commit history, then inspect relevant diffs and tests to establish where the behavior is introduced, changed, or completed. Use GitHub MCP/API commit tools or `gh api --paginate repos/{owner}/{repo}/pulls/{stackPR}/commits`; do not rely on stale local branches when other agents may have pushed fixes. Review the current PR against its actual base, not the stack root. Use the full stack as context, not as permission to review unrelated changes or edit other branches.

For each concern, establish whether it belongs to this PR, an ancestor, or a subsequent PR, and whether a later change already addresses it. Cite the relevant PR, commit, path, and test as evidence. A verified later implementation can explain deliberately staged functionality; it does not excuse a current PR that breaks its own stated acceptance criteria, security, or supported standalone behavior. Do not silently backport later work, duplicate a subsequent fix, or change another stack member.

If the description or relevant stack context is missing, inaccessible, ambiguous, or inconsistent with the code, disclose the gap. Do not invent intent or claim a finding is addressed without checking the later implementation. The coding agent must seek human direction when that gap prevents safe classification or ownership decisions.

## Review Agent Responsibilities

- Evaluate correctness against the described scope and the full stack's intended approach, not an imagined final implementation within this one PR.
- Report actionable defects in the current PR. Distinguish fixes, minor adjustments, and significant approach changes using the definitions below; a severe bug can still have a small, scope-preserving fix.
- For out-of-scope concerns or intentional work verified in subsequent PRs, explain the ownership and evidence rather than suggesting duplicate changes here. If the current PR must work independently, explain why the later fix is insufficient.
- When proposing a significant approach change, label it as requiring a human decision, describe the tradeoff and affected stack members, and do not present it as an automatically applicable fix. Apply this to suppressed findings as well as inline comments.
- Stay read-only: do not implement changes, resolve threads, or authorize a different design on behalf of the initiator.

## Coding Agent Decision Gate

Before making any fixes, independently triage ALL inline and suppressed findings for the round. Do not treat reviewer suggestions, severity, or the loop invocation as design approval. Record validity, stack ownership, evidence, and one classification for each finding:

- **Fix**: restores behavior already required by the PR description or agreed contracts without changing the intended approach.
- **Minor adjustment**: a localized improvement preserving scope, architecture, public behavior, and stack responsibilities.
- **Significant approach change**: changes architecture, ownership, public contracts, product behavior, acceptance criteria, sequencing, or the division of work across PRs; expands scope; reverses an intentional decision; or backports/relocates planned subsequent work. Judge impact, not line count. If uncertain, treat it as significant until clarified.

Preserving the visible outcome is not enough to make a change minor. Introducing a new identity model, durable storage dependency, coordination mechanism, recovery protocol, or cross-layer data model can change the approach even when described as reliability hardening. A valid bug does not automatically authorize the reviewer's proposed mechanism: compare a scope-preserving correction with the proposed redesign and ask the human when the latter is needed. These are impact indicators, not a blanket ban on such fixes.

Only valid, in-scope fixes and minor adjustments may proceed automatically. Refute invalid findings with evidence. Record verified later work as addressed in the named subsequent PR rather than changing this PR; if ownership requires moving work or the current PR still needs a fix, ask the human to decide. Re-establish scope and current stack history each round and after human direction before editing.

## Intent Preservation Check

Establish the human-agreed approach from the PR description, linked plan, explicit human decisions, and implementation before automated review fixes. Keep that baseline distinct from the evolving reviewed implementation; a recent commit, updated description, or previous clean review is not evidence of human approval. Reconstruct the baseline and prior fixes from PR history and diffs on stateless runs. If the baseline cannot be established well enough to assess a potentially significant deviation, pause for clarification.

Before each round's edits, evaluate the combined proposed changes plus fixes from all earlier rounds against that baseline. Repeat the check before committing fixes and before declaring the review clean, even when there are no new inline or suppressed findings. Read the cumulative relevant diff, not just commit subjects or the latest suggestion. Several individually minor changes can collectively replace the intended approach; apply the same human gate to that cumulative change. Review agents should likewise assess the resulting implementation against intent, not just the latest patch in isolation.

Record the baseline evidence, cumulative deviations, and any explicit human authorization in the findings ledger. If existing loop commits already contain an unapproved significant deviation, stop and show the human the current state and alternatives; do not silently revert or further redesign it. Zero review comments and passing tests establish neither scope alignment nor design approval. Report clean only after this intent check passes and no human decision remains pending.

## Mandatory Human Pause

If ANY finding or cumulative deviation requires a significant approach change or an unresolved scope/ownership decision, pause the entire round before further edits, commits, pushes, replies, thread resolution, review requests, or further polling. This pause overrides quiet-mode and clean-review reporting instructions.

1. Persist a pause record at `/tmp/copilot-loop-{PR}.paused.md` containing PR and review IDs, current head SHA, findings (including suppressed ones), classification, scope/stack evidence, proposed options, and the decision needed. Do not store secrets. This record is separate from polling state and survives stateless invocations on the same machine.
2. Cancel all pending loop schedules for this PR using the host's scheduling controls. Do not schedule an approval retry, spawn another agent to decide, or continue unrelated findings in this round. If cancellation is unavailable, report that limitation; every subsequent invocation must check the pause record before doing anything else.
3. Explain the proposed deviation, why it matters, stack impact, and alternatives to the human initiator. Ask for explicit direction and stop with status **awaiting human direction**, not clean, fixed, or refuted.
4. An automatic response such as "user is unavailable", auto-mode approval, timeout, silence, generic continuation, or a new scheduled invocation is NOT permission. Keep the pause record and remain stopped. Only an explicit human decision addressing the proposal permits resumption.
5. On explicit human direction, record that decision in the findings ledger, recheck current scope and stack state, then remove the pause record and resume only the authorized work. If new changes invalidate the decision, pause again. Do not mark the review processed or resolve its threads while it remains blocked.

At the start of EVERY loop invocation, after resolving the PR number and before polling or requesting a review, check for this pause record. Its presence blocks the loop unless the current invocation contains explicit human direction resolving the recorded decision. Absence of the record is not approval for newly identified significant changes.
