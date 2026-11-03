---
name: db-data-integrity-validator
description: Analyze database schema changes, migration files, or data-manipulation queries to detect — before they run — risks of existing data being corrupted or lost, runtime breakage from schema/ORM drift, and downtime caused by table locking. Use when reviewing migrations, ALTER TABLE / DROP statements, type changes, or destructive SQL.
origin: project
---

# DB Data Integrity Validator

Inspect database schema changes, migration files, and data-manipulation queries **before they are applied**, and detect — in advance — the risk that existing data will be corrupted or lost, that the system will break at runtime, or that the change will cause downtime through locking.

## When To Use

- reviewing a migration file or migration diff before merge or deploy
- analyzing `ALTER TABLE`, `DROP`, type-change, or constraint-adding SQL
- validating a data-manipulation query (`UPDATE` / `DELETE`) that runs at scale
- checking that an ORM model change and the DB schema stay consistent

This project runs PostgreSQL / TimescaleDB with declarative migrations (Drizzle Kit). Treat large hypertables and high-row-count tables as the default risk case, and assume target tables already hold production data unless told otherwise.

## Risk Categories

### 1. Destructive Changes

Changes that can silently destroy or truncate existing data.

- Dropping a column or table (`DROP COLUMN`, `DROP TABLE`).
- Changing a data type — e.g. `TEXT` → `INT` (fails or loses non-numeric rows), or narrowing a type (`VARCHAR(255)` → `VARCHAR(50)`, `BIGINT` → `INT`) which truncates or overflows existing values.
- Adding a `NOT NULL` constraint with no `DEFAULT` to a column that already has rows — every existing `NULL` row makes the migration fail, or the column cannot be populated.

### 2. Data Inconsistency

Changes that are valid as DDL but conflict with the data already stored, or with the application.

- Adding a new `UNIQUE` constraint or `FOREIGN KEY` to a table that already contains duplicate values or orphaned rows — the constraint creation fails and blocks the deploy.
- Drift between the application's ORM mapping and the DB schema — a column rename or removal applied to the DB but not to the code (or vice versa) causes runtime errors immediately after deploy.

### 3. Performance & Lock

Changes that succeed but lock or rewrite the table.

- Adding an index or changing a type on a table with a large row count — a full table lock for the duration of the operation, producing downtime proportional to table size.
- `ALTER` operations that trigger a full table rewrite.

## Execution Instructions

Validate the provided code, SQL, or migration file (including diffs), then output a report **strictly** in the format below. Be specific: cite the file and line, and state exactly what happens to existing data.

### 1. Risk Assessment

Classify as one of three levels, with a one-line reason:

- **CRITICAL** — irreversible data loss/corruption, or guaranteed production downtime.
- **WARNING** — conditionally unsafe; depends on the current data state or table size.
- **SAFE** — no impact on existing data and no meaningful lock.

### 2. Detected Issues

For each issue, one entry:

`- **[Risk category]**: which file and which line, why it is dangerous, and the concrete effect on existing data (truncation, failed writes, deploy failure, lock duration, …).`

### 3. Mitigation Strategy

Present concrete, safer alternatives for each dangerous change. For example:

- Do not change a type in one shot — instead: **add a new column → backfill/migrate the data → drop the old column**, as separate steps.
- For PostgreSQL: build indexes with `CREATE INDEX CONCURRENTLY`; add a constraint as `NOT VALID` first, then `VALIDATE CONSTRAINT` in a separate step; add a `NOT NULL` column with a `DEFAULT` and backfill before enforcing the constraint.
- Provide sample **data-migration SQL** for any required backfill.

### 4. Rollback Plan

Provide the SQL and steps to return to the previous state **without losing data** if the applied change causes a production incident. State explicitly when a change is irreversible (e.g. a dropped column) and what must be backed up or snapshotted beforehand.

## Validation Principles

- "Valid SQL" is not the same as "safe" — always check the change against the actual data state.
- Separate schema migrations from data migrations; never assume one step does both safely.
- Recommend a backup or snapshot before any CRITICAL change is applied.
- Lock impact is engine-specific — state the assumed engine (PostgreSQL here) and flag where MySQL or other engines would differ.
