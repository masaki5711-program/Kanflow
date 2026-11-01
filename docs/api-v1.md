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
  `comment:write`, `icebox:write`, `daily:write`, `dev:write` (developer
  writes of AI sessions, see "Development"). A write needs the scope
  **and** the owner's project role (docs/authorization.md): a dev's token
  never creates PBIs or sprints. Missing scope → `403 INSUFFICIENT_SCOPE`
  with `requiredScope`. The form offers presets: read only / developer
  (`read`, `task:write`, `comment:write`, `icebox:write`, `daily:write`, `dev:write`) /
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

`POST /sprints/:sprintId/tasks` also answers `similar` (only when non-empty):
tasks of the same PBI in the sprint that already have the same name (Unicode
NFKC, case and spacing ignored). It is a duplicate hint for scripts and AI
agents; the task is still created.

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

## Development (`dev:write`)

Naming: GitStation's plan documents (06 §4.1, 02 §12–13) call this scope `write:dev`; the implemented name is **`dev:write`** (same `<area>:write` pattern as the other scopes).

Writes of developers' AI sessions (GitStation plan 06 §4.1 / 02 §12–13, Kanflow
step K5). Scope **`dev:write`** (no other scope grants it; part of the
"developer" preset) **and** a project member role (action `dev.write`: PO, SM,
Dev; not section managers). Same write budget, idempotency and error shape as
the other writes; changes carry `via = "api"` / `"mcp"`. **None of them changes
a task or PBI status or sprint** — that stays a human decision (Kanflow
principle: AI proposes, people approve). Code: `app/src/services/dev-work/`,
handlers `app/src/app/api/v1/_lib/v1-dev-handlers.ts`.

| Method & path (under `/api/v1/projects/:projectId`) | Scope | Body / query | Answer |
|---|---|---|---|
| `GET /dev/claims` | `read` | `pbi` (id / `12` / `PBI-12`), `taskId` | open claims, newest heartbeat first: active ones and stale ones (`stale: true`, heartbeat within the last 7 days); at most 200 (`truncated`, `limit`); `staleAfterHours` |
| `POST /dev/claims` | `dev:write` | exactly one of `pbi` / `taskId`; `sessionId` (1–100 visible ASCII); `branch?`; `takeover?` (boolean) | `201 { data: claim, created: true, takenOver, superseded }`; `200` (`created: false`) when the same user + session already claims the same target (heartbeat); `409 TASK_CLAIMED` / `409 CLAIM_LIMIT_REACHED` |
| `PATCH /dev/claims/:claimId` | `dev:write` | `branch?` | heartbeat: `{ data: claim }`; `403 FORBIDDEN` for another user's claim, `409 CLAIM_RELEASED` for a released / taken-over / superseded one, `409 TASK_CLAIMED` when a stale claim was claimed by someone else meanwhile |
| `PUT /dev/claims/:claimId/scope` | `dev:write` | `scope: [{ kind: "path" \| "module", value }]` (the whole set; `[]` clears it) | `{ data: { scope, overlaps, overlapsTruncated? } }` — 触る範囲 (W4, below); **the claim's own user only** (`403 FORBIDDEN` for anyone else, PO / SM included); `400 SCOPE_INVALID` / `400 SCOPE_TOO_LARGE`; `409 CLAIM_RELEASED` |
| `POST /dev/claims/:claimId/release` | `dev:write` | — | `{ data: claim }`: the claim's user, or a **PO / SM / admin for anyone's claim** (role with `sprint.manage`; logged and the holder notified); releasing again answers the released claim |
| `POST /dev/progress` | `dev:write` | `entityType` (`pbi` / `sprint_task`), `entityId` (PBI id / `12` / `PBI-12`, or task id), `body` | `201 { data: comment }` — a normal comment (mentions, notifications, translation, activity) whose row records `via`; the thread shows the "via MCP (AI)" / "via API" badge. `Idempotency-Key` honoured |
| `POST /dev/mr-links` | `dev:write` | `pbi`, `url` (no title: see below) | `201 { data: link, created: true }` / `200 … created: false` when that MR is already linked to the PBI (by the sync or a developer) |

**Work claims (作業の宣言)** — `claim`: `id, projectId, pbi {id, displayId, title},
task {id, name, sprintId} | null` (null = the whole PBI), `user {id, name},
sessionId` (**only on the caller's own claims**, null on other users'), `branch,
startedAt, heartbeatAt, staleAt, releasedAt, releaseReason` (`released` /
`takeover` / `stale` / `moderator`), `active, stale`, `scope` (the declared
触る範囲, `[{ kind, value }]`, modules first; `[]` = none declared).

- **One active claim per target.** A claim on a task overlaps claims on the
  same task and a claim on its whole PBI; a whole-PBI claim overlaps every
  claim on that PBI. Different tasks of one PBI do not overlap.
- An overlapping **active** claim of another user, or of another session of
  the same user, refuses the claim with **`409 TASK_CLAIMED`** and
  `holders: [{ claimId, user {id, name}, sessionId, branch, pbi {id, displayId},
  task {id, name} | null, claimedAt, lastHeartbeatAt, staleAt }]` — `sessionId`
  only when the holder is the caller's own other session (another user's
  session id is never shown). A refusal, not a warning: AI sessions run
  unattended and would ignore a warning. The agent should stop and tell the user.
- **Claims belong to the user.** The session id only tells a user's sessions
  apart: any token / session of the same user may heartbeat or release that
  user's claims.
- **Expiry**: a claim without a heartbeat for `DEV_CLAIM_STALE_HOURS`
  (default 4, 1–168) is stale: it never blocks anyone and is listed with
  `stale: true`. Its user's heartbeat revives it unless someone else claimed
  the target meanwhile (then `409 TASK_CLAIMED`).
- **Stale claims are superseded, not taken over**: a new (or refreshed) claim on
  a target ends every overlapping stale claim — of any user — with
  `releaseReason: "stale"`, lists it in `superseded`, writes it to the activity
  log of the task / PBI (`meta.claimEnded`) and notifies its user
  (`work_claim_ended`). No `takeover` is needed for that.
- **Takeover**: `takeover: true` ends only the **caller's own** other sessions'
  active claims on the target (`releaseReason: "takeover"`, listed in
  `takenOver`, logged, no notification). Another user's active claim is never
  taken over (still `409`); ask them, or a PO / SM, to release it.
- **Release by PO / SM / admin**: `POST …/release` on someone else's claim
  needs a role with `sprint.manage` (PO, SM, admin; otherwise `403`), ends it
  with `releaseReason: "moderator"`, logs it and notifies the claim's user.
- **Cap**: at most `DEV_CLAIM_MAX_OPEN_PER_USER` (default 20, 1–1000) active
  claims per user and project; a new claim beyond it → `409
  CLAIM_LIMIT_REACHED` (a heartbeat of an existing claim is never refused by
  the cap). Not serialized across PBIs: two simultaneous claims on different
  PBIs can exceed it by one.
- **Concurrency**: a claim, heartbeat or release runs in a READ COMMITTED
  transaction that takes an exclusive row lock on the PBI before reading any
  claim, so concurrent claims of one PBI are decided one after another on
  committed data (two sessions can never both win). Heartbeats and releases
  are conditional updates (`releasedAt IS NULL`), so a claim ended meanwhile
  answers `409 CLAIM_RELEASED`. If a PBI ever had more than 100 active claims
  the call fails with `503` and an error log rather than deciding on a partial
  list. Plain claims, heartbeats and own releases are not in the activity log
  (they would flood it).
- An unusable `DEV_CLAIM_*` value is logged once (warning) and the default is used.

**触る範囲 (touched scope, W4)** — `PUT /dev/claims/:claimId/scope` declares
which files / modules the claim's session will touch; it **replaces** the whole
set. Code: `app/src/services/dev-work/dev-work.scope.ts` (pure rules).

- Entries: `{ kind: "path", value }` — a file or directory relative to the
  repository root (POSIX `/`; `\` is read as `/`) — or `{ kind: "module", value }`
  — a crate / package / directory name (`forge-auth`, `services/dev-work`).
  Normalized: trimmed, `./` and `.` segments and repeated / trailing `/` dropped,
  a trailing `/**` or `/*` dropped (a directory covers everything below it);
  case is kept and compared exactly. Refused with `400 SCOPE_INVALID` (the
  message names the first bad entry, `scope[i] …`): empty, absolute (`/x`,
  `C:/x`, `~/x`, `\\server`), a `..` segment, glob characters `* ?` (`[` and
  `]` are ordinary path characters, e.g. Next.js `[projectId]`), control
  characters, more than 300 characters. Exact duplicates
  collapse; more than **200** distinct entries → `400 SCOPE_TOO_LARGE` (the raw
  array is bounded at 1000 → `400 VALIDATION`).
- **Overlap** (a WARNING, never a refusal): path × path when equal or one is a
  prefix of the other on a `/` boundary (`app/src` covers `app/src/x.ts`, not
  `app/srcx`); module × module when equal; module × path when the module's
  segments appear contiguously among the path's (`forge-auth` covers
  `crates/forge-auth/src/lib.rs`), or when the path is a directory containing a
  **known** location of the module (`crates` × `forge-auth` once some declared
  path of the project's claims shows `crates/forge-auth/…`; without such a path
  the module's location is unknown and they do not overlap). Compared with every other **active** claim of
  the project that declared a scope (released and stale claims never count;
  the claim itself never; another session of the same user does).
- Answer: `scope` (stored, normalized, sorted) and `overlaps: [{ claimId,
  user {id, name}, branch, pbi {id, displayId}, task {id, name} | null, paths }]`
  (`paths` = the shared areas) — **never a session id**. More than 200 other
  scoped active claims in the project → the first 200 (newest heartbeat) are
  compared and `overlapsTruncated: true` (logged as a warning). The agent should
  show the overlaps to the user and revisit the plan; nothing is blocked.
- Only the claim's user may declare (any of their sessions); a released claim →
  `409 CLAIM_RELEASED`. The write takes the claim's row lock (a conditional
  update), so two concurrent declarations never mix. Not in the activity log.
- The Kanflow screens show the same overlaps (board cards and the PBI
  「担当中」 panel, one warning line), and the **Git sync** compares the changed
  files of each open merge request it reads (new or updated since the last
  sync, i.e. after a push) with the scope of the PBI's active claims — those on
  the MR's source branch, else all of them — and records the files outside it on
  the MR link (`git_link.outsideScopeCount` / `outsideScopePaths` /
  `scopeCheckedAt`); the PBI panel shows it as one line. Warning only. Changed
  files are compared literally (trimmed, `\` → `/`); an absolute or `..` path
  is skipped and logged, never counted. Open MR links never checked, or checked
  before the PBI's current scope was declared, are rechecked by the next sync
  without a push; a failed lookup clears the link's result (never shown as
  current). The panel shows a result only while an active claim of the PBI has a
  scope, and only if it was checked after that scope was declared. GitLab cost:
  `GET /projects/:id/merge_requests/:iid/diffs` (≤ 3 pages of 100 files, diff text
  included; `/changes` on GitLab < 15.7) per checked MR, at most 10 MRs and 20 s
  per repository and sync (fresh MRs first, then rechecks); a project without a
  scoped active claim costs one database query and no request.

**MR links** — the URL must be `https://<host>/<group>/<repo>/-/merge_requests/<iid>`
(a sub-page such as `/diffs`, a query or a fragment is dropped) on a host in
`GIT_ALLOWED_HOSTS`, and the repository must be registered in the project's
**enabled** Git integration; otherwise `400 MR_URL_INVALID` (malformed or
undecodable, `.` / `..` or encoded `/` segments, http, credentials, port,
foreign host, not an MR) or `400 MR_REPOSITORY_NOT_REGISTERED` (another
project's repository answers the same). The link is a `git_link` of kind `mr`
with `declaredBy` / `declaredAt` (the PBI's 開発 panel shows "手動でリンク");
the URL is rebuilt from the repository and the number, nothing else of the
input is stored, and a client title is not accepted. Title / state come from
the sync: from the same MR already synced for another PBI, otherwise `!<iid>`
and **state `null` (unknown)** until the next sync reads the MR; the sync
keeps them current. **A declared-only link is display only**: auto-complete on
merge, release readiness and delivery insights use only Git-derived links
(the PBI number in the MR title or branch). When Git itself names the PBI
later, the sync turns the link into a Git-derived one (declared marker
cleared). `link`: `id, kind, ref, title, url, state, repository {id, name},
pbi {id, displayId}, declared, declaredAt, declaredBy {id, name} | null,
createdAt`. Linking is recorded on the PBI's activity log (`meta.gitLink`).

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
| `DEV_CLAIM_STALE_HOURS` | `4` | Hours without a heartbeat after which a work claim is stale (1–168) |
| `DEV_CLAIM_MAX_OPEN_PER_USER` | `20` | Active work claims per user and project (1–1000) |

Schema: table `ApiToken` (migrations `20261005000000_api_tokens_metrics`,
`20261030000000_api_token_scopes` for `projectIds`); work claims `work_claim`,
`git_link.declaredById / declaredAt`, `Comment.via` (migration
`20261030160000_dev_work_claims`), `work_claim.releaseReason / releasedById`
(`20261030170000_work_claim_release_reason`).
