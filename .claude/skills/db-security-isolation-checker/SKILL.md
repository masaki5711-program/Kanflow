---
name: db-security-isolation-checker
description: Verify data-access code for multi-tenant data isolation and database security — tenant/owner scoping on every query, parameterized statements instead of string-built SQL, and consistency with Row-Level Security policies. Use when reviewing or writing any query that reads or writes tenant-owned data.
origin: project
---

# DB Security & Isolation Checker

Verify that data-access code keeps tenants isolated and is safe against injection. In a B2B or multi-factory system, a single missing `WHERE tenant_id = …` can leak or overwrite another tenant's data.

## When To Use

- reviewing or writing `SELECT` / `UPDATE` / `DELETE` against tenant-owned tables
- adding a repository method, API handler, or raw SQL query
- changing how queries are built (query builders, string interpolation, ORM raw queries)

## Validation Points

### 1. Tenant leak detection

- Every `SELECT` / `UPDATE` / `DELETE` on a tenant-scoped table must carry an ownership predicate in its `WHERE` clause — `tenant_id`, `org_id`, `user_id`, `factory_id`, or equivalent.
- The tenant value must come from the authenticated request context — never from a client-supplied parameter trusted as-is.
- `UPDATE` / `DELETE` with no `WHERE`, or a `WHERE` keyed only on a public row id, are the highest-risk cases — a row id alone does not prove ownership.

### 2. SQL injection

- No dynamic SQL built by string concatenation or interpolation of request data.
- All variable values must be passed as placeholders / bind parameters (`$1`, `?`, named binds) — never formatted into the SQL text.
- ORM raw-query escape hatches (`$queryRawUnsafe`, `query(\`...\`)`, `.raw()`) must still use parameter binding.

### 3. Row-Level Security (RLS)

- When PostgreSQL RLS is in use, check that the code does not bypass it — connecting as a superuser / `BYPASSRLS` role, or `SET ROLE` / `SET row_security = off`.
- Confirm the session sets the tenant context the RLS policy depends on (e.g. `SET app.current_tenant`).
- Static review of RLS is limited: it cannot prove a query is consistent with policies it cannot see. Flag RLS-relevant code for a human reviewer who knows the policy definitions.

## Execution Instructions

When reviewing data-access code, report in this format.

### 1. Tenant Isolation

For each query, state whether an ownership predicate is present and where the tenant value originates. Flag any query that could touch another tenant's rows.

### 2. Injection Safety

Identify any string-built SQL and show the parameterized rewrite.

### 3. RLS Consistency

Note any RLS bypass or missing tenant-context setup. Mark items that need human verification against the policy definitions.

### 4. Fixed Code

Output the corrected query with the ownership predicate and bind parameters in place, as copy-paste-ready code.
