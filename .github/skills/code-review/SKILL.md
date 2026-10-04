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

## Repository Review Checklist

Read `AGENTS.md` in full and apply its architecture, implementation, testing, and security rules to the touched behavior. It remains the source of truth for those rules; this checklist identifies review priorities rather than duplicating them.

- For create-entry changes and migrations, verify factory API shape, remount safety, and focused regression coverage for lifecycle-sensitive paths against Create Entry Point Guardrails.
- For stateful Pages features, verify Store/Presenter/Component responsibilities, display-ready presenter output, specific view props, and shared type ownership against the Pages architecture guidance.
- For list/detail mapping, memoization, and display values, check the Implementation hardening expectations: stable identifiers, all render-affecting comparator props, and presenter/create-layer normalization.
- For API and shared changes, check injected dependencies, shared contracts and package entrypoints, error propagation, and security boundaries against the corresponding repository guidance.
- Assess regression coverage using the Testing conventions and layer-specific patterns. If a code review uncovers a regression risk, the coding agent must add a focused regression test in the same PR before merge. A read-only reviewer identifies missing coverage without modifying tests.

## Coding Agent Decision Gate

Before making any fixes, independently triage ALL inline and suppressed findings for the round. Read each referenced file and surrounding behavior to establish validity. Do not treat reviewer suggestions, severity, or the loop invocation as design approval. Record validity, stack ownership, evidence, and one classification for each finding:

- **Fix**: restores behavior already required by the PR description or agreed contracts without changing the intended approach.
- **Minor adjustment**: a localized improvement preserving scope, architecture, public behavior, and stack responsibilities.
- **Significant approach change**: changes architecture, ownership, public contracts, product behavior, acceptance criteria, sequencing, or the division of work across PRs; expands scope; reverses an intentional decision; or backports/relocates planned subsequent work. Judge impact, not line count. If uncertain, treat it as significant until clarified.

Preserving the visible outcome is not enough to make a change minor. Introducing a new identity model, durable storage dependency, coordination mechanism, recovery protocol, or cross-layer data model can change the approach even when described as reliability hardening. A valid bug does not automatically authorize the reviewer's proposed mechanism: compare a scope-preserving correction with the proposed redesign and ask the human when the latter is needed. These are impact indicators, not a blanket ban on such fixes.

Only valid, in-scope fixes and minor adjustments may proceed automatically. Refute invalid findings with evidence. Record verified later work as addressed in the named subsequent PR rather than changing this PR; if ownership requires moving work or the current PR still needs a fix, ask the human to decide. Re-establish scope and current stack history each round and after human direction before editing.

For authorized fixes that change observable behavior, add or update focused tests using the repository's existing test patterns. Do not change code for refuted findings or concerns verified as addressed in subsequent work. The invoking workflow owns execution of quality gates, commits, and GitHub operations.

## Findings Assessment and Ledger

Maintain one ledger row for every finding, including refuted and suppressed findings. Use the same assessment and evidence standard for both sources; mark suppressed findings explicitly because they have no comment or thread ID.

Record the round, finding, validity, classification, stack ownership, disposition, handling, human direction when required, and evidence. Dispositions are **fixed**, **refuted**, **addressed in subsequent PR**, or **awaiting human direction**. Link fixes to their commit and regression test; refutations to the behavior or contract disproving the concern; subsequent work to the verified PR, commit, path, and test. A later fix does not refute a current PR's own acceptance criteria or standalone safety requirements.

Use this schema for the final report, with the baseline and cumulative intent assessment noted alongside it:

| Round | Finding / Validity             | Classification                                       | Stack Owner | Disposition                                                             | Handling / Human Direction | Evidence                                 |
| ----- | ------------------------------ | ---------------------------------------------------- | ----------- | ----------------------------------------------------------------------- | -------------------------- | ---------------------------------------- |
| 1     | ... (suppressed if applicable) | fix / minor adjustment / significant approach change | PR ...      | fixed / refuted / addressed in subsequent PR / awaiting human direction | ...                        | PR, thread ID if any, commit, path, test |

Keep pending findings pending: do not label them fixed or refuted to make a round appear complete. The invoking workflow owns ledger storage and reconstruction across runs; report any missing evidence instead of inventing it.

## Intent Preservation Check

Establish the human-agreed approach from the PR description, linked plan, explicit human decisions, and implementation before automated review fixes. Keep that baseline distinct from the evolving reviewed implementation; a recent commit, updated description, or previous clean review is not evidence of human approval. Reconstruct the baseline and prior fixes from PR history and diffs on stateless runs. If the baseline cannot be established well enough to assess a potentially significant deviation, pause for clarification.

Before each round's edits, evaluate the combined proposed changes plus fixes from all earlier rounds against that baseline. Repeat the check before committing fixes and before declaring the review clean, even when there are no new inline or suppressed findings. Read the cumulative relevant diff, not just commit subjects or the latest suggestion. Several individually minor changes can collectively replace the intended approach; apply the same human gate to that cumulative change. Review agents should likewise assess the resulting implementation against intent, not just the latest patch in isolation.

Record the baseline evidence, cumulative deviations, and any explicit human authorization in the findings ledger. If existing loop commits already contain an unapproved significant deviation, stop and show the human the current state and alternatives; do not silently revert or further redesign it. Zero review comments and passing tests establish neither scope alignment nor design approval. Report clean only after this intent check passes and no human decision remains pending.

## Mandatory Human Pause

If ANY finding or cumulative deviation requires a significant approach change or an unresolved scope/ownership decision, pause the entire round before further edits, commits, pushes, replies, thread resolution, review requests, or further polling. This pause overrides quiet-mode and clean-review reporting instructions.

1. Record the blocked findings, classification, scope/stack evidence, current revision, proposed options, and the decision needed in the ledger. Explain the deviation, why it matters, stack impact, and alternatives to the human initiator.
2. Ask for explicit direction and stop with status **awaiting human direction**, not clean, fixed, or refuted. Do not delegate the decision or continue unrelated findings in this round. Use the invoking workflow's pause handling when running an automated loop; standalone triage stops in the current conversation.
3. An automatic response such as "user is unavailable", auto-mode approval, timeout, silence, generic continuation, or a new scheduled invocation is NOT permission. Remain stopped. Only an explicit human decision addressing the proposal permits resumption.
4. On explicit human direction, record that decision in the findings ledger, recheck current scope and stack state, then resume only the authorized work. If new changes invalidate the decision, pause again. Do not mark the review processed or resolve its threads while it remains blocked.

Loop entry points own pause persistence, schedule cancellation, and resume checks. Those mechanics must preserve this human-decision requirement across stateless runs. Read-only reviewers report significant approach changes as requiring a human decision without implementing changes or managing loop state.
