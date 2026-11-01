/**
 * Who keeps confidential PBIs (D-5) out of which Claude-facing entry point. Data only; the guard test
 * (__tests__/confidential-enforcement.test.ts) enumerates the REAL MCP tools (by registering them on a
 * recording server) and the REAL /api/v1 route files, and fails when
 *
 *   - an entry point exists that is not listed here (a new tool / route must be classified, so it cannot
 *     forget the rule),
 *   - an entry listed here no longer exists, or
 *   - a mechanism named here has no behavior test (allow AND deny) in that file.
 *
 * `by` names the mechanism(s) in api-v1.confidential.ts (and the repository filters built from it) that
 * enforce the rule for the entry point. `independent` says why the entry point cannot return PBI content
 * at all. Adding a tool or a route means adding a line here and, when it touches PBIs, using one of the
 * mechanisms.
 */

/** The mechanisms; each has a deny test (confidential is hidden) and an allow test (a normal PBI still works). */
export const CONFIDENTIAL_MECHANISMS = [
  "read:backlog", // findBacklogPage: confidential PBIs are not listed
  "read:pbi", // findPbi: a direct get answers PBI_NOT_FOUND
  "read:locate", // locateEntity: a PBI / task id of a confidential PBI is "not found"
  "read:sprint-tasks", // findSprintTasks: tasks under a confidential PBI are not listed
  "read:my-tasks", // findMyTasks: same, for "my tasks"
  "read:similar-tasks", // findPbiTasksInSprint: the duplicate hint of create_task
  "read:releases", // findReleases: release copies of a confidential PBI are not listed
  "read:activity", // listProjectActivity({ hideConfidential }): feed rows about them are not listed
  "mask:pbi-ref", // a PBI named by id / number is handed to the service as a missing id
  "mask:pbi-ids", // PBI ids in a body (sprint create / add PBIs / carry over)
  "mask:task-id", // a task under a confidential PBI is a missing task
  "mask:claim-id", // a claim on a confidential PBI is a missing claim
  "mask:comment-target", // comment threads of a confidential PBI (or its tasks) are missing
  "filter:claims", // claim lists and scope overlaps drop claims on confidential PBIs
  "filter:sprint-answer", // a sprint answer drops the tasks of confidential PBIs
  "schema:no-flag", // a token cannot set or clear the flag
] as const
export type ConfidentialMechanism = (typeof CONFIDENTIAL_MECHANISMS)[number]

export type Coverage = { by: readonly ConfidentialMechanism[] } | { independent: string }

const by = (...mechanisms: ConfidentialMechanism[]): Coverage => ({ by: mechanisms })
const independent = (why: string): Coverage => ({ independent: why })

const NO_PBI = "returns no PBI, task or comment content"
const LESSON = "feedback loop: lessons carry no PBI content (a systemized lesson holds an opaque link text only)"

/** Every MCP tool (src/app/api/mcp/_lib/*.ts registerTool names). */
export const MCP_TOOL_COVERAGE: Readonly<Record<string, Coverage>> = {
  // identity, projects
  whoami: independent(NO_PBI),
  list_projects: independent(NO_PBI),
  resolve_project: independent(NO_PBI),
  // reads
  get_backlog: by("read:backlog"),
  get_pbi: by("read:locate", "read:pbi", "mask:comment-target"),
  list_sprints: independent("sprint rows (name, dates, goal, score); no PBI or task content"),
  get_sprint_tasks: by("read:sprint-tasks"),
  my_tasks: by("read:my-tasks"),
  get_activity: by("read:activity"),
  list_comments: by("read:locate", "mask:pbi-ref", "mask:comment-target"),
  // writes: backlog
  create_pbi: independent("creates a normal PBI; the answer is that new PBI"),
  update_pbi: by("read:locate", "read:pbi", "schema:no-flag"),
  add_acceptance_criterion: by("read:locate", "mask:pbi-ref"),
  update_acceptance_criterion: by("read:locate", "mask:pbi-ref"),
  // writes: sprint
  create_sprint: by("mask:pbi-ids", "filter:sprint-answer"),
  update_sprint: by("filter:sprint-answer"),
  add_pbis_to_sprint: by("read:pbi", "mask:pbi-ids"),
  create_task: by("read:pbi", "mask:pbi-ref", "read:similar-tasks"),
  update_task: by("read:locate", "mask:task-id"),
  add_comment: by("read:locate", "mask:pbi-ref", "mask:comment-target"),
  create_icebox_item: independent("creates an Icebox request; returns no PBI content"),
  post_daily_scrum: independent("a daily scrum note is the caller's own text"),
  // development (dev:write)
  claim_work: by("read:locate", "mask:pbi-ref", "mask:task-id"),
  release_claim: by("mask:claim-id"),
  declare_scope: by("mask:claim-id", "filter:claims"),
  list_claims: by("mask:pbi-ref", "mask:task-id", "filter:claims"),
  post_progress: by("read:locate", "mask:comment-target"),
  link_merge_request: by("read:locate", "mask:pbi-ref"),
  // feedback loop
  report_failure: independent(LESSON),
  report_resolution: independent(LESSON),
  search_lessons: independent(LESSON),
  // master plan
  get_plan: independent("plan items carry a name, dates and progress; they do not carry or link PBI content"),
  propose_plan_items: independent("proposes plan items from the caller's own schedule; returns no PBI content"),
}

/** Every /api/v1 route: "METHOD path under src/app/api/v1 (folder names, [param] kept)". */
export const V1_ROUTE_COVERAGE: Readonly<Record<string, Coverage>> = {
  "GET me": independent(NO_PBI),
  "GET projects": independent(NO_PBI),
  "GET projects/[projectId]": independent("project, sections and members; no PBI content"),
  "GET projects/[projectId]/backlog": by("read:backlog"),
  "POST projects/[projectId]/backlog": independent("creates a normal PBI; the answer is that new PBI"),
  "GET projects/[projectId]/backlog/[itemId]": by("read:pbi"),
  "PATCH projects/[projectId]/backlog/[itemId]": by("read:pbi", "schema:no-flag"),
  "GET projects/[projectId]/backlog/[itemId]/acceptance-criteria": by("mask:pbi-ref"),
  "POST projects/[projectId]/backlog/[itemId]/acceptance-criteria": by("mask:pbi-ref"),
  "PATCH projects/[projectId]/backlog/[itemId]/acceptance-criteria/[acRef]": by("mask:pbi-ref"),
  "DELETE projects/[projectId]/backlog/[itemId]/acceptance-criteria/[acRef]": by("mask:pbi-ref"),
  "GET projects/[projectId]/sprints": independent("sprint rows (name, dates, goal, score); no PBI or task content"),
  "POST projects/[projectId]/sprints": by("mask:pbi-ids", "filter:sprint-answer"),
  "PATCH projects/[projectId]/sprints/[sprintId]": by("filter:sprint-answer"),
  "POST projects/[projectId]/sprints/[sprintId]/pbis": by("mask:pbi-ids"),
  "GET projects/[projectId]/sprints/[sprintId]/tasks": by("read:sprint-tasks"),
  "POST projects/[projectId]/sprints/[sprintId]/tasks": by("mask:pbi-ref", "read:similar-tasks"),
  "PATCH projects/[projectId]/sprints/[sprintId]/tasks/[taskId]": by("mask:task-id"),
  "POST projects/[projectId]/sprints/[sprintId]/daily-scrums": independent("a daily scrum note is the caller's own text"),
  "GET projects/[projectId]/activity": by("read:activity"),
  "GET projects/[projectId]/comments": by("mask:comment-target"),
  "POST projects/[projectId]/comments": by("mask:comment-target"),
  "POST projects/[projectId]/icebox": independent("creates an Icebox request; returns no PBI content"),
  "GET projects/[projectId]/plan": independent("plan items carry a name, dates and progress; they do not carry or link PBI content"),
  "GET projects/[projectId]/releases": by("read:releases"),
  "GET projects/[projectId]/dev/claims": by("mask:pbi-ref", "mask:task-id", "filter:claims"),
  "POST projects/[projectId]/dev/claims": by("mask:pbi-ref", "mask:task-id"),
  "PATCH projects/[projectId]/dev/claims/[claimId]": by("mask:claim-id"),
  "POST projects/[projectId]/dev/claims/[claimId]/release": by("mask:claim-id"),
  "PUT projects/[projectId]/dev/claims/[claimId]/scope": by("mask:claim-id", "filter:claims"),
  "POST projects/[projectId]/dev/progress": by("mask:comment-target"),
  "POST projects/[projectId]/dev/mr-links": by("mask:pbi-ref"),
  "GET feedback/lessons": independent(LESSON),
  "POST feedback/failures": independent(LESSON),
  "POST feedback/resolutions": independent(LESSON),
  "POST feedback/lessons/[id]/confirm": independent(LESSON),
  "POST feedback/lessons/[id]/retire": independent(LESSON),
  "POST feedback/lessons/[id]/systemize": independent(LESSON),
}
