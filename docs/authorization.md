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
| `/backlog/[itemId]/ai/invest-review` | | ai.use | | |
| `/goals` | project.view | goal.write | | |
| `/goals/[goalId]` | | | goal.write | goal.write |
| `/plan` | project.view | plan.write | | |
| `/plan/[itemId]` | | | plan.write | plan.write |
| `/plan/reorder` | | plan.write | | |
| `/releases` | project.view | | | |
| `/releases/[id]` | | | release.manage | release.manage |
| `/releases/import` | | release.manage | | |
| `/sprints` | project.view | sprint.manage | | |
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
| `/icebox/[itemId]` | | | icebox.write | icebox.write |
| `/icebox/[itemId]/attachments` | | icebox.write | | |
| `/icebox/[itemId]/attachments/[attachmentId]` | project.view | | | icebox.write |
| `/icebox/[itemId]/ai/generate-pbi-draft` | | ai.draftPbi | | |
| `/ai/generate-pbi-field` | | ai.draftPbi | | |
| `/ai/progress-report` | | ai.use | | |
| `/ai-reports` | project.view | | | |
| `/burndown` | project.view | | | |
| `/chat` | | ai.use | | |
| `/trash` | trash.manage | | | |
| `/trash/[entityType]/[id]/restore` | | trash.manage | | |
| `/trash/[entityType]/[id]` | | | | trash.purge |
| `/comments` | project.view | comment.write | | |
| `/comments/counts` | project.view | | | |
| `/comments/[commentId]` | | | PATCH: comment.write + author only (403) | comment.write + author, or comment.moderate (403) |

Outside project scope: `/api/admin/**` uses `requireAdmin()`, and user-scoped routes use `requireAuth()`. `/api/wopi/**` uses its own signed-token auth (`src/app/api/wopi/_lib/wopi-auth.ts`, which re-checks admin or explicit membership, the same as `attachment.write` without the section-manager path).

## Comments (2026-10)

Comments hang off PBIs, sprint tasks and Icebox items (`Comment.entityType` = `pbi` / `sprint_task` / `icebox`).

- **Read**: everyone with `project.view` (incl. section managers).
- **Write** (`comment.write`): every explicit project member — `dev` included, because sprint-task discussion is mostly between developers. Section managers who are not members read only (their write path, `icebox.write`, is for submitting requests, not for joining team discussions).
- **Edit**: the author only — the route checks `comment.write`, the service returns 403 for anyone else (moderators included; nobody puts words in someone else's mouth).
- **Delete** (soft): the author, or `comment.moderate` (PO / admin) for anyone's comment. The row stays as a tombstone (`deleted: true`, `body: null` in the API).
- The target must exist in the project and not be in the trash (404 otherwise); a sprint task counts as trashed when its PBI is.
- Each `CommentDto` carries `canEdit` / `canDelete` for the viewer, so the UI never re-implements this table.

## Behaviour changes from unification (2026-09)

1. **Non-members now get 404 instead of 403** on every project route.
2. **Section managers can now read** attachments (`GET /attachments/[id]`), Icebox attachments (`GET /icebox/[itemId]/attachments/[id]`) and daily scrums (`GET /sprints/[sprintId]/daily-scrums`). Before, these routes used the member-only helper, which did not match the rule that section managers can read the whole project.
3. **Section managers can now upload and delete Icebox attachments** (`POST /icebox/[itemId]/attachments`, `DELETE /icebox/[itemId]/attachments/[id]`), to match their existing Icebox write rights.
4. `requireProjectMember` returns 403 when a section manager is not a member of the project (unchanged), and 404 for other non-members (changed, see item 1).
