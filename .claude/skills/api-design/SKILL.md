---
name: api-design
description: REST API contract design — resource naming, HTTP method/status-code selection, response envelope, pagination strategy, filtering/sorting conventions, versioning, and rate limiting. Use when: designing or reviewing an HTTP endpoint contract on the L3 API (TypeScript, Fastify), adding pagination/filtering/sorting to a list endpoint, choosing status codes or error-response shape, or planning a version bump. Do not use when: implementing server internals behind the contract — layering, caching, retries (backend-patterns); gRPC/proto or MQTT interfaces (api-design is REST-only; see apps proto contracts); Edge MCP tool contracts (pfe-edge-mcp-toolset); DB query design (supabase-postgres-best-practices).
origin: ECC
---

# API Design (REST contracts, L3)

## Repo-specific constraints

- L3 API surface is TypeScript (Fastify, the same as the existing L3 API); real-time to L4 is SSE. Validate every request body/query with a Zod schema at the boundary; error responses never leak internals (stack traces, SQL).
- All list endpoints are paginated — unbounded queries are forbidden (CLAUDE.md §4).
- Timestamps in payloads are ISO 8601 with offset (TZ-aware end to end); include `plant_code` context where multi-plant data flows.
- Rate limiting on every endpoint; auth required unless explicitly marked public.

## Resource naming rules

- Nouns, plural, lowercase kebab-case; no verbs in URLs. Nested paths only for real ownership (one level max).
- Non-CRUD actions: sparing verb-suffix POST (e.g. cancel, refresh) — not new resource nouns.
- Filtering/sorting/search via query params: bracket operators for comparisons (`price[gte]`), comma lists for multi-value, `-` prefix for descending sort, `q` for full-text, `fields` for sparse fieldsets.

## Method semantics

| Method | Idempotent | Safe | Use for |
|---|---|---|---|
| GET | Yes | Yes | Reads |
| POST | No | No | Create, non-CRUD actions |
| PUT | Yes | No | Full replacement |
| PATCH | No (can be) | No | Partial update |
| DELETE | Yes | No | Removal |

## Status codes — decision table

| Code | When |
|---|---|
| 200 | GET / PUT / PATCH success with body |
| 201 | POST created — include `Location` header |
| 204 | DELETE (or bodiless PUT) success |
| 400 | Malformed request (bad JSON, wrong types) |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not authorized |
| 404 | Resource does not exist (also for hiding others' resources) |
| 409 | Duplicate / state conflict |
| 422 | Well-formed but semantically invalid data |
| 429 | Rate limit exceeded — include `Retry-After` |
| 500 | Unexpected failure — generic message only |
| 502 / 503 | Upstream failure / temporary overload (`Retry-After`) |

Never return 200 with an in-body error flag; never 500 for validation failures.

## Response envelope

Success: `data` wrapper; collections add `meta` (pagination) and `links`. Error: `error` object with machine `code`, human `message`, optional field-level `details` array — one shape across all endpoints.

## Pagination — decision table

| Use case | Type |
|---|---|
| Admin dashboards, small datasets (<10K) | Offset (`page`/`per_page`) |
| Infinite scroll, feeds, large/time-series data | Cursor (opaque, keyset-backed) |
| Public APIs | Cursor default, offset optional |
| Search results (users expect page numbers) | Offset |

Offset degrades at large offsets and shifts under concurrent inserts; cursor is stable but cannot jump to page N. Fetch limit+1 to compute `has_next`.

## Versioning rules

URL path versioning (`/api/v1/`); at most 2 active versions. Breaking (new version): remove/rename fields, change types, URL structure, or auth. Non-breaking (no version): additive fields, optional params, new endpoints. Deprecation: announce → `Sunset` header → 410 after sunset.

## Contract checklist

- [ ] Naming conventions; correct method; semantic status codes
- [ ] Zod-validated input; standard error shape; no internal leakage
- [ ] Pagination on lists; auth + ownership authorization; rate limit
- [ ] Consistent field casing with existing endpoints; OpenAPI spec updated

## Related (read first)

- `backend-patterns` skill — implementation layering behind the contract.
- `pfe-edge-mcp-toolset` skill — Edge MCP tool contracts (Flow B), not REST.
- `security-review` skill / `security-reviewer` agent — before commit on new endpoints.
- `e2e-testing` skill — API integration test authoring.
