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
| `git.approve` | Y | Y | Y | Y | - |
| `dev.write` | Y | Y | Y | Y | - |
| `plan.lessonRule.confirm` | Y | Y | Y | - | - |
| `plan.lessonRule.requestPromotion` | Y | Y | - | - | - |
| `plan.actualsFinalize` | Y | Y | Y | - | - |
| `plan.viewMemberLoad` | Y | Y | Y | - (own row only) | Y |
| `capacity.manage` | Y | Y | Y | - | - |
| `plan.estimate` | Y | Y | Y | - | - |

Rules of the `shared` scope (反省点の規則 widened to a lineage / project type) and promotion requests are confirmed
by **system admins only** (`canConfirmLineageRule`, plan 12 §4) — not expressible per project.

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
| `/plan/lesson-rules` (反省点の規則, plan 12 E3; GET also answers `permissions`) | project.view | plan.write (a `project`-scope draft) | | |
| `/plan/lesson-rules/[ruleId]` | | | PATCH: plan.write (drafts only) | |
| `/plan/lesson-rules/[ruleId]/confirm` (one rule; body repeats kind + params) | | plan.lessonRule.confirm | | |
| `/plan/lesson-rules/[ruleId]/retire` | | plan.lessonRule.confirm | | |
| `/plan/lesson-rules/[ruleId]/promotion` (share request) | | plan.lessonRule.requestPromotion | | |
| `/plan/actuals` (実績を確定, plan 12 E1; GET also answers `permissions`) | project.view | plan.actualsFinalize | | |
| `/plan/actuals/[snapshotId]` (leaves: roles and days, never owners) | project.view | | PATCH: plan.actualsFinalize (`includeInLearning` + reason) | |
| `/attributes` (設備・工程・タグ) | project.view | | PUT: project.update | |
| `/capacity` (members' allocation to this project, plan 12 E4) | capacity.manage | capacity.manage (explicit members only) | | |
| `/capacity/[capacityId]` | | | PATCH: capacity.manage (rows of this project only) | capacity.manage |
| `/plan/member-load` (utilization / overlap days, no other projects' names) | project.view — others' rows need plan.viewMemberLoad | | | |
| `/plan/level` (levelling proposal, nothing written) | | plan.write **and** plan.viewMemberLoad; roles only for explicit members (400 PLAN_ROLE_ASSIGNMENT_INVALID) | | |
| `/plan/estimate-runs` (計画を作る, plan 12 E5) | | plan.estimate (a private template only if the caller may see it) | | |
| `/plan/estimate-runs/[runId]` (card), `/evidence`, `/feedback` | plan.estimate — another project's run is 404 PLAN_ESTIMATE_RUN_NOT_FOUND; owners / moves / utilization also need plan.viewMemberLoad | feedback: plan.estimate | | |
| `/plan/load` with `estimateRunId` | | plan.write **and** plan.estimate; body only { estimateRunId, removedOwnerKeys } | | |
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
| `/git/mr-approvals` (`?pbiId=`: per open GitStation MR of the PBI, what the caller could do through GitStation's act-as and the approval count; `{ supported: false }` otherwise) | git.approve | | | |
| `/git/mr-approvals/start` (opens one approve / withdraw: GitStation's confirmation URL; the link is looked up within the project) | | git.approve | | |
| `/git/mr-approvals/[attemptId]/complete` (確認しました: claims the confirmation and approves; only the user who started it) | | git.approve | | |
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

## 反省点の規則 (lesson rules, plan 12 E3, 2026-11)

- A rule is drafted in its project (`plan.write`) with the `project` scope; only `confirmed` rules change a plan.
  Confirm is **one rule per request** and the body repeats the kind and numbers shown (`plan.lessonRule.confirm`,
  PO / SM); a draft changed in between is 409 `PLAN_RULE_CHANGED`. Every write is version-checked.
- A rule of another project — and a rule already widened to the `shared` scope — is 404 `PLAN_RULE_NOT_FOUND` on the
  project routes.
- Sharing: the source project's PO requests it (`plan.lessonRule.requestPromotion`); **only system admins** confirm
  or reject (`canConfirmLineageRule`), and retire shared rules, through `/api/admin/plan-lesson-rules`,
  `/api/admin/plan-lesson-rules/[ruleId]/promotion` and `/api/admin/plan-lesson-rules/[ruleId]/retire`. The quote is
  removed when the rule is shared.
- Confidentiality is checked **at use time**, never stored: a cited PBI / lesson that is confidential now, gone,
  trashed or moved makes a shared rule stop outside its source project, and blocks a promotion request or confirm.
  A rule drafted from a retrospective stays `project` scope (400 `PLAN_RULE_PROMOTION_BLOCKED`).

## 稼働量と平準化 (capacity and levelling, plan 12 E4, 2026-11)

- A person's OWN FTE (`/api/users/[id]/capacity`, rows without a project) is set by the person, a section manager of
  a section the person belongs to, or an admin (`canManageUserCapacity`) — not by a PO / SM, not even of the person's
  projects. Their allocation to a project is set by that project's PO / SM (`capacity.manage`), explicit members only.
- The capacity table has no free-text column: reasons for leave are never stored.
- Every change of a capacity row (own FTE or allocation) is written to `member_capacity_audit` in the same
  transaction: who, when, and the period / FTE before and after (numbers only). An allocation change also shows in the
  project's history.
- Load is shown as utilization and overlapping days across all projects; other projects' item names or ids are never
  returned. Without `plan.viewMemberLoad` a member sees only their own row.
- Utilization counts the leaves a person holds (one leaf fills their day, whatever their FTE), so it never reveals the
  FTE itself. A day with FTE 0 that holds a leaf shows as over capacity (≥ 2), the same as a double booking — a viewer
  cannot tell leave from overbooking. Levelled dates still avoid a person's days off; that is inherent to levelling and
  shows only where an item was placed, never why.
- Levelling assigns roles to explicit project members only: a section manager who merely sees the project cannot be
  assigned (their busy days in other projects would leak through the dates).

## 計画を作る (plan from actuals, plan 12 E5, 2026-11)

- Making, reading and approving an estimate run is `plan.estimate` (PO / SM). A run is read only inside its own project:
  another project's run id answers 404 `PLAN_ESTIMATE_RUN_NOT_FOUND`, exactly like a missing one (also on `/plan/load`).
- The card has no per-person data. Owners, moves and before / after utilization are returned only with
  `plan.viewMemberLoad`; the MCP tool `propose_plan_from_actuals` (scope `backlog:write` **and** the person's
  `plan.estimate`) returns only the run id, end dates, counts and a web link.
- Sources count as visible only when the creator AND every PO / SM of the project can view them; a reader who
  later cannot view one of an item's sources gets no numbers for that item (evidence) and the card leaves it out of
  its change list. An approver without plan.viewMemberLoad saw no owners, so loading writes none (unassigned).
- In schedule mode (MCP / API), an explicit lineage is accepted only when it is the schedule source's own or one this
  project already loaded (400 PLAN_LINEAGE_NOT_ALLOWED): a free name would read another family's actuals.
- Evidence is stored by id and filtered again for every reader: the confidentiality check runs at read time (a source
  that became confidential hides that item's numbers and makes the run stale), project names are shown only for
  projects the reader can view, other sources fold into "other projects (band)", and with fewer than 4 visible
  sources the ratio is not shown. Roles are shown, never owners. Repository names stay hidden until GitStation can
  confirm the reader's access (G1).
- Approval recomputes the whole run on the server with the creator's stored visibility and hidden-source state. It is
  refused (409 `PLAN_ESTIMATE_STALE`) when the inputs changed, the run is older than 24 h, the recomputed end date or
  owners differ, or a source became unusable. The schedule, dates and owners come from the run only: the approver may
  remove owners, never add or swap them, and a run loads once.
- Known residual (documented, plan 12 §3.2): a reader who sees fewer sources than the creator still sees the item's
  days (they are the plan itself); its ratio, sources and count are hidden for them.

## 実績のスナップショット (actuals, plan 12 E1, 2026-11)

- 実績を確定 (`plan.actualsFinalize`, PO / SM) freezes the project's actuals. Re-finalizing adds a snapshot and marks the
  previous one superseded; rows are never rewritten. The learning switch (`includeInLearning`) is the same action,
  needs a reason, and is audited.
- Screens and the API return roles and days, never the owner of a leaf or the owner's concurrency (those exist for
  m_u learning only).
- Confidentiality is checked at use time: every reader of the per-PBI numbers goes through `learnableItemFacts`
  (a PBI that is confidential, trashed or gone NOW is left out; a leaf whose PBIs are all confidential is not learned
  from).
- Pseudonymising owners (`POST /api/admin/plan-actuals/pseudonymize`, by retired user or by snapshot) is **system
  admins only** (`canPseudonymizeActuals`): owners become role names, numbers never change, audited per project.
- The backtest of the estimate on real actuals and the per-lineage approval of "実績で調整"
  (`/admin/plan-estimate-eval`, `GET|POST /api/admin/plan-estimate-eval`, `POST /api/admin/plan-estimate-eval/approval`) are
  **system admins only** (`canManageEstimateGate`): the numbers are exact (unbanded) and span every project of the lineage.
  A PO / SM is only notified when their change turned an approved lineage off (`plan_estimate_worse`): no numbers, no
  reason, and a template's name only when the template is public.

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
  | `dev:write` | `dev.write` (named `write:dev` in GitStation's plan documents; token-only: work claims, progress comments, MR links of AI sessions — `/api/v1/projects/:projectId/dev/*` and the MCP developer tools; no UI route uses it. Heartbeat and the 触る範囲 declaration `PUT .../dev/claims/:claimId/scope` / `declare_scope` are additionally limited to the claim's own user (403 `FORBIDDEN` for anyone else, PO / SM / admin included); release also allows `sprint.manage`; it also covers the account-level feedback reports `POST /api/v1/feedback/failures` / `resolutions` and the MCP `report_failure` / `report_resolution`, see "Feedback loop") |

  Actions without a scope (delete, trash, members, settings, ...) cannot be done with a token.
- **Project restriction**: a token may be limited to some projects (`ApiToken.projectIds`, chosen at creation from the active projects the owner can open; anything else → 400 `Unknown project`). Other projects answer 404 and are left out of `/api/v1/projects`. The restriction only narrows: losing access to a listed project still closes it. It is enforced only in `resolveV1ProjectActor`, so every token path into a project — also one that derives the project from a PBI / task / comment id — must go through it. `projectIds: []` on creation is a 400 (never read as "all projects").
- **Revocation**: `DELETE /api/user/api-tokens/:id` (owner; another user's token → 404) and `DELETE /api/admin/api-tokens/:id` (`requireAdmin()`). The users service revokes all of a user's tokens in the same transaction as a deactivation, a system-role change or an admin password reset.
- **Management routes**: `GET/POST /api/user/api-tokens` (`requireAuth()`, own tokens only), `GET /api/admin/api-tokens` (`requireAdmin()`).
- **Audit**: create / revoke are logged (`module: api-tokens`, `userId`, `patId`, `patPrefix`, `by`); tokens are user-level, so they are not in the project ActivityLog.
- **Limits**: 120 requests / min per token (`API_V1_RATE_LIMIT_PER_MIN`), 30 failed authentications / min per client IP.

Admin metrics (`GET /api/admin/metrics`, page `/admin/metrics`) use `requireAdmin()` like the other admin routes.

## Feedback loop (W11, 2026-11)

Failures, resolutions and lessons (docs/api-v1.md "Feedback loop"). Account-level, not project-level, so most of it
is not in the project matrix; the rules:

| Operation | Who |
|---|---|
| `POST /api/v1/feedback/failures`, `/resolutions`, MCP `report_failure` / `report_resolution` | token scope `dev:write`; when the body names a `projectId` also `dev.write` in that project (PO / SM / dev; 404 for non-members, 403 for section managers who are not members, 404 outside the token's project restriction) |
| `GET /api/v1/feedback/lessons`, MCP `search_lessons` | token scope `read`; **only confirmed / systemized, non-confidential lessons**, scope `global` / `tech:*` for everyone, `project:<id>` for members of that project (admin: all; a token limited to some projects: only those) — never drafts or retired lessons, whoever owns the token |
| `POST /api/v1/feedback/lessons/:id/confirm\|retire\|systemize` | token scope `sprint:write` **and** the owner curates the lesson's scope (below); no MCP tool |
| `GET /api/feedback/lessons`, `/lessons/:id`, `/metrics`; `POST /api/feedback/lessons/:id/confirm\|retire\|systemize` (session, Lessons screen `/feedback`) | any signed-in user for the shared lessons; the curated scopes add drafts / retired / confidential lessons, the failure history of the signature and the dashboard numbers (`metrics: null` for a user who curates nothing) |

**Curating** (`services/feedback/feedback.access.ts`; the only decision point, used by the token and the session
routes alike): system `admin` = every lesson; `section_manager` (the platform "Maintainer") = `global` and
`tech:*` lessons; the project's `po` / `sm` = `project:<id>` lessons; developers, other members and outsiders =
nothing. A token limited to some projects curates only inside them and never `global` / `tech`. A lesson the user may not see (a draft
outside their curated scopes) answers `404 LESSON_NOT_FOUND`; one they see but may not curate answers `403 FORBIDDEN`.
Changing a lesson's scope on confirm needs the right on the new scope too. State machine: draft / retired →
confirmed → systemized; any non-retired → retired; confirmed / retired / same-link repeats are no-ops, other
transitions `409 LESSON_STATE`. Systemize requires a link (`pbi` / `gate` / `test` + reference).

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
