# Project authorization

All project-scoped API routes (`src/app/api/projects/[projectId]/**`) authorize through one API:

```ts
import { requireProject } from "@/lib/authz"

const gate = await requireProject(projectId, "backlog.write")
if ("error" in gate) return gate.error
const { session, actor, via } = gate
```

- Policy (pure, no I/O): `src/lib/authz/policy.ts` — `can(actor, action)`
- Gate (auth + DB lookup): `src/lib/authz/require-project.ts` — `requireProject(projectId, action)`
- Tests: `src/lib/authz/__tests__/`

`requireProjectMember` / `requireProjectAccess` in `src/lib/api-helpers.ts` are **deprecated** wrappers over the same gate. No route calls them any more.

## Actor

| Field | Source |
|---|---|
| `userId` | session |
| `systemRole` | `User.role` from the session (`admin` / `section_manager` / `member`) |
| `projectRole` | `ProjectMember.role` for this project (`po` / `sm` / `dev`), or `null` |
| `isSectionManagerOfProject` | `systemRole === "section_manager"` and one of the user's sections (`UserSection`) is assigned to the project (`ProjectSection`) |

Rights are the **union** of every path the actor has: a section manager who is also a `dev` member gets both sets.

## Response codes

| Situation | Status |
|---|---|
| No session | 401 |
| Not admin, not a member, not a section manager of the project's section | **404** (the project's existence is not revealed) |
| The project does not exist or is in the trash (`deletedAt` set) — admins included | **404** |
| Has access to the project but the action is not allowed | 403 |

System admins skip the membership lookup; every request (admins included) does one project liveness lookup (`isProjectLive`: exists and `deletedAt IS NULL`). A trashed project is restored or purged only through `/api/admin/trash/projects` (`requireAdmin()`).

## Matrix

"Member" means any explicit project member (`po`, `sm`, `dev`, or an unrecognised member role). "Section mgr" means a section manager of the project's section who is **not** a member.

| Action | Admin | PO | SM | Dev | Section mgr |
|---|:-:|:-:|:-:|:-:|:-:|
| `project.view` | Y | Y | Y | Y | Y |
| `project.updateAppearance` | Y | Y | Y | Y | - |
| `project.update` | Y | Y | Y | - | - |
| `project.updateProgress` | Y | Y | - | - | - |
| `project.updateSections` | Y | Y | - | - | - |
| `project.delete` | Y | Y | - | - | - |
| `member.manage` | Y | Y | Y | - | - |
| `backlog.write` | Y | Y | Y | - | - |
| `backlog.delete` | Y | Y | - | - | - |
| `backlog.reorder` | Y | Y | - | - | - |
| `goal.write` | Y | Y | Y | - | - |
| `plan.write` | Y | Y | Y | - | - |
| `release.manage` | Y | Y | - | - | - |
| `improvement.track` | Y | Y | Y | Y | - |
| `milestone.track` | Y | Y | Y | Y | - |
| `sprint.manage` | Y | Y | Y | - | - |
| `task.write` | Y | Y | Y | Y | - |
| `dailyScrum.write` | Y | Y | Y | Y | - |
| `event.write` | Y | Y | Y | Y | - |
| `attachment.write` | Y | Y | Y | Y | - |
| `icebox.write` | Y | Y | Y | Y | Y |
| `ai.use` | Y | Y | Y | Y | - |
| `ai.draftPbi` | Y | Y | Y | - | - |
| `trash.manage` | Y | Y | Y | - | - |
| `trash.purge` | Y | Y | - | - | - |
| `comment.write` | Y | Y | Y | Y | - |
| `comment.moderate` | Y | Y | - | - | - |
| `surveillance.configure` | Y | Y | - | - | - |
| `git.configure` | Y | Y | Y | - | - |
| `git.sync` | Y | Y | Y | Y | - |
| `dev.write` | Y | Y | Y | Y | - |

## Route → action

Paths are relative to `/api/projects/[projectId]`.

| Route | GET | POST | PUT / PATCH | DELETE |
|---|---|---|---|---|
| `/` | project.view | | PATCH: project.updateAppearance, then per field: project.update (anything besides `cardColor`), project.updateProgress (`progressPct`), project.updateSections (`sectionIds`) | project.delete |
| `/favorite` | | project.view | | project.view |
| `/members` | project.view | member.manage | | |
| `/members/[memberId]` | | | member.manage | member.manage |
| `/backlog` | project.view | backlog.write | | |
| `/backlog/[itemId]` | project.view | | backlog.write | backlog.delete |
| `/backlog/reorder` | | | PUT: backlog.reorder | |
| `/backlog/export` | project.view (xlsx) | | | |
| `/backlog/import` | | backlog.write (multipart xlsx; `?dryRun=1` = preview only) | | |
| `/backlog/import/template` | backlog.write (xlsx) | | | |
| `/backlog/[itemId]/ai/invest-review` | | ai.use | | |
| `/backlog/[itemId]/acceptance-criteria` (受入基準 items, W5; GET also answers `canEdit` = backlog.write) | project.view | backlog.write | | |
| `/backlog/[itemId]/acceptance-criteria/[acRef]` | | | backlog.write | backlog.write (soft delete) |
| `/goals` | project.view | goal.write | | |
| `/goals/[goalId]` | | | goal.write | goal.write |
| `/plan` | project.view | plan.write | | |
| `/plan/[itemId]` | | | plan.write | plan.write |
| `/plan/reorder` | | plan.write | | |
| `/plan/[itemId]/links` | project.view | | plan.write (PUT) | |
| `/plan/linkable-pbis` | project.view | | | |
| `/plan/baseline` | | plan.write | | plan.write |
| `/plan/dependencies` | | plan.write | | |
| `/plan/dependencies/[dependencyId]` | | | | plan.write |
| `/plan/export` | project.view | | | |
| `/plan/schedule-from` | | plan.write | | |
| `/plan/templates/apply` | | plan.write | | |
| `/plan/templates/applications` | project.view | | | |
| `/plan/templates/save` | | plan.write | | |
| `/releases` | project.view | | | |
| `/releases/[id]` | | | release.manage | release.manage |
| `/releases/import` | | release.manage | | |
| `/improvements` | project.view (改善成果ボード: items, summary, rollout suggestions, `permissions` hint) | | | |
| `/improvements/summary` | project.view | | | |
| `/improvements/export` | project.view (xlsx: summary + A3 QC story per item) | | | |
| `/improvements/[id]` | project.view | | PATCH: release.manage (effect, 標準化, 展開日, stage) | release.manage (photos' files removed too) |
| `/improvements/[id]/rollouts` | | release.manage (add a 横展開先) | | |
| `/improvements/[id]/rollouts/reorder` | | | PUT: release.manage | |
| `/improvements/[id]/rollouts/[rolloutId]` | | | PATCH: improvement.track for `status`; renaming (`targetName`) also needs release.manage (403) | release.manage |
| `/improvements/[id]/checks` | | release.manage (custom 定着確認 date) | | |
| `/improvements/[id]/checks/[checkId]` | | | PATCH: improvement.track (record / clear the result) | release.manage |
| `/improvements/[id]/photos` | project.view | improvement.track (multipart `phase` + image `file`) | | |
| `/improvements/[id]/photos/[photoId]` | project.view (image) | | | improvement.track |
| `/milestones` | project.view (マイルストーン・検収ボード: stages from 全体計画, checks, punch list, documents, budget, trend, summary, `permissions` / `viewerId` hints; seeds pending template loads) | | | |
| `/milestones/export` | project.view (xlsx: summary, check record with signature columns, punch list, documents, trend) | | | |
| `/milestones/settings` | | | PATCH: plan.write (check 呼び名, 予算 / 推移 on-off) | |
| `/milestones/stages/[planItemId]/checklist` | | | PUT: milestone.track (tick / untick a 完了条件) | |
| `/milestones/checks` | | plan.write | | |
| `/milestones/checks/[checkId]` | | | PATCH: milestone.track for result / 立会者 / day / note; `name`, `criterion`, `planItemId`, `sortOrder` also need plan.write (403) | plan.write |
| `/milestones/punch` | | milestone.track | | |
| `/milestones/punch/[punchId]` | | | PATCH: milestone.track | plan.write (photo files removed too) |
| `/milestones/punch/[punchId]/photos` | | milestone.track (multipart image `file`) | | |
| `/milestones/punch/[punchId]/photos/[photoId]` | project.view (image) | | | milestone.track |
| `/milestones/documents` | | plan.write | | |
| `/milestones/documents/[documentId]` | | | PATCH: milestone.track for `status` / `note`; `name`, `sortOrder` also need plan.write (403) | plan.write (files removed too) |
| `/milestones/documents/[documentId]/files` | | milestone.track (multipart `file`) | | |
| `/milestones/documents/[documentId]/files/[fileId]` | project.view (file) | | | milestone.track |
| `/milestones/budget`, `/milestones/metrics` | | plan.write | | |
| `/milestones/budget/[lineId]`, `/milestones/metrics/[metricId]` | | | PATCH: plan.write | plan.write |
| `/milestones/metrics/[metricId]/points` | | | PUT: milestone.track (one month's value; `null` removes it) | |
| `/sprints` | project.view | sprint.manage | | |
| `/sprints/export` | project.view (xlsx, `?sprintId=`) | | | |
| `/sprints/[sprintId]` | project.view | | sprint.manage | sprint.manage |
| `/sprints/[sprintId]/pbis` | | sprint.manage | | sprint.manage |
| `/sprints/[sprintId]/tasks` | | task.write | | |
| `/sprints/[sprintId]/tasks/[taskId]` | | | task.write | task.write |
| `/sprints/[sprintId]/daily-scrums` | project.view | dailyScrum.write | | |
| `/sprints/[sprintId]/daily-scrums/[noteId]` | | | dailyScrum.write | dailyScrum.write |
| `/sprints/[sprintId]/ai/retro-synthesis` | | ai.use | | |
| `/events` | project.view | event.write | | |
| `/events/[eventId]` | | | event.write | event.write |
| `/attachments` | | attachment.write | | |
| `/attachments/[attachmentId]` | project.view | | attachment.write | attachment.write |
| `/attachments/[attachmentId]/editor-config` | attachment.write | | | |
| `/folders` | | attachment.write | | |
| `/folders/[folderId]` | | | attachment.write | attachment.write |
| `/icebox` | project.view | icebox.write | | |
| `/icebox/export` | project.view (xlsx) | | | |
| `/icebox/[itemId]` | | | icebox.write | icebox.write |
| `/icebox/[itemId]/attachments` | | icebox.write | | |
| `/icebox/[itemId]/attachments/[attachmentId]` | project.view | | | icebox.write |
| `/icebox/[itemId]/ai/generate-pbi-draft` | | ai.draftPbi | | |
| `/ai/generate-pbi-field` | | ai.draftPbi | | |
| `/ai/progress-report` | | ai.use | | |
| `/ai/jobs` | project.view | ai.use (503 `ai_jobs_disabled` without a job runner) | | |
| `/ai/jobs/[jobId]` | project.view | | | ai.use + requester, or project.update (403) |
| `/surveillance-settings` | project.view | | PUT: surveillance.configure | |
| `/git` | project.view (token never returned) | | PUT: git.configure | |
| `/git/repositories`, `/git/test` | | git.configure | | |
| `/git/repositories/[repoId]` | | | PATCH: git.configure (incl. `aiKnowledge` / `aiPathFilter`: what every member can read through the AI) | git.configure |
| `/git/repositories/[repoId]/index` | | git.sync (今すぐ取り込む; repository looked up within the project, 404 otherwise; 429 within 30 s) | | |
| `/git/knowledge` | ai.use — names / file counts of the project's AI reference repositories only | | | |
| `/git/sync` | | git.sync | | |
| `/git/links`, `/git/summary`, `/git/overview` | project.view | | | |
| `/dev/claims` (担当中 for the board / PBI panel: `?sprintId=` or `?pbi=`, no session ids; `canModerate` = sprint.manage; also each claim's 触る範囲, the overlap warnings with other active claims of the project and, for `?pbi=`, the open MRs with changes outside the declared scope — W4) | project.view | | | |
| `/dev/claims/[claimId]/release` | | sprint.manage (moderator release from the PBI panel; logged, holder notified) | | |
| `/ai-reports` | project.view | | | |
| `/burndown` | project.view | | | |
| `/chat` | | ai.use (+ `threadId`: owner only, 404) | | |
| `/chat/threads` | ai.use — the caller's own threads only | | | |
| `/chat/threads/[threadId]` | ai.use + owner (404) | | PATCH: ai.use + owner (404) | ai.use + owner (404) |
| `/chat/threads/[threadId]/proposals/[proposalId]` | | ai.use + owner (404); records the proposal outcome (reserve / confirm / release / reject, 409 when already handled). The REST calls that apply it keep their own gates | | |
| `/trash` | trash.manage | | | |
| `/trash/[entityType]/[id]/restore` | | trash.manage | | |
| `/trash/[entityType]/[id]` | | | | trash.purge |
| `/comments` | project.view | comment.write | | |
| `/comments/counts` | project.view | | | |
| `/comments/[commentId]` | | | PATCH: comment.write + author only (403) | comment.write + author, or comment.moderate (403) |

Outside project scope: `/api/admin/**` uses `requireAdmin()`, and user-scoped routes use `requireAuth()`. `/api/v1/**` uses bearer tokens only (see "Read-only REST API and access tokens" below). `/api/wopi/**` uses its own signed-token auth (`src/app/api/wopi/_lib/wopi-auth.ts`, which re-checks admin or explicit membership, the same as `attachment.write` without the section-manager path).

**Department portfolio (P4)** — `GET /api/portfolio` and the `/portfolio` page use `requireAuth()` plus one rule (`src/services/portfolio/portfolio.scope.ts`, shared with the chat tool `portfolio_overview`): a system admin sees every live project, a section manager the live projects assigned to one of their sections (membership alone does not add a project), anyone else gets 403 (the page redirects to `/`). The header shows the link only to those two roles.

**Repository knowledge base for the AI chat (2026-10)** — a PO / SM (`git.configure`) can switch a GitLab repository to 「AI の参照資料として使う」. Its documents and code are then indexed into `repo_chunk` (`src/services/git/repo-index*.ts`) and the chat tools `search_repository_docs` / `read_repository_file` (`src/lib/repo-knowledge-tools.ts`) answer from them. This deliberately **widens visibility**: every project member with `ai.use` can read the repository's content through the AI even without GitLab access; the switch shows a confirmation saying so and the change is written to the activity log (`git.aiKnowledge`, `git.aiPathFilter`). Guards: the tools are offered only for a project with a knowledge repository, and every lookup is filtered by the caller's project id **and** the project's switched-on repositories (integration on, project not trashed); secret files (`.env*`, keys, certificates, credential / secret config files) are never downloaded and secret-looking values are redacted before storage (`repo-redact.ts`); switching off deletes the stored passages in the same transaction; the GitLab token and file contents are never logged.

## 改善成果ボード (process_improvement, 2026-10)

The release screen of a process_improvement project is the 改善成果ボード
(`/api/projects/[id]/improvements/**`, the same ReleaseBacklogItem rows). The
improvement owner (PO, `release.manage`) edits the effect numbers, 標準書リンク,
展開日, stage, adds / removes 横展開先 and 定着確認 dates, and deletes items. KAIZEN
work is done on the floor, so every project member (`improvement.track`: PO, SM,
Dev) may record 定着確認 results, change a 横展開先's status and add / remove
before-after photos. Section managers without membership only read. Stage
guards (標準化済み needs a 標準書リンク, 定着確認済み needs a "sustained" check) are
business rules (400), not permissions.

## マイルストーン・検収ボード (general, 2026-10)

The release screen of a general (その他) project is the マイルストーン・検収ボード
(`/api/projects/[id]/milestones/**`). Its stages ARE the top-level 全体計画 items:
dates, status and 完了条件 texts are changed through the plan routes
(`plan.write`, version-checked), never copied. The PO / SM (`plan.write`) set up
check items, hand-over documents, budget lines, trend metrics and the board
settings, and delete checks / documents / punch items. Floor work is open to
every project member (`milestone.track`: PO, SM, Dev): ticking 完了条件,
recording check results (合格 / 条件付き合格 / 不合格, 立会者, day), adding and
working 残課題 with photos, marking documents 揃った and attaching files, and
entering monthly trend values. Section managers without membership only read.

## Plan templates (計画テンプレート, 2026-10)

`/api/plan-templates/**` is user-scoped (`requireAuth()`, no project). Rules live in
`src/services/plan-templates/plan-templates.dto.ts` and are enforced by the service:

| Action | public template | private template (自分だけ) | built-in (共通) |
|--------|-----------------|------------------------------|-----------------|
| list / read (`GET /`, `GET /[id]`, `GET /[id]/revisions`) | any logged-in user | owner + admins (others: 404) | any logged-in user |
| create (`POST /`), duplicate (`POST /[id]/duplicate`) | any logged-in user (the copy is owned by the caller; shared by default) | owner + admins may duplicate | any logged-in user |
| edit content (`PUT /[id]`, version-checked, 409 VERSION_CONFLICT) | any logged-in user (every save is a revision: who / when / snapshot) | owner + admins | any logged-in user |
| change visibility | owner + admins (403) | owner + admins | never (always public) |
| delete (`DELETE /[id]`, soft) | owner + admins (403 PLAN_TEMPLATE_DELETE_FORBIDDEN) | owner + admins | never (400 PLAN_TEMPLATE_BUILTIN) |
| reset to default (`POST /[id]/reset`) | — (400 PLAN_TEMPLATE_NOT_BUILTIN) | — | any logged-in user (recorded as a revision) |

Loading a template into a project, saving a project's plan as a template and 「日程を仮置き」 are
project routes gated by `plan.write` (see the table above); the template itself must also be
visible to the caller (else 404). Template writes are rate limited per user (60 / min) and
bodies are size-bounded (413). Editing a template never changes plans already loaded from it.

## REST API and access tokens (P4, 2026-10; scopes 2026-10-30)

`/api/v1/**` (docs/api-v1.md) and the Kanflow MCP endpoint `/api/mcp` (docs/mcp.md) authenticate **only** with a personal access token (`Authorization: Bearer kfl_...`); session cookies are ignored there, and tokens are not accepted anywhere else. Wrapper: `src/app/api/v1/_lib/v1-route.ts`; the MCP tools reuse `resolveV1ProjectActor`, `assertV1Action` and `runV1Write` (`src/app/api/mcp/_lib/tool-kit.ts`), so the rules below apply to both.

- **Actor**: the token's owner, with `User.role` read from the database (never from the token). The token is refused (401, same body for every reason) when it is unknown, revoked, expired, the owner is deactivated or deleted, or the owner's `tokenVersion` differs from the one pinned on the token at creation (`ApiToken.userTokenVersion`, checked with `checkTokenAgainstUser` from `lib/authz/session-validity.ts`).
- **Projects**: the same actor resolution as the UI (`loadProjectActor` + `isProjectLive`); every v1 endpoint needs `project.view`. No path into the project, a missing or trashed project → 404 (admins included for trashed ones). There is no 403 per project (every route is read-only).
- **Scope**: tokens carry `scopes` (JSON array, `src/lib/api-tokens/scopes.ts`); every request requires `read` (403 otherwise, and every token has it). A write additionally goes through `assertV1Action(principal, actor, action)`: the token must carry the scope of the action (403 `INSUFFICIENT_SCOPE` with `requiredScope`) **and** the owner's project role must allow it (`can`, 403 `FORBIDDEN`). A scope never grants more than the matrix above: a dev's token with `backlog:write` still cannot create a PBI.

  | Scope | Action |
  |---|---|
  | `read` | `project.view` |
  | `backlog:write` | `backlog.write` (also add / edit / delete of a PBI's 受入基準 items, `/api/v1/.../backlog/:itemId/acceptance-criteria` and the MCP `add_acceptance_criterion` / `update_acceptance_criterion`) |
  | `backlog:reorder` | `backlog.reorder` |
  | `sprint:write` | `sprint.manage` |
  | `task:write` | `task.write` |
  | `comment:write` | `comment.write` |
  | `icebox:write` | `icebox.write` |
  | `daily:write` | `dailyScrum.write` |
  | `dev:write` | `dev.write` (named `write:dev` in GitStation's plan documents; token-only: work claims, progress comments, MR links of AI sessions — `/api/v1/projects/:projectId/dev/*` and the MCP developer tools; no UI route uses it. Heartbeat and the 触る範囲 declaration `PUT .../dev/claims/:claimId/scope` / `declare_scope` are additionally limited to the claim's own user (403 `FORBIDDEN` for anyone else, PO / SM / admin included); release also allows `sprint.manage`) |

  Actions without a scope (delete, trash, members, settings, ...) cannot be done with a token.
- **Project restriction**: a token may be limited to some projects (`ApiToken.projectIds`, chosen at creation from the active projects the owner can open; anything else → 400 `Unknown project`). Other projects answer 404 and are left out of `/api/v1/projects`. The restriction only narrows: losing access to a listed project still closes it. It is enforced only in `resolveV1ProjectActor`, so every token path into a project — also one that derives the project from a PBI / task / comment id — must go through it. `projectIds: []` on creation is a 400 (never read as "all projects").
- **Revocation**: `DELETE /api/user/api-tokens/:id` (owner; another user's token → 404) and `DELETE /api/admin/api-tokens/:id` (`requireAdmin()`). The users service revokes all of a user's tokens in the same transaction as a deactivation, a system-role change or an admin password reset.
- **Management routes**: `GET/POST /api/user/api-tokens` (`requireAuth()`, own tokens only), `GET /api/admin/api-tokens` (`requireAdmin()`).
- **Audit**: create / revoke are logged (`module: api-tokens`, `userId`, `patId`, `patPrefix`, `by`); tokens are user-level, so they are not in the project ActivityLog.
- **Limits**: 120 requests / min per token (`API_V1_RATE_LIMIT_PER_MIN`), 30 failed authentications / min per client IP.

Admin metrics (`GET /api/admin/metrics`, page `/admin/metrics`) use `requireAdmin()` like the other admin routes.

## Chat history and AI jobs (P3, 2026-10)

- **Chat threads are private to their owner.** Every lookup is scoped by (project, user); another user's thread — for a system admin too — is 404 (list, read, rename, delete, and continuing it via `POST /chat` with `threadId`). Access to the project still requires `ai.use`.
- **AI report jobs** are project-visible: `project.view` may list active jobs and read a job's status (the reports panel shows who requested what). Queuing needs `ai.use`; cancelling needs `ai.use` and being the requester, or `project.update` (PO / SM / admin).
- **Surveillance settings**: readable with `project.view`; changing them is `surveillance.configure` (PO / admin).

## Comments (2026-10)

Comments hang off PBIs, sprint tasks and Icebox items (`Comment.entityType` = `pbi` / `sprint_task` / `icebox`).

- **Read**: everyone with `project.view` (incl. section managers).
- **Write** (`comment.write`): every explicit project member — `dev` included, because sprint-task discussion is mostly between developers. Section managers who are not members read only (their write path, `icebox.write`, is for submitting requests, not for joining team discussions).
- **Edit**: the author only — the route checks `comment.write`, the service returns 403 for anyone else (moderators included; nobody puts words in someone else's mouth).
- **Delete** (soft): the author, or `comment.moderate` (PO / admin) for anyone's comment. The row stays as a tombstone (`deleted: true`, `body: null` in the API).
- The target must exist in the project and not be in the trash (404 otherwise); a sprint task counts as trashed when its PBI is.
- Each `CommentDto` carries `canEdit` / `canDelete` for the viewer, so the UI never re-implements this table.

## Real-time updates (2026-10)

`GET /api/realtime?projectId=<optional>` is a Server-Sent Events stream (`src/app/api/realtime/route.ts`, `src/lib/realtime/`) that tells open screens *that* something changed so they refetch.

- **Session required** (401 otherwise). Not a project route: the optional `projectId` is checked like `project.view` (live project + `accessVia` + `can`). When the check fails (non-member, trashed, malformed id) the stream is still opened but carries **no project events** — only the user's own — and the `ready` event reports `projectId: null`. Project existence is not revealed.
- **Delivery**: an event with recipients (`notification`) reaches only those users; any other event (`activity`, `comment`, `team-message`, `git`) reaches the streams subscribed to its project.
- **Payload**: ids and kinds only (`type`, `projectId`, `entityType`, `entityId`, `subjectId`, `action`, `actorId`, `at`). Never bodies, names, excerpts or the recipient list; the client reloads through the normal authorized routes, so every permission rule above still applies to the data itself.
- **Limits**: 8 open streams per user (429 beyond), stream lifetime 15 min (the reconnect re-runs `auth()`, so a revoked / expired session stops receiving), heartbeat every 25 s.
- **Idle logout**: the stream and the refetches it triggers do not count as user activity (`quietActivityFor` in `hooks/activity.ts`), and the stream never refreshes the session cookie.

## Behaviour changes from unification (2026-09)

1. **Non-members now get 404 instead of 403** on every project route.
2. **Section managers can now read** attachments (`GET /attachments/[id]`), Icebox attachments (`GET /icebox/[itemId]/attachments/[id]`) and daily scrums (`GET /sprints/[sprintId]/daily-scrums`). Before, these routes used the member-only helper, which did not match the rule that section managers can read the whole project.
3. **Section managers can now upload and delete Icebox attachments** (`POST /icebox/[itemId]/attachments`, `DELETE /icebox/[itemId]/attachments/[id]`), to match their existing Icebox write rights.
4. `requireProjectMember` returns 403 when a section manager is not a member of the project (unchanged), and 404 for other non-members (changed, see item 1).
