---
name: pfe-scaffold
description: Interview-driven generator for a new conformant PFE (Platform Edge). Asks what the edge is (device type, available 4M axes, DX maturity), selects a conformance profile (full/forms/core/forwarder), then generates the complete deliverable set — edge.manifest.json, Tier-1 migrations, central catalog sync, Edge MCP tool stubs, and the six mandatory test categories — from the apps/edge/edge-ref template. Use when onboarding a new edge/PFE, when the user says "新しいPFE/エッジを追加", or when starting any apps/edge/<new-id> directory.
origin: IoTPF
---

# PFE Scaffold — flexibility in, conformance out

## Why this skill exists

PFEs are heterogeneous (CNC with waveforms, ZEVA-Form inspection sheets,
half-digitized lines, dumb forwarders — CLAUDE.md §1.1/§2.6). The conformance
contract adapts via **profiles** (`pfe-edge-mcp-toolset` §Conformance
profiles), but a human starting from a blank directory will still miss pieces:
the catalog sync, a bound, a test category, the manifest. This skill turns
"describe your edge" into a **complete, gate-passing deliverable set**, so
per-PFE design freedom never costs conformance.

Hard rule: **never generate from memory what the reference already encodes.**
`apps/edge/edge-ref/` is the executable template; copy and adapt it. The
deterministic gate (`scripts/validate-edge-mcp-conformance.js`) and the
`edge-mcp-toolset-reviewer` agent judge the result.

## Step 1 — Interview (AskUserQuestion; do not guess)

Ask, in one round if possible:

1. **What does the edge produce?**
   - High-frequency sensor/waveform data (vibration, current, force…)
   - Discrete events/measurements (cycle results, judgments)
   - Manual inspection records (ZEVA-Form 電子検査シート)
   - Nothing analyzable locally — it only forwards upstream
2. **Which 4M axes exist in its data?** material / person(man) / machine /
   method (work-order or program ID). Only declare what the device actually
   emits — an undeclared factor returns `supported: false`, never a fake 0.
3. **Local analysis capability now** (Flow B on this edge): yes / planned /
   never (forwarder).
4. **Location model**: fixed installation (inherit location from
   `me_edge_system` links) or per-row location column.
5. **Tier-2 mapping — decides ETL-eligibility** (iotpf-pfs-data-model.md R4;
   criterion is mappability, NOT granularity): which facts from this edge map
   into the frozen PFS standard schema — production output (`qty`),
   material / person / machine moves and state transitions, location? Those
   and **only** those become ETL-eligible `t1_*` event tables, designed
   backwards from their named `t2_*` targets and transition vocabulary.
   **Everything else — at any frequency** (per-second signal series, feature
   aggregates, device parameters, calibration records) — is `local-only`
   (retention / bounded-growth policy mandatory; never ETL'd to PFS).
6. **Auto-acquired quantity inventory → archetype mapping** (pfe-database.md
   §2.2; quantity-agnostic — vibration is only an example): list every
   automatically acquired quantity (temperature, humidity, pressure, current,
   clamp time 圧締時間, coating amount 塗布量, vibration, …) and map each to
   **A series** (continuous scalar samples → a `pfe_ops.channel` row on a
   shared series table, NOT a new table per quantity), **B cycle-bound value**
   (one row per work cycle, linked to the class-① event and carrying the
   applicable 4M axes), or **C frame** (waveform bursts, short retention).
   Declare `archetype=A|B|C|E` in each local-only table COMMENT (E = cycle detail,
   1 cycle = 1..N rows — SMT per-component mount, multi-spindle fastening,
   multi-point weld/inspection results).

## Step 2 — Select the profile (decision tree)

```
only forwards, no Tier-1 lake ────────────────→ forwarder
manual inspection records, no channels ───────→ forms
sensor/event data, local analysis yes ────────→ full
sensor/event data, analysis planned/not yet ──→ core   (upgrade path: additive)
```

State the chosen profile and its mandatory tool set to the user before
generating. Profiles are monotonic — starting at `core` and upgrading later
adds tools without reshaping anything.

## Step 3 — Generate the deliverable set (one MR, one deliverable)

Create `apps/edge/<edge_id>/` from `apps/edge/edge-ref/`, then adapt:

| Artifact | Source template | Adapt |
|---|---|---|
| `edge.manifest.json` | edge-ref's manifest | edge_id = directory name; profile from Step 2; `tools` = exactly the exposed set; `supported_4m_factors` from Step 1-2; **`datasets` = one entry per Tier-1 table** (see below); `notes` = why this profile + upgrade plan |

**Dataset declarations are part of the deliverable** (`pfe-edge-mcp-toolset`
§Edge manifest, spec 41 §2). For every Tier-1 table the interview produces, emit
a `datasets` entry with `dataset_id`, `table_name`, `grain`, **`read_with`**,
`filterable`, `measures` (with units), `retention` for volatile grains, a row
estimate, and a `description`. Ask for these during the interview — they are not
derivable from the DDL:

- **grain**: series (1 sample = 1 row) / frame (waveform burst) / cycle (1 work =
  1 row) / cycle_detail (1 work = 1..N rows, e.g. SMT per-component mount) /
  snapshot (device parameters, calibration, teaching conditions) / event (class ①).
- **filterable**: which columns the LLM may filter on. This is the whole
  predicate surface — anything omitted is unreachable, anything listed must exist
  in the Tier-1 DDL.
- **read_with**: must be a tool the edge actually ships. A dataset nothing can
  read fails the conformance gate.

Declaring a `grain: series` dataset makes `summarize_series` mandatory; any
Tier-1 lake makes `slice_dataset` mandatory.
| `migrations/t1_0001_init.sql` | edge-ref's | Tier-1 tables per Step 1: R4 class comment on EVERY table (ETL-eligible / `local-only:` / `pfe_ops`); **ETL-eligible tables MUST name their `t2_*` target tables + transition-vocabulary mapping in the declaration — cannot name a target ⇒ classify `local-only`**; required columns (UUID id, TIMESTAMPTZ, subject axes, location or documented inheritance, audit 8 + plant_code), TimescaleDB retention for local-only time series |
| `migrations/pfs_catalog_sync_0001.sql` | edge-ref's | `me_edge_primary_data_table/_column` rows for every Tier-1 table/column, `description NOT NULL` written for a reader who never saw the device; MCP endpoint + profile registration per iotpf-pfs-data-model.md R1 |
| `mcp/` server | edge-ref's `mcp/` | Keep only profile-mandated tools (omit, don't stub); `forms` replaces waveform tools with `query_inspection_records` (paginated, 4-axis-keyed); keep bounds/pagination/audit-log/health-gating seams untouched |
| `mcp/__tests__/` | edge-ref's 4 test files | All SIX mandatory categories (schema round-trip / bounds / pagination / idempotency / health gating / sovereignty negatives) + `catalog-consistency.test.js` re-pointed at this edge's migrations + capability-echo tests |
| `README.md` | edge-ref's | Synthetic-vs-production seams for THIS edge (DB adapter, mTLS, per-tool AuthZ) |

`forwarder` profile generates only: manifest, `pfe_ops` buffer schema (NO
`t1_*`, NO catalog rows), `edge_health` tool, S&F wiring notes — and routes
resilience review to `store-and-forward-validator`.

## Step 4 — Verify before offering the MR

Run, in order; all must pass:

```bash
node scripts/validate-edge-mcp-conformance.js   # manifest/profile/tools/catalog pairing
node --test apps/edge/<edge_id>/mcp/__tests__/  # six categories + catalog consistency
node scripts/self-heal.js --check               # nothing else drifted
```

Then apply the added-step workflow from `iotpf-agents-skills.md` §Edge/PFE:
`edge-mcp-toolset-reviewer` (judgment half: stub detection, description
quality, sovereignty intent) and, if gateway/S&F code was touched,
`store-and-forward-validator`.

## Step 5 — Record

- `apps/<project>/references/decisions.md`: record this PFE's table plan +
  profile, and update the `edge` area entry in `references/manifest.json`
  (same change set — CLAUDE.md §6).
- MR uses the checklist from `pfe-edge-mcp-toolset` §MR checklist.

## Anti-patterns

- Generating tools the edge cannot honestly serve (stub = lie to the LLM) —
  pick a smaller profile instead.
- Inventing a Tier-1 schema without the interview — the 4M axes and the
  Tier-2 mapping are user facts, not defaults.
- Classifying a table ETL-eligible because it "seems important" or "is
  low-frequency" — granularity is not the criterion; no named `t2_*` target
  means `local-only`, full stop.
- Writing catalog `description` as a restatement of the column name — describe
  meaning, unit, and origin for a stranger.
- Skipping the catalog-sync migration "for later" — it ships in the same MR
  (iotpf-pfs-data-model.md R3) or the gate fails.

## Related

- `pfe-edge-mcp-toolset` — the contract this scaffold satisfies (profiles,
  nine-tool full surface, transport/auth, six test categories).
- `apps/edge/edge-ref/` — the executable template.
- `scripts/validate-edge-mcp-conformance.js` — the deterministic gate.
- Agents: `edge-mcp-toolset-reviewer`, `store-and-forward-validator`,
  `database-reviewer`, `tier2-schema-freeze-enforcer` (parallel guard).
