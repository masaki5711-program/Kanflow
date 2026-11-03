---
# On-demand (CLAUDE.md §9): attach for cross-service / contract / topology work.
paths:
  - "apps/**"
  - "**/*.proto"
  - "**/docker-compose*.yml"
  - "**/Makefile"
  - "**/Justfile"
---

# IoTPF / ZEVA-Link — Architecture Contracts (anti-hallucination guardrails)

> **On-demand rule — NOT `@`-imported** (context budget, CLAUDE.md §9). Every
> rule here is scoped to files under `apps/` (proto, MQTT schemas, compose
> topology, command runner), so it auto-attaches exactly when that work starts.
> CLAUDE.md §1–§3 carry the always-loaded summary of the same decisions.

These contracts pin the cross-service interfaces so the AI generates against a
**single source of truth** instead of inventing wire formats, endpoints, or
topology. MUST for any cross-service or infra change. When this file and
`common/` conflict, this file wins; a specific [CLAUDE.md](../../CLAUDE.md) hard
rule still overrides this file.

**Source of truth for the stack:** ADR-0001 of the IoTPF specification
repository (`90-governance/04-adr-0001-technology-stack.md`, [Decided]
2026-09-24). This file repeats only what code generation needs and pins the
choices ADR-0001 leaves open (§2.2). If the two disagree, ADR-0001 wins and this
file is corrected — never the reverse.

## 1. Schema-first is mandatory (MUST)

- **No cross-service code without a committed schema FIRST.** The schema is the
  prompt — point the model at it before implementing either side.
  - **gRPC** seams: the `.proto` under the owning project's `proto/` first,
    then generated code on both sides, then the implementation.
  - **MQTT** seams: topic + JSON Schema payload under the owning project's
    `schemas/mqtt/` first (§3).
  - **HTTP / SSE** seams of the L3 API: OpenAPI (and a JSON Schema per event
    type) first.
- **Generated code is generated, never hand-edited.** Re-generate from the
  schema; patching generated files by hand is the seam where the two sides
  silently diverge.

## 2. Stack and protocol boundaries (MUST)

### 2.1 Who talks to whom — by role, not by language

The boundary that matters is the **layer**, not the language (CLAUDE.md §1.2).

| Seam | Only allowed path |
|------|-------------------|
| Edge / PFE (L1/L2) → center | MQTT over mTLS via **EMQX** (Flow A) + ETL 1→2. A PFE never calls L3 services or the AI service |
| AI service → edge data | **Edge MCP** only (mTLS, CN → role `integration-llm`; Flow B). Never the PFE database, never MQTT |
| ZEVA-Engine / judgment hub (Rust) ⇄ AI service (Python) | **gRPC `iotpf.judgment.v1`** (tonic server, Python `grpc.aio` client). Direct — no TypeScript relay: an extra hop adds latency and a second implementation of the contract |
| Judgment hub → alert hub | HTTP (E8) |
| L4 (browser) → anything | **L3 API only** (REST + SSE). Browsers never subscribe to MQTT or the broker |
| AI service → pfsdb | Through the L3 API (records and reads); the Rust data plane and the L3 API use their own DB roles; L4 never reads pfsdb |

Tier-2 PKs, the message envelope and `seq` handling exist **only** in the shared
Rust crate; no TypeScript or Python code generates a Tier-2 PK (ADR-0001 §2.2).

### 2.2 Stack per component

| Component | Stack |
|-----------|-------|
| PFE runtime, ETL 1→2, ZEVA-Engine, replay runner, judgment hub | **Rust**: tokio, rumqttc (MQTT 5), sqlx, serde, tonic + prost (gRPC), axum only for health / metrics endpoints, `tracing` + OpenTelemetry |
| L3 API, alert hub, fleet management | **TypeScript** on Node.js LTS: Fastify, zod, `pg`, OpenTelemetry (same as the existing L3 API) |
| AI service | **Python** ≥ 3.12: `uv` (lockfile), `grpc.aio`, pydantic v2, MCP Python SDK (Edge MCP client), local Ollama over HTTP; ruff + mypy + pytest |
| L4 | Next.js + TanStack Query + Zustand; ECharts (large time series), Recharts (KPI cards); real time via SSE |
| Proto toolchain | **buf** (lint, `buf breaking`, generate) with **local** plugins only — no remote / hosted plugin or registry (§2 data sovereignty and offline builds) |
| Broker / store | EMQX; PostgreSQL + TimescaleDB (§7); Redis for ephemeral data only |
| Images | distroless or debian-slim for Rust (no Alpine/musl) |

Not adopted (ADR-0001 §4): NATS, InfluxDB, ClickHouse, Mosquitto (prototype
only), browser-side MQTT, K3s on PFE.

## 3. MQTT topic & payload contract (MUST)

- **Topic taxonomy:** `iotpf/v<N>/<kind>/<segment>…`, lowercase kind, one
  topic family per kind. Kinds in use: `etl`, `wm`, `ack`, `ackreq`, `ackrep`
  (PFE ⇄ PFS ETL), `fact`, `factwm` (landing notices), `judgment` (ZEVA-Engine),
  `alert` (andon sink, prepared). The topic builders of the shared crate
  (`iotpf-core::topic`) are the implementation; a new kind is a spec decision
  first, then a line in `scripts/validate-schema-contracts.js`. Each schema
  declares its topic in `x-topic`.
- The legacy scaffold form `factory/<line>/<machine>/<signal>` is deprecated: the
  gate warns, new schemas must not use it.
- **Payloads are JSON validated against a JSON Schema**, with format assertion
  enabled in the validator:
  - **Unknown fields — declare the policy.** PFE ⇄ PFS messages are
    **tolerant readers** (`additionalProperties: true` + required
    `schema_version`): PFEs upgrade one by one, so a consumer ignores fields it
    does not know and a breaking change is a new `schema_version`. Messages
    inside one deployment unit may be closed (`additionalProperties: false`).
  - **Scope:** every message requires `plant_code`, or `edge_system_id` /
    `shard`, which the registry resolves to plants (CLAUDE.md §3).
  - **Timestamps** are tz-aware: `format: date-time` (RFC 3339) or a pattern
    that rejects naive local time (CLAUDE.md §3).
- **QoS / retain / LWT** chosen per topic and documented. No unbounded in-flight
  buffers — honor the edge-load-saturation rules (`iotpf-edge-operations.md`).

## 4. Workspace and container topology (MUST)

- **Product code lives under `apps/<project>/` — a multi-project WORKSPACE.**
  Each system/app is its own GitLab project cloned into `apps/<project>/`;
  this repo tracks only `apps/README.md` (see
  [iotpf-git-workflow.md](./iotpf-git-workflow.md) §1.1). A contract is owned by
  one project (e.g. `iotpf.judgment.v1` by `iotpf-zeva-engine`); consumers
  depend on its released version, never on a copied file.
- **`apps/<project>/references/` is the product's reference library.**
  `README.md` (index), `manifest.json` (per-area status — `undecided` areas mean
  "ask the user, don't invent" — plus the `code` globs each area owns),
  `decisions.md` (decision log), and `specs/ code/ tests/ html/` read on
  demand. Whenever a change alters the agreed spec, update `decisions.md` (and
  the manifest status) in the same change set (`pre:edit:apps-spec-check`,
  `stop:references-drift`; `product-references` skill; `node
  scripts/references.js check`).
- **Each project's `docker-compose.yml` is the source of truth for its
  topology**, and networks are separated to ENFORCE the boundaries physically:
  - an **edge-facing** network (name contains `edge`): the broker listener for
    PFEs and the ETL;
  - `core-net`: L3 services + DB + broker;
  - an **AI** network (name contains `ai`): judgment hub + AI service + Ollama;
  - `ui-net`: L4 + L3 API.
  - **No service is on both an edge network and an AI network** — the AI never
    reaches the edge side except through Edge MCP over mTLS (§2.1).
- A service that *needs* a network it isn't on is a **design error** — fix the
  design, do not widen the network.

## 5. Commands go through a command runner (MUST)

- Build / codegen / compose operations are **`just`** targets (`just proto`,
  `just build`, `just up`, …); `just` runs the same on Windows and Linux. An
  existing `Makefile` stays valid where it already exists. The AI invokes the
  **target**, never raw `protoc` / `buf` / `docker build` with ad-hoc flags.

## 6. State (MUST)

- TypeScript and Python services hold **no in-process business state**. State
  goes to **Redis** (ephemeral: streams, queues, caches) or **PostgreSQL +
  TimescaleDB** (durable).
- The ZEVA-Engine is the deliberate exception: its windows live in memory
  behind the **state plug point**, rebuilt by warm-up / replay after a restart
  (volume 44). No other Rust service keeps business state in memory.

## 7. Datastore engine & data movement (MUST)

Reference datastore (decided): **PFE and PFS are both PostgreSQL + TimescaleDB**,
self-hosted on-prem. See [CLAUDE.md](../../CLAUDE.md) §1.5.

- **One engine, both ends.** Tier-1 (PFE edge data lake) and Tier-2 (PFS,
  `pfsdb`) are **PostgreSQL + TimescaleDB**. The driver is not convenience: each
  PFE runs Flow B raw-waveform / 4M-correlation analysis **locally** (CLAUDE.md
  §1.4 / §2), which requires real analytical SQL — TimescaleDB compression /
  continuous aggregates, window functions, `WITH RECURSIVE`, JSONB, optional
  pgvector. A lightweight engine cannot serve the Edge-MCP analysis toolset
  (`pfe-edge-mcp-toolset`). **No MySQL.** No cloud-managed DB (Aurora / HeatWave
  / Supabase-as-a-service) — disqualified by §2 data sovereignty.
- **Same engine ≠ coupled layers.** Each PFE owns its **own** Postgres instance
  (CLAUDE.md §1.5: PFE independence, no cascade). Standardizing the *product*
  choice does not breach layer independence — PFEs and PFS still link **only**
  through MQTT/ETL, never by reaching into another instance.
- **Cross-layer data movement = messaging + ETL, NOT DB replication.** Edge →
  central moves via **MQTT (Flow A) + ETL 1→2** (§1–§3 of this file). Do **not**
  introduce native DB replication across the L1→L3 boundary: it would copy raw
  Tier-1 structure into the center (violating "monitor light / deep-dive on
  demand" and the ETL normalization seam), couple schemas across layers, and
  break under factory-LAN blips that Store & Forward is meant to absorb.
- **DB replication is allowed only inside the central Postgres tier** — PFS is
  physically 1..n machines (CLAUDE.md §1.5); Postgres streaming / logical
  replication for HA, DR standby, or read-replica scale-out is appropriate
  there (same engine, same schema, no transformation).
- **Store & Forward buffer is exempt.** The durable transmission queue on a PFE
  may be SQLite / file ring buffer (`iotpf-edge-operations.md` §1) — it is a
  queue, not the Tier-1 lake. A pure dumb-forwarder PFE (no local Flow B
  analysis) may run on the SQLite buffer alone.

## Enforcement

| Contract | Checker |
|----------|---------|
| §1, §3 schema well-formedness, topic taxonomy, proto versioning | `scripts/validate-schema-contracts.js` (legacy `apps/` paths and every `apps/<project>/`) |
| §1 breaking changes | `scripts/validate-contract-compat.js` (this repo's history); `buf breaking` in each product's CI |
| §4 network separation, §6 state heuristic | `scripts/validate-docker-topology.js` (every `apps/<project>/docker-compose.yml`) |

Reviewer routing is in [iotpf-agents-skills.md](./iotpf-agents-skills.md). A
contract without a checker is a suggestion, not a rule — wire the checker when
the corresponding code lands.
