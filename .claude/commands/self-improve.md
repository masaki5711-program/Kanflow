---
description: One autonomous self-improvement cycle — verify, auto-heal, and when a backlog remains, delegate the judgment fixes to the harness-optimizer agent, then re-verify and record. Built to run under /loop.
argument-hint: "[--apply]"
allowed-tools: Bash
---

# /self-improve

The autonomous IMPROVE half of the loop
(`.claude/rules/iotpf-self-improvement.md`). Run it once, or repeat it with
**`/loop /self-improve`** to keep the agent model self-correcting.

## Procedure (follow in order)

1. **Verify + auto-heal + get machine-readable status:**
   ```bash
   node scripts/self-heal.js --json
   ```
   This already healed deterministic drift (e.g. asset inventory). Parse the
   JSON: `ok`, `gates[]`, `healed[]`, `backlog[]`.

2. **If `ok === true`** and `backlog` is empty → report "healthy, nothing to
   improve" and STOP. (Under `/loop`, this is the steady state.)

3. **If `backlog` is non-empty** (a gate is failing in a way code can't auto-fix):
   - Delegate the fix to the **`harness-optimizer`** agent (or the agent that
     owns the failing area — e.g. a `*-reviewer` for a rules issue). Give it the
     `backlog` detail and these constraints:
     - Minimal diff; obey `CLAUDE.md` (no Tier-2 schema changes, data sovereignty,
       fail-open hooks, Conventional Commits).
     - Fix the root cause named in the backlog, nothing else.
   - Then **re-verify**: `node scripts/self-heal.js --check` must pass.

4. **Optionally run live evals** (quality regression). Evaluation is unified
   on Claude Code — there is no local-LLM eval path:
   ```bash
   ECC_EVAL_LIVE=1 node scripts/run-evals.js                                    # claude-cli (subscription auth)
   ECC_EVAL_LIVE=1 ECC_EVAL_PROVIDER=anthropic ECC_EVAL_MODEL=<id> node scripts/run-evals.js  # CI fallback (API key)
   ```
   Specs marked `localOnly` are SKIPPED from live scoring (never sent to any
   endpoint — CLAUDE.md §2). Eval regressions become new backlog items for
   step 3.

5. **RECORD** any change you made in `docs/agent-model-changelog.md` (newest
   first), then open an MR per `iotpf-git-workflow.md`.

## Notes

- Deterministic fixes are already applied by step 1 — never hand those to an
  agent.
- Self-applied fixes are NOT exempt from the gates: step 3 only "succeeds" when
  `self-heal --check` is green.
- Confidential (`localOnly`) eval fixtures are never live-scored — they are
  skipped, not routed to any endpoint. (Ollama is the *product's* Flow B
  deep-dive LLM, not part of this agent model's eval loop.)
