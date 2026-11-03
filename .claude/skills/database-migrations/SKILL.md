---
name: database-migrations
description: Safe schema and data migration procedure — expand-contract, lock avoidance, batching, rollback discipline — for PostgreSQL/TimescaleDB and common migration tools. Use when: creating or reviewing a migration, altering tables/columns/indexes, planning a backfill or zero-downtime change. Do not use when: designing new schema from scratch (supabase-postgres-best-practices / database-reviewer agent), validating a written migration for data-loss/locking risk (db-data-integrity-validator), or query performance work (db-query-performance-optimizer).
origin: ECC
---

# Database Migrations

Safe, reversible, forward-only schema changes for a 24/7 production system.

## Related (read first)

- `.claude/rules/iotpf-pfs-data-model.md` — concrete pfsdb structure, naming taxonomy, freeze scope; mandatory before any DB/ETL work
- `tier2-schema-freeze-enforcer` agent — run on every schema-touching change
- `db-data-integrity-validator` skill — pre-run risk analysis of a written migration
- `etl-idempotency-checker` agent — when the migration feeds or reshapes ETL 1→2

## Repo-specific hard constraints

- **Tier-2 is frozen.** Any DDL touching `t2_*` / `m2_*` tables is BLOCKED by `tier2-schema-freeze-enforcer`. New data needs go to Tier-1 optional columns (JSONB) or into ETL — never into Tier-2 definitions.
- Every table carries the common audit columns plus `plant_code` (CLAUDE.md §3).
- Timestamps are `timestamp(6) with time zone` — never naive local time.
- TimescaleDB tables need partitioning/retention/downsampling decisions declared in the migration, not deferred.

## Core principles

1. Every change is a migration file — never alter a production database manually.
2. Production is forward-only — "rollback" means a new forward migration.
3. Schema (DDL) and data (DML) migrations are separate files, never mixed.
4. Migrations are immutable once deployed — fix with a new migration, never edit.
5. Test against production-sized data — what works on 100 rows can lock on 10M.

## Safety checklist (before applying)

- [ ] Not touching `t2_*` / `m2_*` DDL (freeze check passed)
- [ ] UP and DOWN both present, or explicitly marked irreversible
- [ ] No full-table locks: new columns nullable or with a default; no NOT NULL-without-default on an existing table
- [ ] Indexes on existing tables created CONCURRENTLY (outside a transaction block)
- [ ] Backfill is a separate, batched migration (bounded batches, skip-locked, progress logged)
- [ ] Audit columns, `plant_code`, and TZ-aware timestamps present on new tables
- [ ] Tested against a copy of production-scale data; rollback plan documented

## Zero-downtime procedure (expand-contract)

1. **Expand** — add the new column/table (nullable or defaulted); deploy app writing to both old and new.
2. **Backfill** — separate batched data migration for existing rows.
3. **Migrate reads** — deploy app reading from new, still writing both; verify consistency.
4. **Contract** — deploy app using only the new shape; drop the old column/table in a later, separate migration.

Renames and drops always go through this sequence — never rename or drop directly in production. Remove all application references and deploy *before* the drop migration runs.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|---|---|---|
| Manual SQL in production | No audit trail, unrepeatable | Migration files only |
| Editing a deployed migration | Environment drift | New migration |
| NOT NULL without default on existing table | Full rewrite + lock | Nullable → backfill → constraint |
| Inline index on a large table | Blocks writes during build | CONCURRENTLY |
| DDL + DML in one migration | Long transactions, unrollbackable | Separate files |
| Dropping a column before removing code | Runtime errors on missing column | Code removal deploys first |
| Unbatched full-table UPDATE | Table lock for the duration | Bounded batches |
