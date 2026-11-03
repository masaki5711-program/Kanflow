# IoTPF / ZEVA-Link — Self-Healing & Self-Improving Development Loop

This rule defines **how agent-model development proceeds** as a closed PDCA
loop, so the model gets measurably better over time instead of drifting. It
binds the verification gates, the deterministic self-heal, and the learning
engines into one cadence: **OBSERVE → VERIFY → HEAL → IMPROVE → RECORD**.

| Stage | What | Driver |
|-------|------|--------|
| **OBSERVE** | Collect signals: gate failures, eval results, build/test errors, skill-run outcomes | `scripts/hooks/post-bash-error-memory.js`, `~/.claude/state/skill-runs.jsonl` |
| **VERIFY** | Run every gate: config conformance, routing, eval specs, asset inventory | `node scripts/self-heal.js --check` (umbrella; also the CI gate) |
| **HEAL** | Auto-fix deterministic drift **without judgment** (e.g. regenerate the asset inventory). Healed changes still pass VERIFY. | `node scripts/self-heal.js` |
| **IMPROVE** | The judgment / LLM half — diagnose gaps and propose fixes | live evals, `/skill-health`, `harness-optimizer` agent |
| **RECORD** | Make improvements durable and reviewable | `docs/agent-model-changelog.md` |

## When to run

- **Session start** and **before opening an MR**: `/self-heal` (or
  `node scripts/self-heal.js`). Fix red gates before doing feature work.
- **In CI**: `self-heal --check` runs on every MR and on `main` — drift or a
  broken gate cannot merge.
- **Autonomously** (the IMPROVE half): `/loop /self-improve` keeps one cycle
  running — verify + auto-heal, then on any remaining backlog delegate the
  judgment fix to the `harness-optimizer` agent, re-verify, and record.

## Principles

1. **Deterministic first, judgment second.** Anything fixable by code is
   auto-healed (`self-heal`); only genuine gaps go to the IMPROVE half. Never
   hand a machine-fixable problem to the LLM.
2. **Self-applied changes still pass the gates.** Healing and improvement are
   not exempt from VERIFY — a fix that breaks conformance is not a fix.
3. **Measure before you improve.** Wire eval scoring (`ECC_EVAL_LIVE=1`) and
   skill-run tracking; do not "improve" on vibes. No silent regressions.
4. **Record every change.** An improvement that isn't in
   `docs/agent-model-changelog.md` didn't happen — durability is what makes the
   loop compound across sessions and users.
5. **Human-in-the-loop boundaries are deliberate.** A human starts the
   autonomous loop and approves the resulting MR; sequencing is nudged, only
   the gates are hard-enforced.
6. **Data sovereignty holds inside the loop too.** Eval and improvement data
   are synthetic. Evaluation is unified on Claude Code; a `localOnly`
   (confidential) fixture is **skipped** from live scoring and never sent to
   any endpoint (CLAUDE.md §2). This applies to the eval harness only — the
   product's Flow B deep-dive LLM stays local (Ollama) per §1.4/§2.
