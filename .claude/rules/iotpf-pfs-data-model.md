---
# On-demand (CLAUDE.md §9): attach for DB / ETL / Edge-MCP surfaces.
paths:
  - "**/*.sql"
  - "apps/schemas/**"
  - "apps/edge/**"
---

# IoTPF / ZEVA-Link — PFS Data Model Reference (pfsdb, SQL-iotdb Rev1.19 + kit migrations)

> **On-demand rule — NOT `@`-imported** (context budget, CLAUDE.md §9). Load this
> when working on L3 database schema, ETL 1→2, Tier-1/Tier-2 modeling, the edge
> registry, or any Edge MCP tool that must agree with the central catalog.
> Routing: [iotpf-agents-skills.md](./iotpf-agents-skills.md) §DB 変更時.

This file distills the **actual PFS foundation DDL** (`SQL-iotdb_Rev1.19`,
schema `pfs`, database `pfsdb`, 69 tables, plus the build-kit migrations
0001–0011 that bring it to 86 — Rev1.23 candidate) so agents reason from the
real structure instead of guessing. The full DDL is the source of truth — it
lives in **`docs/iotpf-build-kit/db/`** (`SQL-iotdb_Rev1.19.sql` +
`migrations/*.sql`, consolidated as `pfsdb-consolidated.sql`; column-level
catalog `pfsdb-catalog.md`; SQLite reference `iotpf-fullstack.db` with
synthetic data; the Rev1.15 origin stays on the `archive/apps-iotpf-scaffold`
branch and in `docs/old/Doc_IoTplatform/`). This reference is normative for
naming and mechanics and defers to that DDL on any disagreement. Section
counts below that still say "47 tables / 19 `t2_`" describe the Rev1.15 core,
which is unchanged and frozen; the tables added since (upper masters, ZEVA /
AI deep-dive, manufacturing-model completion, `mm_m_npt_code`, `me_ai_*` /
`te_ai_*`, and the 0006 physical-AI-readiness set) are all non-frozen and
listed in `docs/iotpf-build-kit/db/README.md`.

## 1. Naming taxonomy (verified against the DDL)

`<kind><domain>_<name>` — every table name parses as:

| Prefix | Kind | Domain | Meaning | Examples |
|--------|------|--------|---------|----------|
| `mm_m_*` | master | manufacturing | Manufacturing masters (Yamaha Manufacturing Model) + the spatial map (0006) | `mm_m_item`, `mm_m_process`, `mm_m_work`, `mm_m_workctr`, `mm_m_work_station`, `mm_m_work_resource`, `mm_m_storage_area`, `mm_m_storage_location`, `mm_m_coord_frame`, `mm_m_floor_map`, `mm_m_location_geometry`, `mm_m_space_zone` |
| `mm_ymes_*` | master | manufacturing | YMES linkage config (Tier-3 seam) | `mm_ymes_linkage_info`, `mm_ymes_linkage_schedule` |
| `m2_*` | master | Tier-2 | **Identification** masters (subject identity) | `m2_person_identification`, `m2_material_identification`, `m2_machine_identification`, `m2_iot_location` |
| `t2_*_hist` | transaction | Tier-2 | **Movement / State history** | 19 tables, see §3 |
| `te_*` | transaction | edge/platform | ETL & operation logs | `te_etl_person_log`, `te_etl_material_log`, `te_etl_machine_log`, `te_oper_log` |
| `tm_*` | transaction | manufacturing | YMES linkage log (Tier-3 seam) | `tm_ymes_linkage_log` |
| `me_*` | master | edge/platform | **Edge registry, Tier-1 catalog, users/roles**, plus edge time-sync / actuation authority / safety vocabulary (0006) | `me_edge_system`, `me_edge_primary_data_table`, `me_edge_primary_data_column`, `me_user`, `me_role`, `me_user_role`, `me_user_edge_system`, `me_edge_time_sync`, `me_actuation_authority`, `me_safety_event_class` |
| `mp_*` | master | portal | Portal display config | `mp_portal_disp_cate`, `mp_portal_disp_link` |

New PFS tables MUST follow this taxonomy. A table that does not parse into it
is a naming-review finding.

Semantics note (2026-07-24): `te_*` covers **both** append-only logs
(`te_etl_*_log` — no audit-8, `log_create_at` instead; `te_oper_log` — no
audit-8, its own `oper_at`) **and** mutable operational transactions with
state columns and full audit-8 (`te_ai_judgment_log`, `te_ai_improve_request`
— see `docs/spec/IoT.md/ai-data-model.md`; decision D4 unified the
former `te_ai_review_case` proposal into `te_ai_improve_request`). Do not
assume `te_*` implies immutable.

FK-direction note (TimescaleDB): FKs **from** a hypertable **to** a plain
table (outbound) work normally — always declare them. FKs from a plain table
**into** a hypertable (inbound) must reference the full composite PK
(partition column included): denormalize the partition column into the
referencing table and use a composite FK. Never add a single-column UNIQUE
across a hypertable to work around this.

## 2. Common column contract (every table)

Verified present on every table in the DDL — matches CLAUDE.md §3:

- Audit 8: `create_user`, `create_at`, `create_pg`, `create_device`,
  `update_user`, `update_at`, `update_pg`, `update_device`
  (exception: append-only logs like `te_etl_*_log` carry `log_create_at` instead).
- **`plant_code VARCHAR(4) NOT NULL`** on every table; masters use composite
  PKs that include `plant_code` (e.g. `pk_mm_m_storage_area (storage_area_id, plant_code)`).
- All timestamps are **`TIMESTAMPTZ`**. No naive local time anywhere.
- `COMMENT ON` every table and column, with the YMES field mapping noted as
  `YMES:<field>` in the comment. New columns keep this convention.
- PK styles: Tier-2 history = `UUID`; identification masters = surrogate
  `iot_<subject>_id` — **`SERIAL` for person / machine / location, `UUID` for
  material** (`m2_material_identification.iot_material_id`; verified in the
  DDL — the four subjects do NOT share one key type, decision D16 keeps it so
  and records the type per subject in the Relation Dictionary instead);
  business codes ride alongside as nullable columns.

## 3. Tier-2 pattern: Identification + State history (FROZEN at runtime)

Exactly the CLAUDE.md §3 model, physically:

- **Identification** (`m2_<subject>_identification`): SERIAL `iot_<subject>_id`
  ↔ business IDs (`machine_id VARCHAR(20)` …) + `fixed_iot_location_id` →
  `m2_iot_location`.
- **State/Movement history** (`t2_<subject>_<state>_hist`): UUID PK,
  **`start_transition VARCHAR(35) NOT NULL` / `end_transition`** (UML
  state-machine transitions) and **`start_at TIMESTAMPTZ NOT NULL` / `end_at`**,
  the `iot_<subject>_id` FK, denormalized names, `plant_code`, audit columns.
- Subjects × states (19 `t2_` tables):
  - person: `work`, `nwork`, `move`, `time_ctrl`
  - material: `work`, `move`, `consu`, `process`, `process_wait`, `storage`,
    `storage_move`, `storage_stay`
  - machine: `work`, `oper`, `noper`, `nwork_oper`, `move`, `alarm`, `time_ctrl`

**Freeze scope** (`tier2-schema-freeze-enforcer` BLOCKs at runtime): `t2_*` and
`m2_*`. The freeze does **not** cover `mm_*` / `me_*` / `mp_*` / `te_*` / `tm_*`
— those are platform/master metadata, changeable through normal
`database-migrations` + `database-reviewer` flow. New data needs go to Tier-1
optional columns or ETL, never into `t2_*`/`m2_*` DDL.

**What the freeze protects (decision D14, 2026-09-07 — spec 40 §3-1):** table
definitions, columns, constraints, `UNIQUE`, and partial indexes whose predicate
changes a result set. **Plain non-unique B-tree indexes on `t2_*` / `m2_*` are
NOT frozen** — they change the access path, not the meaning — and go through
`database-reviewer` only. Migration 0008 added 51 such indexes (`idx_<table>_NN`;
history tables `(plant_code, start_at DESC)` + `(iot_<subject>_id, start_at DESC)`,
the three `*_move_hist` tables key on `stay_start_at` and add
`(iot_location_id, …)`).

**`t2_*_hist` partitioning — settled 2026-09-21 (Part VII #57, volume 43 §13.6;
supersedes #30 / kit K11).** Adding the partition column to the PK would be a
frozen-surface change, so it is NOT done. Instead the PK's own value carries the
time: `create_hypertable(..., by_range('<pk>', INTERVAL '7 days', partition_func
=> 'pfs.iotpf_pk_time'))`, where `pfs.iotpf_pk_time(uuid)` is an IMMUTABLE
function returning the timestamp from the PK's leading 48 bits (§4). Columns, PK
and CHECKs are untouched — the frozen surface stays frozen. Verified on
TimescaleDB 2.28.1 / PostgreSQL 16. Four rules follow and are binding:

1. **No FK may reference `t2_*_hist`** — a chunk referenced by a foreign key
   cannot be compressed. Use an `IOTPF-REF-00N` existence trigger instead.
2. **A PK without a valid time prefix is rejected** by a `BEFORE INSERT` trigger
   (`IOTPF-T2PK-001`); uuid4/uuid5 values land thousands of years out. Every
   writer therefore follows the §4 PK rule — in practice ETL is the only writer.
3. **Range queries must carry a predicate on the PK's time**, not on `start_at`
   alone; `start_at` alone does not exclude chunks.
4. **Continuous aggregates cannot be created** on a hypertable with a custom
   partition function. Daily OEE/OLE aggregation uses a non-frozen result table
   recomputed for dirty operating days (`oee-calculation.md` §5.4).

Chunk 7 days, compress after 35 days, no automatic retention (years decided with
Part VII #15/#20). **This can only be applied while the tables are empty**, so it
is the first implementation step. DDL not yet in the kit — tracked as K15.

## 4. ETL lineage: `te_etl_<subject>_log`

This is the physical form of CLAUDE.md §3 "always write the Tier-1↔Tier-2 ETL
history link":

- Full from/to addressing: `etl_from_{host_name,db,schema_name,table_name,pk}`
  → `etl_to_{host_name,db,schema_name,table_name,pk}`, plus `etl_dml_type`,
  `is_etl_result`, timing (`etl_start_at`/`etl_end_at`).
- Error surfacing built in: `etl_error_code`, `etl_error_content`,
  **`is_etl_error_send` / `is_etl_error_send_comp`** — the log row is the queue
  for the mandatory email notification (CLAUDE.md §4 "logs plus email").
  An ETL that fails without writing a row here is a silent failure (§2.5).
- `etl_from_pk`/`etl_to_pk` are `UUID` — Tier-1 rows that feed ETL therefore
  need a UUID-addressable identity on the PFE side.
- `trace_tier1_to_tier2` (Edge MCP tool) and `etl-idempotency-checker` both
  resolve lineage through these tables; depth guard ≤ 30 applies.
- **ETL runtime tables (migration 0010, spec volume 43 — provisional):**
  `te_etl_inbox` (parked events; the record of failure when no route is known,
  because `etl_to_table_name` is NOT NULL here), `te_etl_seq_state` (loss
  detection by send-sequence continuity), `te_etl_calendar_stop` (staging for
  the planned-stop route into `mm_m_calendar_day`; recomputed, never added).
  These are mutable and carry audit-8, unlike the append-only logs.
- **Duplicates are decided by the write** onto the deterministic target PK, not
  by querying these logs first. The PK is a time-prefixed UUID version 8
  (volume 43 §7.1): 48 bits of the event's factual time in milliseconds, then
  bits of `uuid5(ns(target table), etl_from_pk)`. Never generate a Tier-2 PK
  for ETL-written rows any other way, and never correct the factual time by a
  re-send (use the recovery path).
- The three lineage logs are hypertables since migration 0011 (PK includes
  `etl_start_at`; 7-day compression, 400-day retention). On the PFE side,
  `pfe/00_pfe_common_runtime.sql` defines the `pfe_ops` tables every PFE
  carries (`send_seq`, `outbox`, `sent_log`, `etl_run`, `lineage_link`); send
  sequence numbers come from a `send_seq` row, never from a SEQUENCE. The `(etl_from_pk, etl_to_table_name)` and `(etl_to_pk)`
  indexes added by 0010 serve tracing and repair, not the steady-state path.

## 5. Edge registry & central Tier-1 catalog (`me_edge_*`) — NORMATIVE

The foundation DDL already contains the mechanism by which the platform
"understands" each PFE's database structure **without connecting to it**:

- **`me_edge_system`** — one row per PFE/edge system.
  `edge_system_id` (SERIAL) is **the canonical edge identity**: the
  `target_edge_id` in ZEVA-Engine judgment events resolves here (Flow B step 1).
  Carries location links (workctr / work_station / storage area+location),
  vendor/registrar contact fields, and PFE connection metadata (see R2).
- **`me_edge_primary_data_table` / `me_edge_primary_data_column`** — the
  **central catalog of every PFE's Tier-1 (primary data) tables and columns**:
  table/column names + 論理名 (`*_set_name`), `db_data_type`, length/scale,
  required/not-null flags, and a **`description TEXT NOT NULL`** on both levels.
  This catalog — not the PFE's `information_schema` — is how L3 and the
  integration LLM know what data a given edge holds, including
  **device-specific optional columns** that never leave the edge.

> **Fleet-management spec**: the application that operates this registry —
> PFE provisioning (P1–P7), config distribution, liveness monitoring,
> catalog-drift detection, and the push/pull transport contract (steady-state
> = PFE-push over MQTT+S&F; PFS-pull only as the R2 reviewed exception) — is
> specified in `docs/spec/IoT.md/pfe-fleet-management.md`. Load it for any
> PFE onboarding, transport, or edge-operations work.

### Rules

- **R1 — Edge resolution & capability declaration.** Flow B resolves
  `target_edge_id = me_edge_system.edge_system_id` → that edge's **Edge MCP
  endpoint**. The registry is the routing table the
  `edge-mcp-toolset-reviewer` requires. When Flow B is implemented, extend
  `me_edge_system` with MCP endpoint columns (`pfe_mcp_endpoint`,
  `pfe_mcp_cert_ref` — kit migration 0001) **and capability columns**
  (`edge_system_code`, `pfe_mcp_profile` — full / forms / core / forwarder —,
  `pfe_mcp_tools JSONB`, `pfe_mcp_axes JSONB` — kit migration 0003) via a
  normal migration — `me_*` is not freeze-scoped. The capability columns mirror the
  edge's `edge.manifest.json` (see `pfe-edge-mcp-toolset` §Conformance
  profiles) so ZEVA-Engine / the LLM select tools from **declared** capability,
  not guesswork; registry ↔ manifest ↔ `describe_local_data.capabilities`
  must agree — drift is a defect, same class as catalog drift (R3).
- **R2 — The `pfe_db_*` credential fields are NOT a data path.**
  `me_edge_system` carries `pfe_ip_addr`, `pfe_db_name`, `pfe_db_port`,
  `pfe_db_user_name`, `pfe_db_password BYTEA` — inherited from the pre-ZEVA-Link
  design where PFS pulled Tier-1 directly. Under this agent model that direct
  path is **forbidden for runtime analysis**: no L3 service and no LLM code
  path may open a PostgreSQL connection into a PFE
  (`pfe-edge-mcp-toolset`: the Edge MCP server is the only seam; CLAUDE.md
  §1.4/§2). Legitimate uses of these fields are limited to **provisioning and
  the ETL 1→2 boundary driver** — and each such use is an explicit,
  reviewed exception, logged, never reachable from LLM tool-calling code.
  `pfe_db_password` MUST be stored encrypted (BYTEA is ciphertext, never
  plaintext bytes), access-controlled, and rotated if the direct path is
  retired. `security-reviewer` + `data-sovereignty-guard` audit any diff that
  reads these columns.
- **R3 — Catalog-sync duty.** Any migration that adds/changes a PFE Tier-1
  table or column MUST update `me_edge_primary_data_table` /
  `me_edge_primary_data_column` in the same change set (registration flow or
  seed migration). The Edge MCP tool `describe_local_data`
  (`pfe-edge-mcp-toolset` tool #9) returns this same structure from the edge
  side; catalog and edge MUST agree — drift means the LLM reasons about
  columns that do not exist. `description` is mandatory at both ends (the DDL
  already enforces `NOT NULL`); write it for a reader who has never seen the
  device.
- **R4 — PFE table classes & required columns (Tier-2 mappability criterion).**
  A PFE's PostgreSQL holds three classes of tables; classify every new table
  explicitly. **The classification criterion is Tier-2 mappability, not data
  rate or granularity.** The standard model (`t2_*`/`m2_*`, frozen — §3) is
  already decided on the PFS side; data whose content maps into it is
  ETL-eligible, and **everything else stays on the PFE regardless of
  granularity** — per-second signal series and low-frequency device detail
  alike. 間引き ("don't send everything", §2.1) is the *volume consequence*
  of this criterion, never the criterion itself. Mechanical test: **if the
  ETL path declaration cannot name concrete `t2_*`/`m2_*` target tables, the
  table is class 2 by definition.**
  1. **Tier-1 standard-mappable events** (`pfe.t1_*`, ETL-eligible) — facts
     with a concrete Tier-2 destination: production output (`qty`),
     material / person / machine movement and state transitions, location.
     The ETL 1→2 path declaration MUST name the target `t2_*`/`m2_*` tables
     **and** the transition-vocabulary mapping (the `start/end_transition`
     CHECK values of the target). Design these tables backwards from the t2
     shape (subject-axis IDs, transition vocabulary, `qty`, `work_order_no`,
     location) so ETL 1→2 stays a thin normalize-and-lookup mapping.
     Catalog-registered (R3).
  2. **Tier-1 local-only detail** (`pfe.t1_*`, declared `local-only`) — **all
     data without a Tier-2 mapping destination, at any frequency**: raw
     waveforms, per-second signal series, window/feature aggregates (Tier-2
     has no measurement-series tables), device parameters, calibration
     records, images. Data **never transfers to PFS** (§2.1 performance
     contract — metadata still syncs). Catalog-registered (R3) with
     `description` starting `local-only:`; **no ETL path required** (the
     declaration replaces the ETL plan); reachable only through the Edge MCP
     toolset. Time-series tables carry a mandatory TimescaleDB retention
     policy (short for high-frequency); non-time-series local detail states
     its bounded-growth policy in the table COMMENT.
     **Measurement shape contract** (quantity-agnostic — vibration, temp,
     humidity, pressure, clamp time, coating amount are all instances;
     normative detail in `docs/spec/IoT.md/pfe-database.md` §2.2): every
     class-2 measurement table declares one of three archetypes in its
     `local-only:` COMMENT — **A `series`** (channel-keyed scalar samples;
     new quantities are onboarded as `pfe_ops.channel` rows, NOT new
     tables), **B `cycle-bound values`** (one row per work cycle — clamp
     time, coating amount — linked to the class-1 event / work keys and
     carrying the applicable 4M axes so Flow B correlation can join
     process conditions to output facts), **C `high-frequency frames`**
     (encoded waveform bursts, short retention mandatory). Units never
     live in value columns: A/C declare unit+quantity in the channel
     ledger, B in the catalog `description`.
  3. **Edge-internal operational tables** (schema `pfe_ops`) — Store&Forward
     mirrors, work buffers, hook state. NOT Tier-1: never in schema `pfe`,
     never catalog-registered, never exposed via `describe_local_data`.
  Required columns for both Tier-1 classes (IoTPF core concept: data-ID /
  data-datetime / **location** / subject-ID): UUID identity, `TIMESTAMPTZ`
  datetime, the applicable subject axes, and location — a **fixed-location
  edge may inherit location from its `me_edge_system` location links**
  (workctr / work_station / storage) instead of a per-row column; state which
  in the table COMMENT. Plus the common audit columns and `plant_code` (§2).

## 5b. Spatial map & physical-AI readiness (0006) — NORMATIVE

Added by migration 0006 (design memo:
`docs/spec/IoT.md/39-physical-ai-readiness.md`). All non-frozen; the frozen
`m2_iot_location` was **not** touched.

- **The map attaches by ID, never by column.** `m2_iot_location` is the single
  location hub (it folds workctr / work_station / work_resource /
  storage_location / storage_area via `iot_location_set_type`), and all three
  `t2_*_move_hist` tables carry `iot_location_id`. Geometry therefore lives in
  `mm_m_location_geometry`, hung 1:1 (period-versioned) off that id — giving
  person / material / machine movement coordinates without a frozen-table
  change. **Never propose adding coordinate columns to `m2_*` or `t2_*`.**
- **Coordinate contract**: metres and radians, right-handed, **Z-up**; pose as a
  **unit quaternion** `(quat_w, quat_x, quat_y, quat_z)` with normalization
  enforced by CHECK. No unit column — `source_unit` records the drawing's unit
  for traceability only, stored values are always metres. Frames
  (`mm_m_coord_frame`) nest via a self-FK; **cap frame recursion at depth 30**
  (same guard as traceability) and note that cycles are prevented in the app,
  not the DB. Never store composed world coordinates — L3 composes them.
- **Map bytes stay outside the DB**: `mm_m_floor_map.content_ref` +
  `content_sha256`. Same rule as raw waveforms (principle 1).
- **High-frequency live position (AMR tracks, skeleton tracking) does not go
  central.** It is a PFE archetype-A channel; central sees Tier-2 stay history
  plus Flow B pulls. Learning-grade perception data is **archetype D**
  (episode + object-store reference), documented in `pfe-database.md` §2.2.
- **Actuation is declared before it is issued**: `me_actuation_authority`
  (who / which model version / which zone / which command kind / envelope),
  then `te_act_command_log` — content immutable, only the state columns
  mutable, written by code and humans only (same contract as
  `te_ai_judgment_log`). An `issuer_kind='ai'` row must name both `asset_id`
  and the originating `ai_judgment_log_id`. Edge MCP keeps observation and
  actuation in **separate profiles**; per-tool AuthZ is required for the
  actuation profile (open item Part VII #24, joined with #14).
- **Safety events use a controlled vocabulary** (`me_safety_event_class`),
  never free text; `te_safety_event_log` carries map coordinates and a
  composite FK to the command that was in flight.

## 6. Users, roles, YMES, portal (context)

- `me_user` / `me_role` / `me_user_role` / `me_user_edge_system` — platform
  authn/z; `me_user_edge_system` scopes users to edges (per-tool AuthZ in the
  Edge MCP maps back to these).
- `mm_ymes_linkage_info` / `mm_ymes_linkage_schedule` / `tm_ymes_linkage_log` —
  the Tier-3 (YMES) seam. Tier-3 itself is **not yet implemented**
  (CLAUDE.md §1.5); do not build against it without a decision record.
- `mp_portal_disp_*` — L4 portal display config; UI reads these through the L3
  API, never directly (layer independence).

## 7. What this changes for reviewers

- `database-reviewer` / `tier2-schema-freeze-enforcer`: freeze scope = `t2_*`,
  `m2_*` only (§3); taxonomy conformance for new tables (§1); common column
  contract (§2).
- `edge-mcp-toolset-reviewer`: R1–R3 are in scope — a Tier-1 migration without
  catalog sync, or any L3/LLM code using `pfe_db_*` credentials, is a BLOCK.
- `etl-idempotency-checker`: lineage = `te_etl_*_log` rows (§4); a re-run that
  duplicates `etl_to_pk` writes is a failure.
- `timezone-correctness-auditor`: everything is `TIMESTAMPTZ`; any naive
  timestamp entering ETL is a boundary bug.
- Spatial / actuation / safety changes (§5b): a coordinate column proposed on a
  frozen table, a unit column on a geometry table, a non-normalized quaternion,
  an ungated actuation path (missing `authority_id` or per-tool AuthZ), or a
  free-text safety classification are all findings.

## 8. DB / schema change review sequence (MUST)

1. `tier2-schema-freeze-enforcer` — Tier-2 凍結違反を検出（検出時は BLOCK）。
2. `timezone-correctness-auditor` — TZ-aware timestamp 遵守。
3. 変更が層を跨ぐ場合 `timezone-lineage-auditor` — L1→L4 の TZ 規約連続性
   （沈黙変換破綻）。
4. `database-reviewer` — SQL / インデックス / RLS。

PFE 側の DB（Tier-1 / エッジデータレイク）を作る／変更する場合は
`pfe-edge-mcp-toolset` スキルが必須（iotpf-edge-operations.md §6）。
