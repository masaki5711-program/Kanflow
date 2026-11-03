---
description: Run the self-healing / self-improving development loop — verify all agent-model gates, auto-heal deterministic drift, and surface the improvement backlog.
allowed-tools: Bash
---

# /self-heal

Drives one turn of the agent model's PDCA loop (see
`.claude/rules/iotpf-self-improvement.md`). Run it at **session start** and
**before opening an MR**.

## Run

```bash
node scripts/self-heal.js          # verify + auto-heal deterministic drift + write health snapshot
node scripts/self-heal.js --check  # CI mode: verify only, no writes, fail on any drift
```

## What it does

1. **VERIFY** — runs every gate: config conformance, agent-model routing,
   eval specs, asset inventory.
2. **HEAL** — regenerates deterministic artifacts that drifted (e.g. the asset
   inventory) without asking. No LLM needed.
3. **REPORT** — writes `docs/agent-model-health.md` (runtime artifact) with the
   gate status and an **improvement backlog**.

## Then act on the backlog (the judgment / LLM half)

- `ECC_EVAL_LIVE=1 ECC_EVAL_ENDPOINT=… node scripts/run-evals.js` — score the
  domain-guard agents against their rubrics.
- `/skill-health` — skill success-rate trends, declining skills, amendments.
- Delegate to the **harness-optimizer** agent to tune the harness itself.

Record anything you change in `docs/agent-model-changelog.md`.
