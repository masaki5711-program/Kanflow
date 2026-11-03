---
name: db-query-performance-optimizer
description: Analyze generated or modified SQL and ORM code (Prisma, TypeORM, Drizzle, SQLAlchemy, etc.) for performance bottlenecks that only appear under production-scale data — N+1 queries, full table scans, and unbounded result sets. Use when reviewing or writing any database access code.
origin: project
---

# DB Query Performance Optimizer

Analyze SQL and ORM code for bottlenecks that do not show up on a small dev dataset but degrade or break the system once tables hold production-scale data.

A query that runs in 1ms against 100 rows can take 30s against 1,000,000 rows. Always review against the row counts the table will realistically reach.

## When To Use

- reviewing or writing ORM code that loads relations (Prisma, TypeORM, Drizzle, SQLAlchemy, …)
- adding a list / search / report endpoint
- any data-access path that runs inside a loop or serves a request at scale

## Validation Points

### 1. N+1 queries

- Check whether a DB access happens inside a loop — one query per row.
- Confirm relations are loaded with eager loading — a `JOIN` or an `IN (...)` batch — rather than one query per parent row.
- ORM signals: accessing a lazy relation inside `.map()` / `for` loops; a missing `include` / `relations` / `joinedload` / `with`.

### 2. Index effectiveness

- Columns used in `WHERE`, `JOIN ... ON`, and `ORDER BY` should be backed by an index.
- Watch for query shapes that defeat indexes: a leading wildcard `LIKE '%x'`, a function wrapped around an indexed column (`WHERE lower(email) = …`), or an implicit type cast.
- For a composite index, confirm the query filters on a left-to-right prefix of its columns.

### 3. Memory exhaustion / unbounded results

- Flag full-table fetches: `.findAll()`, `SELECT *` with no `LIMIT`, `find()` with no filter.
- Confirm large result sets use `LIMIT` / `OFFSET` — or, better for deep pages, cursor-based (keyset) pagination.
- Large tables should be processed with streaming or batching, not loaded entirely into memory.

## Execution Instructions

When reviewing code that accesses the database, report in this format.

### 1. N+1 Risk

Is the relation-loading strategy optimal? Name the loop and the per-row query if one exists.

### 2. Complexity / Load Risk

Identify the places that become slow queries once the table exceeds ~1,000,000 rows — a missing index, a full scan, or an unbounded fetch.

### 3. Improved Code

Output the better query / ORM form — a batch load (`IN` / dataloader), an eager-loading `include` / `join`, an added index, or pagination — as concrete, copy-paste-ready code.

## Notes

- Confirm the fix with the database's query planner (`EXPLAIN ANALYZE` on PostgreSQL) against representative data, not a dev sample.
- Adding an index to a large table is itself a risk — see the `db-data-integrity-validator` skill for safe index creation (`CREATE INDEX CONCURRENTLY`).
