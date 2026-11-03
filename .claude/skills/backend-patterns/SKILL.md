---
name: backend-patterns
description: Server-side architecture patterns for the L3 control plane (TypeScript, Fastify — L3 API, alert hub, fleet management) — layering (route/service/repository), caching, error handling, retries, background work, and structured logging decisions. Use when: structuring API handlers and service/repository layers, adding caching or retry/backoff logic, designing middleware (auth, rate limiting, logging), or wiring background jobs. Do not use when: designing the HTTP contract itself — URLs, status codes, pagination, versioning (api-design); SQL, schema, or migration work (supabase-postgres-best-practices, database-migrations, database-reviewer agent, iotpf-pfs-data-model rule); Rust edge/gateway code (rust-patterns); factory-network resilience validation of written code (iot-edge-resilience-validator).
origin: ECC
---

# Backend Patterns (L3 — TypeScript Platform/API)

## Repo-specific constraints

- L3 control plane is TypeScript (Fastify); the L3 data plane (ETL 1→2, ZEVA-Engine, judgment hub) is Rust — use rust-patterns there (ADR-0001). Datastore is PostgreSQL + TimescaleDB (`pfsdb`), Redis for ephemeral/cache only. No MySQL, no cloud-managed DBs (CLAUDE.md §1.5).
- Every external call has a timeout; retries are bounded with exponential backoff — the factory LAN is unstable (CLAUDE.md §4).
- No silent failures: every failure is a logged, notifiable event; ETL/YMES-sync errors also surface via email notification (CLAUDE.md §2.5, §4).
- No unbounded queries: LIMIT/pagination always; TimescaleDB partitioning, retention, and downsampling for time-series.
- Timestamps are `timestamptz` end to end; never naive local time. `plant_code` on every table (CLAUDE.md §3).
- Secrets from env/secret manager only — never in source.

## Layering — decision table

| Concern | Where it lives |
|---|---|
| HTTP parsing, schema validation (Zod), status codes | Route handler — validate at the boundary, fail fast |
| Business logic | Service — no direct DB access, no HTTP types |
| Data access | Repository interface + concrete implementation (swap/mock seam) |
| Cross-cutting: auth, rate limiting, request logging | Middleware / handler wrapper |

## Caching — decision table

| Situation | Choice |
|---|---|
| Hot, read-mostly entities | Cache-aside in Redis with TTL; invalidate on write |
| Session / ephemeral state | Redis, never Postgres |
| Tier-2 or audit-relevant data | No cache-as-truth — the database is authoritative |

## Constraints checklist

- N+1: batch related reads (single IN query or JOIN); never a per-row lookup in a loop.
- Multi-statement writes run in a transaction; partial success is a bug.
- ETL 1→2 writes are idempotent and re-runnable, with the Tier-1↔Tier-2 lineage record — verify with `etl-idempotency-checker`.
- Background work uses bounded queues with failure surfacing; no fire-and-forget.
- Structured JSON logging with request IDs; log context server-side, return sanitized messages to clients.
- Rate limiting on all endpoints (common/security baseline).
- Prefer immutable update patterns; return new objects (common/coding-style).

## Related (read first)

- `api-design` skill — owns the HTTP contract (status codes, pagination, versioning).
- `supabase-postgres-best-practices` skill — query and index design.
- `database-migrations` skill + `.claude/rules/iotpf-pfs-data-model.md` — any pfsdb schema work; Tier-2 is frozen (`tier2-schema-freeze-enforcer`).
- `iot-edge-resilience-validator` skill — validates written network/DB-write code against factory-LAN failure modes.
- `db-query-performance-optimizer` / `db-security-isolation-checker` skills — production-scale query review.
- `typescript-reviewer`, `database-reviewer`, `security-reviewer` agents — post-implementation review.
