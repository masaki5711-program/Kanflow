---
description: Classify the system, check the premise, compare 2–3 options, recommend one, then plan it step by step. WAIT for user CONFIRM before touching any code.
---

# Plan Command

Invokes the **planner** agent (`.claude/agents/planner.md`) to decide the
approach and plan it before any code is written.

## What this command does

1. **Classify the system** — IoTPF `platform` / `integrated` / `none`, from
   `apps/<project>/references/manifest.json` → `"iotpf"` (or inferred and
   stated as an assumption). This decides which constraints apply.
2. **Check the premise** — restate the goal, test the requested solution's
   assumptions against the codebase, the product references, and the
   constraints for that class.
3. **Compare options** — the request as stated (A) plus genuinely different
   alternatives (B/C), on one table of shared axes.
4. **Recommend** — one option with decisive reasons, what would change it, and
   the decisions only the user can make (`undecided` areas are asked, not
   invented).
5. **Plan the recommended option** — independently mergeable phases, exact
   file paths, testing strategy, success criteria.
6. **Wait** — no code until you confirm.

## When to use

- Starting a new feature or a new system
- Architectural changes or complex refactoring
- Several files, layers, or systems are affected
- Requirements are unclear, or you suspect a better approach than the one you
  have in mind

## Responding to the plan

- `proceed` — implement the recommended option
- `option B` — re-plan with another option
- `modify: …` — change requirements or constraints
- `decide: …` — answer an open decision (record it in `decisions.md`)

## After planning

- `/tdd` to implement test-first
- `/build-fix` if the build breaks
- `/code-review` on the finished change
- For multi-session or multi-MR work, the `blueprint` skill; for a contested
  choice between options, the `council` skill.
