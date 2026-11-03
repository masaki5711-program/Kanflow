---
description: Audit this repository's Claude Code harness and return a prioritized scorecard.
---

# Harness Audit Command

Audit the current repository's Claude Code harness — agents, commands, skills,
rules, hooks, and settings — and return a prioritized, evidence-backed scorecard.

## Usage

`/harness-audit [scope]`

- `scope` (optional): `repo` (default), `hooks`, `skills`, `commands`, `agents`

## How It Runs

The audit is performed by inspecting the repository directly. There is no
external scoring binary, so the command stays portable in any project the
harness is copied into.

For a full `repo` audit, delegate to the **harness-optimizer** agent and ask it
to score the seven categories below. For a scoped audit (`hooks`, `skills`,
`commands`, `agents`), inspect only the matching directory yourself.

## Rubric

Score each category `0-10` from concrete file evidence. `repo` scope sums all
seven (max `70`); a scoped audit scores only its category.

1. **Tool Coverage** — Are agents/commands present for the project's languages
   and workflows? Gaps where a needed reviewer or build resolver is missing.
2. **Context Efficiency** — Rule/skill/`CLAUDE.md` size and redundancy. Penalize
   bloat, duplicated guidance, and unfocused files.
3. **Quality Gates** — PreToolUse/PostToolUse/Stop hooks wired in
   `.claude/settings.json` for format, lint, typecheck, tests.
4. **Memory Persistence** — the four memory roles are separated and each has
   exactly one home (CLAUDE.md §8): Auto Memory = durable facts,
   mistake-memory = error→fix pairs, session-end hook = ephemeral continuity,
   changelog/ADR = reviewed decisions. Penalize CLAUDE.md used as a memory
   surface or competing writers into one store.
5. **Eval Coverage** — Presence of tests for hook scripts and shared libs under
   `scripts/`.
6. **Security Guardrails** — Secret/no-verify/destructive-command guards in
   hooks; security rules under `.claude/rules/`.
7. **Cost Efficiency** — Model selection in agent frontmatter, cost-tracking
   hooks, context-budget discipline.

## Audit Steps

1. Resolve scope from `$ARGUMENTS` (default `repo`).
2. Enumerate the relevant directories: `.claude/agents/`, `.claude/commands/`,
   `.claude/skills/`, `.claude/rules/`, `scripts/hooks/`, `scripts/lib/`, and
   `.claude/settings.json`.
3. For each rubric category, gather concrete evidence (file paths, hook ids,
   missing pieces).
4. Score each category and list failed checks with exact paths.
5. Derive the top 3 highest-impact actions.

## Output Contract

Return:

1. `overall_score` out of `max_score` (`70` for `repo`; `10` for a scoped audit)
2. Per-category scores with concrete findings
3. Failed checks with exact file paths
4. Top 3 prioritized actions
5. Suggested skills/agents to apply next

## Example Result

```text
Harness Audit (repo): 61/70
- Tool Coverage:        10/10
- Context Efficiency:    8/10  — .claude/rules/ duplicates common/ guidance
- Quality Gates:        10/10
- Memory Persistence:    9/10
- Eval Coverage:         5/10  — no tests for scripts/hooks/
- Security Guardrails:  10/10
- Cost Efficiency:       9/10

Top 3 Actions:
1) [Eval Coverage] Add integration tests for scripts/hooks/*. (scripts/hooks/)
2) [Context Efficiency] Deduplicate rule guidance. (.claude/rules/)
3) [Tool Coverage] Add a language reviewer for the project's primary stack.
```

## Arguments

$ARGUMENTS:
- `repo|hooks|skills|commands|agents` (optional scope, default `repo`)
