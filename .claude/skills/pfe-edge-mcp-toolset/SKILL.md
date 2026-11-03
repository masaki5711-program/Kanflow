---
name: pfe-edge-mcp-toolset
description: When creating or modifying a PFE (Platform Edge) database — Tier-1 schema, edge data lake, on-site connector — MUST also design and ship the corresponding Edge MCP analysis toolset. Enforces CLAUDE.md §1.4 Flow B (anomaly → integration LLM → Edge MCP → on-request raw analysis) and §2.1 (raw stays on the edge — central-lake performance contract). Triggered by edits to apps/edge/, migrations/t1_*, or any PFE schema/data-lake file.
origin: IoTPF
---

# PFE Edge MCP Toolset — Mandatory Companion to Every PFE DB

## Why this skill exists

CLAUDE.md §1.4 defines two data flows:

- **Flow A (always-on)**: edge → gateway → integrated data lake. Decimated.
- **Flow B (anomaly only)**: ZEVA-Engine detects → integration-side LLM calls the **edge's Edge MCP server as a tool** → edge runs raw-waveform / 4M analysis on request → returns context to the LLM.

**Flow B is the only correct path for raw-data analysis** because §2.1 (monitor light) keeps full-rate raw data off the central lake and the factory LAN — a **performance contract**, not a secrecy rule: everything runs on-prem, so raw data reaching PFS is not a confidentiality problem; the lake simply must not absorb it wholesale. §2.2 (sovereignty) separately forbids any egress *outside* the on-prem boundary. There is no path where central code reaches into the edge DB directly. The Edge MCP server is the seam.

Therefore: **a PFE DB without its companion Edge MCP server is architecturally incomplete and must not ship.** Building only the DB creates a tempting back-door — operators or future code will reach into raw tables directly, violating the §2.1 performance contract and bypassing the reviewed seam.

This skill is the contract that "PFE DB" and "Edge MCP analysis toolset" are one deliverable.

## When this skill MUST be applied

Apply this skill whenever any of the following are touched:

- `apps/edge/**` — PFE source code.
- `migrations/**/t1_*.sql` or any Tier-1 schema migration (per CLAUDE.md §3, Tier-1 = device-specific raw, stored on PFE).
- Edge data-lake configuration (TimescaleDB partitions, retention, downsampling rules).
- ETL 1→2 code that reads Tier-1 (must be reachable through an MCP tool, not by central queries).
- Any new "I want to query raw edge data from L3" requirement — that **always** maps to "add a tool to the Edge MCP server", never to a direct DB connection.

If a change touches the above but adds no corresponding MCP tools, the MR must be flagged in review as architecturally incomplete.

## How the LLM resolves and understands an edge (no DB knowledge required)

The integration LLM never reads a PFE's `information_schema` and never opens a
DB connection. Its understanding comes from three layers:

1. **Registry resolution** — a ZEVA-Engine event's `target_edge_id` is
   `pfs.me_edge_system.edge_system_id`. The registry row resolves to that
   edge's MCP endpoint (mTLS). The `pfe_db_*` credential columns in
   `me_edge_system` are provisioning/ETL-boundary metadata — **never a data
   path for L3 or LLM code** (see
   [iotpf-pfs-data-model.md](../../rules/iotpf-pfs-data-model.md) §5 R2).
2. **Normalized toolset** — the eleven tools below are identical on every edge,
   so the LLM needs no per-edge schema knowledge to start.
3. **Self-description** — instance-specific facts come from discovery tools:
   `list_channels` (sensors) and `describe_local_data` (this edge's Tier-1
   tables/columns **including device-specific optional columns**), which must
   agree with the central catalog `pfs.me_edge_primary_data_table/_column`.

## Conformance profiles — PFEs differ; the interface contract adapts

PFEs are heterogeneous by design (CLAUDE.md §1.1 "DX is an accelerator, not a
prerequisite"; §2.6 graceful degradation; §1.5 dumb-forwarder exception). A
uniform 9-tool mandate would either block low-DX edges from onboarding or
breed stub tools that lie to the LLM. Instead, **every PFE declares exactly
one conformance profile**, and the mandatory tool surface follows the profile:

| Profile | Typical PFE | Mandatory tools | Notes |
|---|---|---|---|
| **full** | Sensor/CNC edge with local Flow B analysis (Tier-1 lake, waveforms) | All 11 tools below | The reference: `apps/edge/edge-ref` |
| **forms** | ZEVA-Form 電子検査シート / manual-inspection edge (no waveforms, no channels) | 9 = all except `raw_waveform_query`, `list_channels`; plus a `query_inspection_records` tool (paginated, 4-axis-keyed) | `compute_4m_correlation` runs on inspection records |
| **core** | Any edge with a Tier-1 lake but no analysis capability yet (transitional DX) | `edge_health`, `describe_local_data`, `slice_by_4axis`, `slice_dataset` | Upgrade path to full/forms is additive |
| **forwarder** | Dumb forwarder (CLAUDE.md §1.5 exception: SQLite buffer only, **no Tier-1 lake**) | `edge_health` only | No catalog entries (nothing to catalog); no MCP DB tools |

Rules:

- **`edge_health` is universal** — every profile, no exception (§1.5
  observability). **`describe_local_data` and `slice_dataset` are mandatory
  wherever a Tier-1 lake exists** (core/forms/full) — self-description is what
  lets one central LLM handle heterogeneous edges, and `slice_dataset` is what
  makes the described data actually readable. Declaring a dataset no tool can
  read is a conformance failure.
- **`summarize_series` is mandatory exactly when the edge declares a
  `grain: series` dataset** — conditional on data, not on profile.
- **Declare, don't stub.** A tool that cannot work on this edge class is
  *omitted by profile*, never shipped as a fake that returns empty/zero
  results. An LLM that calls a stub reasons from lies.
- **Profiles are monotonic.** Moving up (forwarder→core→forms/full) only adds
  tools; nothing is removed or reshaped — central code never breaks when an
  edge is upgraded.
- The profile is declared in the **edge manifest** (below) and echoed at
  runtime by `describe_local_data` (or `edge_health` for forwarder).

### Edge manifest (`edge.manifest.json`) — machine-checkable declaration

Every edge under `apps/edge/<edge_id>/` MUST carry an `edge.manifest.json`:

```jsonc
{
  "edge_id": "edge-ref",            // matches directory name
  "profile": "full",                // full | forms | core | forwarder
  "tools": ["raw_waveform_query", "..."],   // every tool actually exposed
  "supported_4m_factors": ["material", "person", "machine"], // omit "method" if no data
  "datasets": [ /* same shape as describe_local_data.datasets — spec 41 §2 */ ],
  "notes": "why this profile; what upgrade is planned"
}
```

`datasets` is **required once the edge has any `t1_*` migration** (a forwarder
has no lake and declares none). The manifest is the design-time declaration and
`describe_local_data.datasets` is its runtime echo — drift between them is a
defect, exactly like catalog drift.

The manifest is the design-time capability declaration, verified
deterministically by `scripts/validate-edge-mcp-conformance.js` (a self-heal /
CI gate): profile validity, mandatory-tools-for-profile presence in the MCP
sources, and Tier-1-migration ⇒ catalog-sync pairing. The runtime echo
(`describe_local_data.capabilities`) must agree with it — drift is a defect,
same as catalog drift.

## Required tools (per-profile minimum surface)

The eleven tools below are the **full-profile** surface; other profiles take the
subset defined above. Names and shapes are normative; argument and return field names may be adjusted only if documented in the MR description.

> **Tier-1 local-data access (2026-09-10) — see
> [`docs/spec/IoT.md/41-edge-mcp-local-data-access.md`](../../../docs/spec/IoT.md/41-edge-mcp-local-data-access.md).**
> These nine were designed around class-① shaped data plus the reference edge's
> two class-② tables, and do not reach arbitrary edge-resident data: `slice_by_4axis`
> has no argument naming what to read, non-timeseries class ② has no owning tool,
> `raw_waveform_query` is fixed to a single scalar series, there is no aggregate
> tool, and `compute_4m_correlation` is fixed to the four 4M factors.
> The spec adds, **normatively**:
> - **Dataset declaration** in `describe_local_data.datasets` — every class ①/②
>   table declares `dataset_id`, `grain` (series | frame | cycle | cycle_detail |
>   event | snapshot), **`read_with` (which tool reads it — mandatory; declaring a
>   dataset no tool can read is a conformance failure)**, `filterable`, `measures`
>   (units), `retention`, and a row estimate.
> - **`slice_dataset`** (10th) — reads any tabular class ② by declared keys.
>   Predicates limited to eq/ne/in/gte/lte/between over `filterable` columns only;
>   no free-form predicates (that would hollow out the seam).
> - **`summarize_series`** (11th) — bucketed statistics (count/min/max/mean/stddev/
>   p50/p95, **fixed set**) over ≤8 channels; gaps reported, never zero-filled.
>   Call it **before** `raw_waveform_query`.
> - `raw_waveform_query` gains `mode: 'series'|'frame'`, multi-channel
>   `channel_ids` (≤8), and frame bodies only when explicitly requested.
> - `compute_4m_correlation` gains `extra_factors` (declared device-specific
>   stratification keys) and a mandatory sample size `n` per factor.
> - **Archetype E (cycle detail, 1 cycle = 1..N rows)** in `pfe-database.md` §2.2.
>
> `slice_dataset` is mandatory wherever a Tier-1 lake exists (same standing as
> `describe_local_data`); `summarize_series` is mandatory on any edge declaring a
> `grain: series` dataset.

### 1. `raw_waveform_query`

Fetch raw waveform / high-frequency timeseries for a single channel within a bounded time window.

```ts
inputSchema: {
  channel_id:   string,           // required, validated against list_channels
  time_from:    string,           // ISO 8601, timezone-aware (CLAUDE.md §3)
  time_to:      string,           // ISO 8601, timezone-aware
  max_samples?: number,           // default 50_000, hard cap 500_000
  downsample?:  'none'|'lttb'|'mean', // default 'lttb' when above 100_000 samples
}
returns: {
  channel_id: string,
  samples:    Array<{ t: string, v: number }>,
  truncated:  boolean,            // true if max_samples hit
  unit:       string,
}
```

Two modes (spec 41 §5). `mode: 'series'` (default, the shape above) additionally
accepts `channel_ids: string[]` (≤8, returned time-aligned as
`series: Array<{channel_id, unit, samples}>`) so a multi-axis comparison costs one
call, not eight. `mode: 'frame'` serves archetype C: it returns frame **metadata**
(`frame_id, channel_id, captured_at, sample_rate_hz, unit, sample_count,
frame_encoding`) and includes a frame body (`frame_b64`) only for ids explicitly
named in `frame_ids`.

Requirements:
- **Always bounded.** No unbounded full-channel dumps. Reject windows > 24 h without explicit `force=true`.
- `max_samples` applies to the **sum** across channels.
- **Frame bodies are never returned by default.** Handing back encoded frames
  unasked destroys the context window in one call.
- Specifying both `channel_id` and `channel_ids` is `not_found` (bad argument).
- Edge-local only — no proxying out, no central cache mirror.
- Read-only.

### 2. `compute_4m_correlation`

Compute Material / Person / Machine / Method correlation for a window around a given event. This is the ZEVA-Engine deep-dive entry point.

```ts
inputSchema: {
  event_id:     string,           // ZEVA-Engine judgment event id
  window_pre?:  string,           // ISO 8601 duration, default 'PT5M'
  window_post?: string,           // default 'PT1M'
  factors?:     Array<'material'|'person'|'machine'|'method'>, // default all 4
  extra_factors?: Array<{ dataset_id: string, field: string }>, // ≤6, declared `filterable` only
}
returns: {
  event_id:     string,
  window:       { from: string, to: string },
  correlations: Array<{ factor: string, supported: boolean, score: number | null,
                        n: number, contributing: string[] }>,
}
```

Requirements:
- Returns numerical scores, not vague labels (CLAUDE.md §2 — theoretical-value baseline).
- Includes contributing IDs so the LLM can name the cause.
- **`n` (sample size) is mandatory on every factor.** Without it a correlation of
  0.9 over three samples reads the same as one over three thousand, and the LLM
  cannot tell a finding from an artefact.
- **`extra_factors` carries device-specific stratification** — SMT feeder slot /
  nozzle, robot axis number — named as `"<dataset_id>.<field>"` with
  `factor: 'extra'`. Only columns a dataset declares in `filterable` are
  accepted; anything else is `not_found`. More than 6 is `out_of_range`.
- **A factor this edge has no data for returns `supported: false, score: null`
  — never a fabricated `0`.** A zero score claims "measured, no correlation";
  an unsupported factor is "not measurable here". Conflating them poisons the
  LLM's cause analysis. Supported factors must match the manifest's
  `supported_4m_factors`.

### 3. `slice_by_4axis`

Query Tier-1 readings by the four IoTPF axes (time / person / equipment / material). The base lookup API for any "what was happening when" question.

```ts
inputSchema: {
  time_from:     string,
  time_to:       string,
  person_id?:    string,
  equipment_id?: string,
  material_id?:  string,
  plant_code:    string,          // required per CLAUDE.md §3
  limit?:        number,          // default 1_000, hard cap 10_000
  cursor?:       string,          // opaque pagination cursor
}
returns: {
  rows:        Array<{...}>,   // includes device-specific optional columns (JSONB) by default
  next_cursor: string | null,
  truncated:   boolean,
}
```

Requirements:
- **Mandatory pagination.** Never return unbounded result sets — CLAUDE.md §4 ("paginate").
- `plant_code` is mandatory (multi-plant isolation, §3).
- Timestamps are timezone-aware (§3 `timestamp(6) with time zone`).
- **Device-specific optional columns (Tier-1 JSONB) are returned by default** —
  PFE-local data that never reaches PFS must still be analyzable here. A
  `columns?: string[]` projection may narrow the output, but omitting optional
  columns silently is a defect. Field names must match `describe_local_data`.

### 4. `get_event_context`

Drill-down for a single ZEVA-Engine judgment event. Returns the timeline immediately around it plus the inputs the judgment used.

```ts
inputSchema: {
  event_id: string,
  with_inputs?: boolean,          // default true
  with_waveform_refs?: boolean,   // default true; channel refs only, not raw
}
returns: {
  event:    { id, severity, judgment_type, time, target_edge_id, ... },
  inputs:   Record<string, number>, // the values that produced the judgment
  refs:     Array<{ channel_id, time_from, time_to }>, // hand-offs to raw_waveform_query
}
```

The LLM is expected to follow `refs` into `raw_waveform_query` only if it actually needs the samples — keeping context lean.

### 5. `trace_tier1_to_tier2`

Recursively trace a Tier-2 record back to its Tier-1 sources via ETL history links.

```ts
inputSchema: {
  tier2_id:    string,
  max_depth?:  number,            // default 10, hard cap 30 (CLAUDE.md §3)
}
returns: {
  tree: { id, table, depth, children: [...] },
  truncated_at_depth: boolean,
}
```

Requirements:
- **MUST enforce depth ≤ 30** per CLAUDE.md §3 ("Always include a depth guard").
- Read-only.

### 6. `validate_etl_run`

Given an `etl_run_id`, verify idempotency: re-running the same ETL must produce the same Tier-2 state. Returns a diff if it does not.

```ts
inputSchema: {
  etl_run_id: string,
  dry_run?:   boolean,            // default true; false requires explicit confirmation
}
returns: {
  is_idempotent: boolean,
  diff:          Array<{ table, row_id, before, after }> | null,
  scanned_rows:  number,
}
```

This tool is how Flow A's "ETL 1→2 must be idempotent and re-runnable" rule (CLAUDE.md §3) is automatable instead of being a wish.

### 7. `list_channels`

Enumerate channels/sensors available on this edge. The LLM uses this to validate `channel_id` before calling `raw_waveform_query`.

```ts
inputSchema: {
  equipment_id?: string,
  active_only?:  boolean,         // default true
}
returns: {
  channels: Array<{ id, equipment_id, kind, unit, sample_rate_hz, active,
                    description: string }>, // human-readable, mandatory —
                    // e.g. "機械Aの主軸振動 (spindle vibration)". Written for a
                    // reader who has never seen the device; the LLM uses it to
                    // produce context-rich alerts.
}
```

### 8. `edge_health`

Operational health endpoint. The LLM (or ZEVA-Engine) uses this to gate other calls when the edge is degraded.

```ts
returns: {
  healthy:                boolean,
  storage_free_bytes:     number,
  store_and_forward_queue_depth: number,
  last_successful_pfs_sync_at:   string | null,
  uptime_seconds:         number,
  versions:               { app, schema, mcp },
}
```

Required because §1.5 says PFE outages must not cascade — but they MUST be observable. `edge_health` is the observability seam.

### 9. `describe_local_data`

Enumerate this PFE's Tier-1 tables and columns — **including device-specific
optional columns that are never transferred to PFS**. This is how the
integration LLM "understands" a PFE's database structure without ever reading
its schema or opening a connection.

```ts
inputSchema: {
  table_name?: string,            // omit = all Tier-1 tables on this edge
  include_optional_columns?: boolean, // default true
}
returns: {
  tables: Array<{
    table_name:  string,
    set_name:    string,          // 論理名 (logical name)
    table_type:  number,
    description: string,          // mandatory, human-readable
    columns: Array<{
      name: string, set_name: string, db_data_type: string,
      length?: number, scale?: number,
      is_required: boolean, is_not_null: boolean,
      is_device_specific: boolean, // true = PFE-local optional column
      description: string,        // mandatory
    }>,
  }>,
  catalog_synced_at: string | null, // last sync with pfs.me_edge_primary_data_*
  capabilities: {                    // runtime echo of edge.manifest.json
    profile: 'full'|'forms'|'core',  // forwarder has no describe_local_data
    tools: string[],
    supported_4m_factors: string[],
  },
  // --- dataset declarations (spec 41 §2) — how the LLM knows what it can read
  datasets: Array<{
    dataset_id:  string,             // unique on this edge; the key tools take
    table_name:  string,             // physical table (must match the catalog)
    tier1_class: 1 | 2,              // class ③ is never published
    archetype:   'A'|'B'|'C'|'D'|'E'|null,   // null for class ①
    grain:       'series'|'frame'|'cycle'|'cycle_detail'|'event'|'snapshot',
    read_with:   string,             // MANDATORY — which tool returns these rows
    axes:        string[],           // 4M axes this dataset actually carries; omit absent ones
    keys?:       string[],
    time_column?: string,
    filterable?: Array<{ name: string, type: 'string'|'number'|'enum',
                         values?: string[], unit?: string }>,
    measures?:   Array<{ name: string, unit: string }>,   // unit is declared HERE
    retention?:  string,             // required for series / frame / cycle_detail
    row_estimate_per_cycle?: number, // one of the two estimates is required
    row_estimate_per_hour?:  number,
    description: string,             // mandatory
  }>,
}
```

Dataset rules (enforced by `scripts/validate-edge-mcp-conformance.js`):

- **Declaring a dataset no tool can read is a conformance failure.** `read_with`
  must name a tool this edge ships, and must be the reader for that grain:
  `series` → `summarize_series`, `frame` → `raw_waveform_query`,
  `cycle` / `cycle_detail` / `snapshot` → `slice_dataset`, `event` →
  `slice_by_4axis`.
- **`grain: snapshot` is how non-timeseries local detail becomes reachable** —
  device parameters, calibration records, robot teaching conditions and program
  versions. Before this, class ② named them but no tool could return them.
- **Volatile grains** (`series`, `frame`, `cycle_detail`) must declare `retention`;
  every dataset declares a row estimate, so the LLM can size a request before
  making it.
- **Units live in `measures[].unit`** (A/C may defer to the channel ledger),
  never inside the value column.
- `filterable` is the **whole** predicate surface — a column absent from it
  cannot be filtered on, and a column absent from the Tier-1 DDL fails the gate.

Requirements:
- **Must agree with the central catalog** (`pfs.me_edge_primary_data_table` /
  `_column`). Same names, same types, same descriptions. Catalog drift means
  the LLM reasons about columns that do not exist — treat as a defect.
- **Catalog-sync duty**: any Tier-1 migration updates the central catalog in
  the same change set (see iotpf-pfs-data-model.md §5 R3).
- `description` is mandatory on every table and column (the catalog DDL
  enforces `NOT NULL`) — write for a reader who has never seen the device.
- Metadata only — never returns row data. Read-only.

### 10. `slice_dataset`

Read any declared tabular dataset — the class-② detail that never reaches PFS.
This is the **only** way to reach device parameters, cycle detail and snapshots;
`slice_by_4axis` stays the 4M-axis surface for class-① shaped data.

```ts
inputSchema: {
  dataset_id: string,             // required, from describe_local_data.datasets
  plant_code: string,             // required (multi-plant isolation)
  time_from?: string,             // ISO 8601, TZ-aware; applied to the dataset's time_column
  time_to?:   string,
  event_id?:  string,             // grain cycle / cycle_detail: the cycle key
  filters?:   Array<{
    field: string,                // MUST appear in the dataset's `filterable`
    op:    'eq'|'ne'|'in'|'gte'|'lte'|'between',
    value: string | number | Array<string|number>,
  }>,
  columns?:   string[],           // projection; omitting device-specific columns silently is a defect
  order_by?:  { field: string, dir: 'asc'|'desc' },
  limit?:     number,             // default 1_000, hard cap 10_000
  cursor?:    string,
}
returns: {
  dataset_id: string,
  rows:        Array<Record<string, unknown>>,
  next_cursor: string | null,
  truncated:   boolean,
  row_count:   number,
  applied:     { filters: [...], time_from?: string, time_to?: string },  // echo what actually took effect
}
```

Requirements:
- **Those six operators only.** No `like`, no regex, no free-form predicate —
  a free predicate is SQL delegation by another name and hollows out the seam
  (and invites full scans, breaking the §2.1 performance contract).
- A `field` outside `filterable` returns **`not_found`** (wrong argument — the
  LLM can re-read `describe_local_data` and retry), an unknown `dataset_id`
  returns `not_found`, and a dataset whose `read_with` is not this tool returns
  **`unsupported`** (no amount of retrying will help).
- Mandatory pagination; `plant_code` mandatory; read-only.
- Field names must match `describe_local_data`.

### 11. `summarize_series`

Bucketed statistics over declared `grain: series` channels. **Call this before
`raw_waveform_query`** — most deep-dives are explained by the statistics and
never need the samples.

```ts
inputSchema: {
  channel_ids: string[],          // 1..8, validated against list_channels
  time_from:   string,
  time_to:     string,
  bucket?:     string,            // ISO 8601 duration, e.g. 'PT1M'; omitted = one bucket
  plant_code:  string,
}
returns: {
  series: Array<{
    channel_id: string,
    unit:       string,
    buckets: Array<{ t_from: string, t_to: string, count: number,
                     min: number, max: number, mean: number, stddev: number,
                     p50: number, p95: number }>,
    gaps: Array<{ t_from: string, t_to: string }>,   // always present, [] when none
  }>,
  truncated: boolean,
}
```

Requirements:
- **The statistic set is fixed** (count/min/max/mean/stddev/p50/p95). Making it
  caller-selectable means the LLM picks different measures per call and the
  cases stop being comparable.
- **Never zero-fill a gap.** Missing data is reported in `gaps`; a zero would be
  read as a measurement, poisoning the analysis exactly like a stub does.
- Bucket count cap 1 000 and channel cap 8 — over either returns `out_of_range`
  (the LLM widens `bucket` and retries once).
- Computed **on the edge**. Samples do not leave the PFE to be aggregated centrally.

## Transport and authentication

| Aspect | Allowed | Forbidden |
|---|---|---|
| Transport | stdio (local utilities, ETL driver) | — |
| Transport | Streamable HTTP, intra-LAN, mTLS | Any internet-facing endpoint |
| AuthN | Edge-issued certificate, PFS-issued mTLS | API keys in source, basic auth, anonymous |
| AuthZ | Per-tool role check on every call | Anonymous tool calls |

**Forbidden absolutely** (per CLAUDE.md §2.2 — data sovereignty, on-prem boundary):

- ❌ Any tool that streams raw waveforms to a destination outside the plant LAN.
- ❌ Any tool that accepts an external (cloud) callback URL.
- ❌ Any tool that exfiltrates `plant_code`, `serial_no`, MAC, or edge IP to a non-IoTPF destination.
- ❌ Returning samples in response bodies > 10 MB without pagination (memory leak risk, CLAUDE.md §4).

## Validation, observability, error handling

- **Schema validate every input** (Zod or equivalent). Reject unknowns. CLAUDE.md §4 + IoTPF coding-style.
- **Surface every failure** as a structured MCP error with a code and a message. Never swallow silently — CLAUDE.md §2.5 ("no silent failures").
- **Log every tool call** with `(timestamp, caller, tool, args_summary, exit_status, duration_ms)` to the PFE's append-only audit log.
- **Bound everything**: max_samples, max_duration, max_rows, max_depth. All caps documented and tested.
- **Restart-safe**: surviving a PFE reboot mid-call must not corrupt the audit log or leave a partial Tier-2 write (24/7 operation, CLAUDE.md §4).

## Required tests

Every Edge MCP server MUST include:

1. **Schema round-trip tests** — every tool's inputSchema is exercised with valid + invalid examples; rejects unknowns.
2. **Bounds tests** — `raw_waveform_query` with > 500 000 samples truncates; `trace_tier1_to_tier2` with depth > 30 stops at 30.
3. **Pagination tests** — `slice_by_4axis` with rows > `limit` returns `next_cursor` and `truncated=true`.
4. **Idempotency tests** — `validate_etl_run` on a known-idempotent run reports `is_idempotent=true` and an empty diff.
5. **Health-gating tests** — when `edge_health.healthy=false`, sensitive tools refuse with a structured error rather than failing mid-stream.
6. **Data-sovereignty negative tests** — attempting to specify an external (non-LAN) destination, callback URL, or unbounded export must return a refusal.
7. **Predicate guard** — `slice_dataset` with a `field` outside the dataset's
   `filterable` returns `not_found`; a `dataset_id` whose `read_with` is another
   tool returns `unsupported`.
8. **Gap reporting** — `summarize_series` over a window with missing data lists
   the interval in `gaps` and does not zero-fill it.
9. **Bucket cap** — `summarize_series` with more than 1 000 buckets, or more
   than 8 channels, returns `out_of_range`.
10. **Frame default** — `raw_waveform_query` in `frame` mode without `frame_ids`
    returns metadata only, no `frame_b64`.
11. **Correlation honesty** — every factor carries `n`, and a factor with
    `supported: false` carries `score: null` (never `0`).

## MR checklist for PFE DB changes (paste into MR description)

```markdown
## PFE DB / Edge MCP companion checklist

- [ ] Tier-1 schema migration touched.
- [ ] `edge.manifest.json` present; profile declared (full/forms/core/forwarder)
      and justified in `notes`.
- [ ] Edge MCP server exists at apps/edge/<edge_id>/mcp/ (all profiles except
      a manifest-declared forwarder still expose at least edge_health).
- [ ] Every tool mandated by the declared profile is present (full = all 9:
      raw_waveform_query, compute_4m_correlation, slice_by_4axis,
      get_event_context, trace_tier1_to_tier2, validate_etl_run, list_channels,
      edge_health, describe_local_data). No stub tools for unsupported
      capabilities — omit by profile instead.
- [ ] `scripts/validate-edge-mcp-conformance.js` passes locally.
- [ ] Central Tier-1 catalog (pfs.me_edge_primary_data_table/_column) updated in
      the same change set; describe_local_data agrees with it.
- [ ] Every new table classified per iotpf-pfs-data-model.md R4 — criterion is
      **Tier-2 mappability, not granularity**: ETL-eligible t1_* only when the
      ETL path declaration names concrete t2_*/m2_* target tables AND the
      transition-vocabulary mapping (a declaration that cannot name its t2
      targets ⇒ the table is local-only by definition) / local-only t1_*
      (ALL data without a t2 destination at any frequency — waveforms,
      per-second series, feature aggregates, device params; catalog
      description starts "local-only:", retention or bounded-growth policy
      present, no ETL) / pfe_ops internal (not cataloged, not exposed).
- [ ] Every local-only measurement table declares its shape archetype
      (`archetype=A|B|C|E` in the table COMMENT — pfe-database.md §2.2):
      A series tables are channel-keyed (quantities onboard as
      `pfe_ops.channel` rows, not new tables; unit/quantity kind live in the
      channel ledger); B cycle-bound tables link to the class-① event (or
      work keys) and carry the applicable 4M axes so `slice_by_4axis` /
      `compute_4m_correlation` can join them; C frame tables have
      `sample_rate_hz`/`frame_encoding` and short retention. No unit strings
      inside value columns.
- [ ] Required columns present: UUID id, TIMESTAMPTZ datetime, subject axes,
      location (or documented inheritance from me_edge_system for a
      fixed-location edge), audit columns, plant_code.
- [ ] references/decisions.md + manifest.json (edge area) updated with the table plan for this PFE.
- [ ] Every tool has an input schema and a documented return shape.
- [ ] All caps enforced (max_samples ≤ 500 000, max_depth ≤ 30, mandatory pagination).
- [ ] mTLS auth wired; no anonymous endpoints.
- [ ] No tool exposes raw data outside the plant LAN.
- [ ] Audit log writes are append-only and restart-safe.
- [ ] Tests cover schema, bounds, pagination, idempotency, health gating, sovereignty.
```

## Anti-patterns (reject in review)

- **PFE DB without MCP server** → architecturally incomplete; integration side will reach in directly. Block the MR. (A manifest-declared **forwarder** has no Tier-1 lake, hence no DB to protect — it is the one exception, and it still ships `edge_health`.)
- **Stub tool for an unsupported capability** (e.g. `raw_waveform_query` on a forms edge returning `[]`, or a 4M factor scoring a hardcoded 0) → the LLM reasons from lies. Omit by profile / return `supported: false` instead.
- **Missing or wrong `edge.manifest.json`** → the conformance gate cannot verify the edge; profile drift between manifest and `describe_local_data.capabilities` is a defect.
- **MCP tool returning raw samples without pagination or bounds** → memory leak + central-lake/LAN saturation (§2.1 performance contract).
- **MCP tool that proxies a cloud LLM call from inside the edge** → reverse data egress, banned by §2.
- **MCP tool that mutates Tier-1 outside the documented ETL path** → corrupts traceability.
- **MCP server registered at an internet-routable address** → §2 violation.
- **`slice_by_4axis` without mandatory `plant_code`** → multi-plant data leakage.
- **`trace_tier1_to_tier2` without depth guard** → recursion bomb; CLAUDE.md §3 violation.
- **L3 / LLM code opening a PostgreSQL connection to a PFE using
  `me_edge_system.pfe_db_*` credentials** → bypasses the MCP seam; the
  credential columns are provisioning/ETL-boundary metadata only
  (iotpf-pfs-data-model.md §5 R2). BLOCK.
- **Tier-1 migration without central-catalog sync** → `describe_local_data`
  and `pfs.me_edge_primary_data_*` drift; the LLM reasons about phantom columns.
- **Device-specific optional columns invisible to every tool** → PFE-local data
  exists but is unreachable for Flow B analysis; expose via
  `describe_local_data` + `slice_by_4axis` / `slice_dataset`.
- **A declared dataset with no `read_with`, or one naming a tool this edge does
  not ship** → the edge advertises data the LLM can see but not read. Block.
- **`slice_dataset` accepting a predicate over an undeclared column, or a
  `like` / free-form filter** → SQL delegation through the back door; reinstates
  the full-scan risk the seam exists to prevent.
- **`summarize_series` zero-filling a gap** → a fabricated measurement. Same
  class of defect as a stub tool: the LLM reasons from a value that was never
  measured. Report `gaps` instead.
- **`compute_4m_correlation` returning a score without `n`** → an artefact from
  three samples is indistinguishable from a real finding.

## How to use this skill

When you (or Claude) are about to:

- Write or edit a Tier-1 migration → first design which of the 8 tools must change too. Add them in the same MR.
- Add a new sensor channel → it appears in `list_channels` and is reachable via `raw_waveform_query` in the same MR.
- Onboard a new edge type → ship its Edge MCP server alongside its Tier-1 schema; the MR cannot pass review otherwise.
- Field a request like "from L3 we want to query raw …" → answer "we'll add an MCP tool", never "we'll open a DB connection".

## Automated compliance audit

The `edge-mcp-toolset-reviewer` agent enforces this skill on every MR that
touches `apps/edge/`, `migrations/t1_*`, or any PFE schema / data-lake file.
It treats the rules above as normative and BLOCKs MRs that:

- Add a Tier-1 schema change without a companion MCP tool change.
- Omit a tool mandated by the edge's declared profile, ship a stub tool for
  an unsupported capability, or omit/contradict `edge.manifest.json`.
- Skip the central Tier-1 catalog sync (pfs.me_edge_primary_data_*) on a
  Tier-1 migration, or let `describe_local_data` drift from the catalog.
- Use `me_edge_system.pfe_db_*` credentials from L3 / LLM code paths.
- Stream raw data outside the plant LAN by default.
- Skip authentication, observability, or bounds enforcement.

The deterministic half (manifest validity, profile-mandated tool presence,
Tier-1⇒catalog-sync pairing) runs without the agent as
`scripts/validate-edge-mcp-conformance.js` — a `self-heal` / CI gate. The
agent covers what the gate cannot judge: stub-tool detection, description
quality, bounds semantics, sovereignty intent.

If you change the toolset rules in this SKILL, also update
`.claude/agents/edge-mcp-toolset-reviewer.md` so the agent stays aligned with
the contract. Agent and skill are co-versioned: drift means false PASS / FAIL.

Related agents (see `.claude/rules/iotpf-agents-skills.md` for full routing):

- `tier2-schema-freeze-enforcer` — runs in parallel; blocks Tier-2 DDL.
- `etl-idempotency-checker` — verifies `validate_etl_run` is honored in code.
- `store-and-forward-validator` — verifies gateway resilience in front of PFE.
- `data-sovereignty-guard` — last-line check before commit / push.

## Related references

For MCP SDK API specifics (Node/TS), see [mcp-server-patterns](../mcp-server-patterns/SKILL.md). For Tier-2 patterns and the standardized layer above, see CLAUDE.md §3 and (forthcoming) `iotpf-tier-etl` skill.
