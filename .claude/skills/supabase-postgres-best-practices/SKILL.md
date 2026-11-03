---
name: supabase-postgres-best-practices
origin: community
description: Postgres performance optimization and best practices from Supabase, plus this project's TimescaleDB addendum (hypertables, continuous aggregates, retention, compression). Use this skill when writing, reviewing, or optimizing Postgres/TimescaleDB queries, schema designs, or database configurations for PFE/PFS.
license: MIT
metadata:
  author: supabase
  version: "1.1.1"
  organization: Supabase
  date: January 2026
  abstract: Comprehensive Postgres performance optimization guide for developers using Supabase and Postgres. Contains performance rules across 8 categories, prioritized by impact from critical (query performance, connection management) to incremental (advanced features). Each rule includes detailed explanations, incorrect vs. correct SQL examples, query plan analysis, and specific performance metrics to guide automated optimization and code generation.
---

# Supabase Postgres Best Practices

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact to guide automated query optimization and schema design.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
references/query-missing-indexes.md
references/query-partial-indexes.md
references/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)

## TimescaleDB Addendum (IoTPF project — not part of the upstream Supabase guide)

This project's datastore is fixed as **self-hosted PostgreSQL + TimescaleDB on
both PFE and PFS** (CLAUDE.md §1.5); Supabase-as-a-service is disqualified by
the data-sovereignty rule. The upstream rules above still apply — this addendum
covers what plain-Postgres guidance misses on time-series tables.

| Concern | Rule | Why |
|---------|------|-----|
| Table type | Time-series fact tables (Tier-1 measurement series, high-frequency frames) are hypertables partitioned on the event-time column | Chunk pruning is what keeps range scans bounded at sensor rates |
| Primary key | A hypertable's PK/unique index must include the partition (time) column; plan composite keys from the start | Timescale cannot enforce uniqueness across chunks without it |
| Foreign keys | Outbound FKs (hypertable → plain table) are normal — declare them. Inbound FKs into a hypertable must reference the full composite PK; never add a single-column UNIQUE across a hypertable to work around this | See `.claude/rules/iotpf-pfs-data-model.md` §1 FK-direction note |
| Retention | Every class-2 (local-only) time-series table carries `add_retention_policy` — short for high-frequency frames; state the period in the table COMMENT | Bounded growth is a contract (§2.1), not an optimization |
| Downsampling | Continuous aggregates (`time_bucket` rollups + refresh policy) are the standard form of the decimated stream ZEVA-Engine watches and of OEE/dashboard reads | Never aggregate raw rows per query on the hot path |
| Compression | Enable native compression on chunks past the active window; `segmentby` = the query axis (device/channel), `orderby` = time | Storage and scan cost on always-on ingest |
| Queries | Every time-series query carries a time-range predicate and uses `time_bucket` for grouping; unbounded queries are a review BLOCK | CLAUDE.md §4 — never issue unbounded queries; paginate |
| Ops | Chunk interval sized so recent chunks fit memory; reorder/vacuum policies follow chunk boundaries | Default 7-day chunks are rarely right for millisecond streams |

When a migration touches a hypertable, the review sequence in
`.claude/rules/iotpf-pfs-data-model.md` §8 applies (freeze check first).

## References

- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/row-level-security
- https://docs.timescale.com/ (hypertables, continuous aggregates, compression, data retention)
