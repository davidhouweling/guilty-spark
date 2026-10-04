# Pull Request Review Scope

When performing code review or processing Copilot review findings, load and follow `.github/skills/code-review/SKILL.md` before assessing changes. Read the full PR description and verify the full connected PR stack, including relevant subsequent implementations. Keep findings appropriate to the current PR's scope; do not duplicate work already addressed later in the stack.

Coding agents must independently classify findings before editing. Significant changes to the intended approach require explicit human direction. Pause the loop even in auto mode or when the user is unavailable; silence or automated responses are not approval.

Assess cumulative changes across review rounds against the human-agreed approach, not only individual suggestions. New implementation mechanisms can be significant even when visible behavior stays the same. A review with no comments is not clean until the skill's Intent Preservation Check passes.
