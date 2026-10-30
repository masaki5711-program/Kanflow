# Kanflow REST API (v1)

A JSON API under `/api/v1` for scripts, reports, integrations (Excel / Power
Query, BI tools, CI jobs) and the Kanflow MCP server (Claude Code). It
exposes the same data a user can see in the UI, with the same project
permissions. Writes (see "Writes") need a write scope on the token **and**
the owner's project role.

- Code: routes `app/src/app/api/v1/**`, wrappers `app/src/app/api/v1/_lib/v1-route.ts` (reads) and `v1-write.ts` (writes),
  auth `app/src/services/api-tokens/api-token-auth.ts`, queries `app/src/services/api-v1/`
- Tokens: `app/src/services/api-tokens/`, UI `/me` (own tokens) and `/admin/api-tokens` (all tokens)

## Authentication

Every request needs a **personal access token** in the `Authorization` header:

```
Authorization: Bearer kfl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

- Create a token on **個人設定 (`/me`) → 個人アクセストークン**: a name and an
  expiry (30 / 90 / 365 days; "no expiry" only when the server sets
  `API_TOKEN_ALLOW_NO_EXPIRY=true`). The token is shown **once**; copy it then.
- Format: `kfl_` + 43 characters (32 random bytes, base64url). The server only
  stores its SHA-256 hash; the list shows the first 12 characters (`kfl_` + 8)
  so you can tell tokens apart.
- **Session cookies are not accepted** on `/api/v1` (a browser session cannot
  call it, so CSRF does not apply). Conversely, tokens are not accepted on the
  UI API (`/api/projects/...`).
- A token acts as its owner, with the owner's **current** rights: the system
  role is read from the database on every request (cached up to 30 s), and
  project access follows the same rules as the UI (docs/authorization.md).
  Every v1 endpoint needs only `project.view`.
- **Scopes** (chosen at creation, `read` is always included): `read`,
  `backlog:write`, `backlog:reorder`, `sprint:write`, `task:write`,
  `comment:write`, `icebox:write`, `daily:write`. A write needs the scope
  **and** the owner's project role (docs/authorization.md): a dev's token
  never creates PBIs or sprints. Missing scope → `403 INSUFFICIENT_SCOPE`
  with `requiredScope`. The form offers presets: read only / developer
  (`read`, `task:write`, `comment:write`, `icebox:write`, `daily:write`) /
  PO・SM (all).
- **Project restriction** (optional): limit a token to some projects; every
  other project answers 404 and is left out of `/projects`.
- Revoke a token on `/me` (own tokens) or `/admin/api-tokens` (admins, any
  token). Tokens are also **revoked automatically** when an admin deactivates
  the user, changes their system role or resets their password (the same
  moments that end the user's browser sessions).
- Limits: `API_TOKEN_MAX_PER_USER` active tokens per user (default 5).
  `API_TOKENS_ENABLED=off` disables the whole API (403) and token creation;
  existing tokens are kept and work again when re-enabled.

## Responses

Success: `200` with a JSON envelope

```json
{ "data": ..., "nextCursor": "..." }
```

`nextCursor` only on paginated endpoints (`null` on the last page). Dates are
ISO 8601 strings in UTC. Responses are never cached (`Cache-Control: no-store`).

Errors: `{ "error": "<message>", "code": "<CODE>" }`

| Status | code | When |
|---|---|---|
| 400 | `VALIDATION` | Bad query parameter (unknown `status`, `limit` out of range, malformed `cursor`) |
| 401 | `UNAUTHORIZED` | Missing / malformed / unknown / revoked / expired token, or the owner is deactivated or had their sessions revoked. Always the same body; `WWW-Authenticate: Bearer realm="kanflow"` |
| 403 | `FORBIDDEN` | The API is disabled (`API_TOKENS_ENABLED=off`), the token lacks the `read` scope, or (writes) the owner's project role does not allow the action |
| 403 | `INSUFFICIENT_SCOPE` | (writes) The token lacks the scope of the action; the body names it in `requiredScope` |
| 404 | `NOT_FOUND` / `SPRINT_NOT_FOUND` | The project does not exist, is in the trash, the token owner has no access to it, or the token is limited to other projects (existence is not revealed); unknown sprint of the project |
| 429 | `RATE_LIMITED` | Rate limit exceeded; see `Retry-After` |
| 500 | `INTERNAL` | Server error (details only in the server log) |

## Rate limits

- **Per token**: `API_V1_RATE_LIMIT_PER_MIN` requests per sliding minute
  (default **120**). Every success response carries
  `X-RateLimit-Limit` and `X-RateLimit-Remaining`; a `429` carries
  `Retry-After` (seconds).
- **Failed authentications** (brute-force guard): 30 per minute per client IP
  (taken from `X-Forwarded-For`, so only meaningful behind a proxy that sets
  it), then `429` for that IP. There is deliberately no all-clients cap:
  a shared counter would let anyone lock out every token holder, and
  256-bit tokens are not guessable.
- Limits are kept in memory per web process and reset on restart.
- `lastUsedAt` (shown on `/me`) is updated at most once per minute per token.

## Pagination

Paginated endpoints take `limit` (1–100, default 50) and `cursor` (the
`nextCursor` of the previous page, opaque). Keep all other query parameters
the same between pages. Keyset pagination: rows inserted while you page do
not shift or duplicate earlier pages.

```bash
cursor=""
while :; do
  page=$(curl -s -H "Authorization: Bearer $KANFLOW_TOKEN" \
    "https://kanflow.example.local/api/v1/projects/$P/backlog?limit=100${cursor:+&cursor=$cursor}")
  echo "$page" | jq -c '.data[]'
  cursor=$(echo "$page" | jq -r '.nextCursor // empty')
  [ -z "$cursor" ] && break
done
```

## Endpoints

Reads (`GET`). `:projectId` / `:sprintId` are the ids returned by the list endpoints.

| Endpoint | Returns | Query |
|---|---|---|
| `/api/v1/me` | The token owner: `id, name, email, role, language, department` | |
| `/api/v1/projects` | Projects the owner can access (admin: all; section manager: member projects + projects of their sections; others: member projects), most recently updated first, at most 1000 (not paginated). Trashed projects never appear. Fields: `id, name, description, status, projectType, progressPct, pointUnit, language, sprintDurationDays, createdAt, updatedAt` | `status=active` (default) \| `archived` |
| `/api/v1/projects/:projectId` | The same project fields as the list, plus `sections[] {id,name}` and `members[] {userId,name,role}` | |
| `/api/v1/projects/:projectId/backlog` | PBIs (not trashed), oldest first: `id, displayId, status, initiative, epic, userStory, acceptanceCriteria, workloadScore, assignedPo, sortOrder, productGoalId, planItemId, completedAt, createdAt, updatedAt`. Paginated | `status=ready\|not_ready\|completed`, `limit`, `cursor` |
| `/api/v1/projects/:projectId/sprints` | Sprints, newest first: `id, name, status, startDate, endDate, sprintGoal, capacity, actualScore, createdAt, updatedAt` | |
| `/api/v1/projects/:projectId/sprints/:sprintId/tasks` | Tasks of the sprint (tasks of trashed PBIs hidden): `id, taskName, status, estimatedHours, actualHours, completedAt, pbi {id, displayId}, assignees [{id, name}], createdAt, updatedAt` | |
| `/api/v1/projects/:projectId/plan` | Master-plan items (not trashed), flat — build the tree from `parentId`: `id, parentId, name, status, progressPct, plannedStart, plannedEnd, actualStart, actualEnd, isMilestone, sortOrder, createdAt, updatedAt` (`plannedStart` / `plannedEnd` are `null` for undated items, e.g. stages just loaded from a plan template) | |
| `/api/v1/projects/:projectId/releases` | Release items: `id, planVersion, releaseVersion, releaseDate, status, initiative, epic, userStory, pbi {id, displayId} \| null` (null when the source PBI is trashed), `createdAt, updatedAt` | |
| `/api/v1/projects/:projectId/activity` | Change history, newest first (same entries as the dashboard feed): `id, projectId, entityType, entityId, action, actor {id,name} \| null, changes, label, meta, createdAt`. Paginated | `entityType` (project, pbi, sprint, sprint_task, icebox, ...), `limit`, `cursor` |

Free-text fields are returned as stored (original language); translations are
not part of v1.

Also: `GET /api/v1/projects/:projectId/backlog/:itemId` (one PBI with
`referenceDoc`, `poNote`, `notReadyReason`, `iceboxItemId`, `version` and its
`tasks[] {id, sprintId, taskName, status, estimatedHours, actualHours, version, assignees}`;
`:itemId` = id, `12` or `PBI-12`) and
`GET /api/v1/projects/:projectId/comments?entityType=pbi|sprint_task|icebox&entityId=&cursor=&limit=`
(a thread, oldest first, paginated). Backlog and task rows carry `version`.

## Writes

Body: JSON, validated by the **same schema as the UI API** and executed by the
same service (same rules, notifications and activity log). Response:
`{ "data": <the created / updated object as the UI API returns it> }`.
Changes are recorded in the activity log with `meta.via = "api"`.
The Kanflow MCP server (`/api/mcp`, see [mcp.md](mcp.md)) runs the same
operations (`app/src/app/api/v1/_lib/v1-handlers.ts`) through the same write
path (`runV1Write`); its changes carry `meta.via = "mcp"`.

| Method & path (under `/api/v1/projects/:projectId`) | Scope | Roles | Body |
|---|---|---|---|
| `POST /backlog` → 201 | `backlog:write` | PO, SM | `userStory` or `initiative` (required), `epic`, `acceptanceCriteria`, `referenceDoc`, `workloadScore`, `status`, `productGoalId`, `iceboxItemId`, `assignedPo`, `poNote`, `notReadyReason` |
| `PATCH /backlog/:itemId` | `backlog:write` | PO, SM | any of the above, `planItemId`, `version` (`sortOrder` is ignored) |
| `POST /sprints` → 201 | `sprint:write` | PO, SM | `sprintName`, `startDate`, `endDate`, `sprintGoal`, `capacity`, `selectedPbIds[]`, `carryOver {fromSprintId, pbItemIds[]}` |
| `PATCH /sprints/:sprintId` | `sprint:write` | PO, SM | `sprintName`, `startDate`, `endDate`, `sprintGoal`, `capacity`, `status`, review / retrospective fields, `version` |
| `POST /sprints/:sprintId/pbis` → 201 (200 if nothing new) | `sprint:write` | PO, SM | `pbIds[]` (1–50) |
| `POST /sprints/:sprintId/tasks` → 201 | `task:write` | members | `pbItemId`, `taskName`, `assigneeIds[]`, `estimatedHours` |
| `PATCH /sprints/:sprintId/tasks/:taskId` | `task:write` | members | `status` (`todo`/`in_progress`/`review`/`done`), `actualHours`, `estimatedHours`, `taskName`, `assigneeIds[]`, `completionComment`, `version` |
| `POST /sprints/:sprintId/daily-scrums` → 201 | `daily:write` | members | `date`, `content` |
| `POST /comments` → 201 | `comment:write` | members | `entityType` (`pbi`/`sprint_task`/`icebox`), `entityId`, `body` |
| `POST /icebox` → 201 | `icebox:write` | members, section managers | `request`, `background`, `author`, `assignedPo` |

No deletes through the API.

- **Conflicts**: send the `version` you read; a stale one → `409 VERSION_CONFLICT`.
- **Idempotency-Key** (all `POST` creates except `/pbis`): a retry with the same
  key and body returns the first success again (`Idempotent-Replayed: true`)
  instead of creating a duplicate; the same key with another body → 409.
  Keys: 1–200 visible ASCII characters, kept 24 h in memory per web process
  (a restart forgets them). Failed attempts are not kept.
- **Write budget**: `API_V1_WRITE_RATE_LIMIT_PER_MIN` writes per token per
  minute (default 30) on top of the request limit → 429 + `Retry-After`.
- Errors: as above, plus `400 INVALID_JSON`, `403 INSUFFICIENT_SCOPE`
  (`requiredScope`), `403 FORBIDDEN` (role), `404 PBI_NOT_FOUND` /
  `SPRINT_NOT_FOUND` / ..., `409 VERSION_CONFLICT` / `CONFLICT`.

## Examples

```bash
export KANFLOW_TOKEN=kfl_...        # never commit it; use a secret store in CI
BASE=https://kanflow.example.local

# Who am I?
curl -s -H "Authorization: Bearer $KANFLOW_TOKEN" $BASE/api/v1/me

# My active projects
curl -s -H "Authorization: Bearer $KANFLOW_TOKEN" $BASE/api/v1/projects | jq '.data[] | {id, name, progressPct}'

# Ready PBIs of a project
curl -s -H "Authorization: Bearer $KANFLOW_TOKEN" "$BASE/api/v1/projects/$P/backlog?status=ready&limit=100"

# Tasks of the newest sprint
S=$(curl -s -H "Authorization: Bearer $KANFLOW_TOKEN" $BASE/api/v1/projects/$P/sprints | jq -r '.data[0].id')
curl -s -H "Authorization: Bearer $KANFLOW_TOKEN" $BASE/api/v1/projects/$P/sprints/$S/tasks

# Last 20 changes to PBIs
curl -s -H "Authorization: Bearer $KANFLOW_TOKEN" "$BASE/api/v1/projects/$P/activity?entityType=pbi&limit=20"
```

PowerShell:

```powershell
$h = @{ Authorization = "Bearer $env:KANFLOW_TOKEN" }
Invoke-RestMethod -Headers $h "$base/api/v1/projects" | Select-Object -ExpandProperty data
```

## Security notes (operators)

- Tokens are never written to logs: token events are logged with the user id
  and the 12-character prefix (`patPrefix`) only, and the logger masks any
  `kfl_...` string and `Bearer ...` header that reaches it.
- Token lookup is one UNIQUE-index probe on the SHA-256 hash (no string
  comparison of secrets in application code).
- Admins see and revoke every token on `/admin/api-tokens`; creation and
  revocation are logged (`module: api-tokens`).
- The API is served by the same process and port as the UI; put it behind the
  same HTTPS reverse proxy. Do not expose it more widely than the UI.

## Settings (`app/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `API_TOKENS_ENABLED` | `on` | `off` = `/api/v1` answers 403 and tokens cannot be created |
| `API_TOKEN_MAX_PER_USER` | `5` | Active (not revoked, not expired) tokens per user |
| `API_TOKEN_ALLOW_NO_EXPIRY` | `false` | Allow tokens without an expiry |
| `API_V1_RATE_LIMIT_PER_MIN` | `120` | Requests per token per minute |
| `API_V1_WRITE_RATE_LIMIT_PER_MIN` | `30` | Writes per token per minute (on top of the request limit) |

Schema: table `ApiToken` (migrations `20261005000000_api_tokens_metrics`,
`20261030000000_api_token_scopes` for `projectIds`).
