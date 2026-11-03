---
description: Legacy slash-entry shim for parallel-worktrees and autonomous-agent-harness. Prefer the skills directly.
---

# Orchestrate Command (Legacy Shim)

Use this only if you still invoke `/orchestrate`. The maintained orchestration
guidance lives in `skills/parallel-worktrees/SKILL.md` and
`skills/autonomous-agent-harness/SKILL.md`.

## Canonical Surface

- Prefer `parallel-worktrees` for parallel sessions, worktrees, and multi-agent splits.
- Prefer `autonomous-agent-harness` for longer-running loops, governance,
  scheduling, and control-plane style execution.
- Keep this file only as a compatibility entry point.

## Delegation

Apply the orchestration skills instead of maintaining a second workflow spec
here.

- Start with `parallel-worktrees` for split/parallel execution.
- Pull in `autonomous-agent-harness` when the user is really asking for
  persistent loops, governance, or operator-layer behavior.
- For a multi-agent feature/bugfix/refactor/security pass, run the relevant
  reviewer agents (`code-reviewer`, `security-reviewer`, `architect`, …) and
  keep handoffs concise — focus on what the next agent needs.
- Let the skills define the maintained sequencing rules.

## Arguments

$ARGUMENTS:
- `feature <description>` - Full feature workflow
- `bugfix <description>` - Bug fix workflow
- `refactor <description>` - Refactoring workflow
- `security <description>` - Security review workflow
- `custom <agents> <description>` - Custom agent sequence

## Custom Workflow Example

```
/orchestrate custom "architect,tdd-guide,code-reviewer" "Redesign caching layer"
```
