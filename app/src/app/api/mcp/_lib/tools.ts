import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { parseRepoUrl } from "@/lib/git/repo-url"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import { ACTIVITY_ENTITY_TYPES } from "@/services/_shared/activity"
import { PAGE_LIMIT_MAX } from "@/services/_shared/cursor"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { v1ActivityQuerySchema, v1BacklogQuerySchema, v1ProjectsQuerySchema } from "@/services/api-v1/api-v1.schemas"
import {
  findProjectsByRepository,
  getMe,
  getPbi,
  listActivity,
  listBacklog,
  listMyTasks,
  listProjects,
  listSprints,
  listSprintTasks,
  normalizeRemoteUrl,
} from "@/services/api-v1/api-v1.service"
import { createAcceptanceCriterionSchema, updateAcceptanceCriterionSchema } from "@/services/acceptance-criteria/acceptance-criteria.schemas"
import { createBacklogItemSchema, PBI_STATUSES } from "@/services/backlog/backlog.schemas"
import { COMMENT_ENTITY_TYPES } from "@/services/comments/comments.schemas"
import { createIceboxItemSchema } from "@/services/icebox/icebox.schemas"
import { createTaskSchema, updateTaskSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { createSprintSchema, updateSprintSchema } from "@/services/sprints/sprints.schemas"
import { createDailyScrumSchema } from "@/services/daily-scrums/daily-scrums.schemas"
import {
  addSprintPbisOp,
  createAcceptanceCriterionOp,
  createCommentOp,
  createDailyScrumOp,
  createIceboxItemOp,
  createPbiOp,
  createSprintOp,
  createTaskOp,
  listCommentsOp,
  updateAcceptanceCriterionOp,
  updatePbiOp,
  updateSprintOp,
  updateTaskOp,
  v1UpdatePbiSchema,
} from "@/app/api/v1/_lib/v1-handlers"
import { registerDevTools } from "./dev-tools"
import { CREATE_NOTE, DATA_NOTICE, definedOnly, guard, mcpWrite, pbiIdIn, pbiScope, projectScope, toolOk, visibleProjects } from "./tool-kit"

/**
 * The Kanflow MCP tools (docs/mcp.md). Every tool resolves its project
 * through resolveV1ProjectActor (via projectScope / pbiScope), every write
 * goes through runV1Write (scope ∩ role, write budget, idempotency, the UI
 * schemas and services, activity `via: "mcp"`). No delete tools. The
 * developer tools (dev:write) live in dev-tools.ts.
 */

const id = z.string().min(1).max(191)
const projectIdArg = id.describe("Kanflow project id (from list_projects / resolve_project / .kanflow.json).")
const optionalProjectId = id.optional().describe("Kanflow project id. Optional when the entity is given by its internal id; required for PBI numbers.")
const pbiRef = z.string().min(1).max(191).describe('PBI: its internal id, its number "12" or "PBI-12" (numbers need projectId).')
const cursorArg = z.string().min(1).max(512).optional().describe("nextCursor of the previous page.")
const limitArg = z.number().int().min(1).max(PAGE_LIMIT_MAX).optional().describe(`Page size (1-${PAGE_LIMIT_MAX}, default 50).`)
const idempotencyKeyArg = z
  .string()
  .regex(/^[\x21-\x7e]{1,200}$/)
  .optional()
  .describe(
    "Optional. Same key = same create (kept 24 h; reuse it when retrying). A new, distinct key forces a second create even with identical arguments. Without a key, an identical call within 2 minutes is treated as a retry (replayed: true, nothing new created)."
  )

const READ = { readOnlyHint: true, openWorldHint: false } as const
const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const UPDATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

const describe = (text: string) => `${text}\n\n${DATA_NOTICE}`
const describeCreate = (text: string) => `${text}\n\n${CREATE_NOTE}\n\n${DATA_NOTICE}`

const COMMENT_KIND = { pbi: "pbi", sprint_task: "task", icebox: "icebox" } as const

export function registerKanflowTools(server: McpServer, principal: ApiPrincipal): void {
  const user = { id: principal.userId, role: principal.role }

  /** Project + resolved entity id of a comment thread (a PBI may be given as PBI-12). */
  async function threadScope(projectId: string | undefined, entityType: (typeof COMMENT_ENTITY_TYPES)[number], entityId: string) {
    if (entityType === "pbi") {
      const scope = await pbiScope(principal, projectId, entityId)
      return { scope, entityId: await pbiIdIn(scope.projectId, entityId) }
    }
    return { scope: await projectScope(principal, projectId, { kind: COMMENT_KIND[entityType], id: entityId }), entityId }
  }

  // ------------------------------------------------------------------ reads

  server.registerTool(
    "whoami",
    { description: describe("The Kanflow user behind the token, the token's scopes and its project restriction (projectIds null = all of the user's projects)."), inputSchema: {}, annotations: READ },
    () =>
      guard("whoami", async () => {
        const { data } = await getMe(principal.userId)
        return toolOk({ data: { ...data, token: { prefix: principal.tokenPrefix, scopes: principal.scopes, projectIds: principal.projectIds } } })
      })
  )

  server.registerTool(
    "list_projects",
    {
      description: describe("Projects the token can open (newest activity first)."),
      inputSchema: { status: z.enum(["active", "archived"]).optional().describe("Default active.") },
      annotations: READ,
    },
    ({ status }) => guard("list_projects", async () => toolOk(await listProjects(user, v1ProjectsQuerySchema.parse(definedOnly({ status })), principal.projectIds)))
  )

  server.registerTool(
    "resolve_project",
    {
      description: describe(
        "Find the Kanflow project(s) linked to a git repository through Kanflow's GitLab integration. Pass the output of `git remote get-url origin` (https or ssh form; credentials in the URL are ignored and never echoed). At most 50 matches; truncated: true when more exist."
      ),
      inputSchema: { remoteUrl: z.string().min(1).max(1000).describe("The git remote URL.") },
      annotations: READ,
    },
    ({ remoteUrl }) =>
      guard("resolve_project", async () => {
        const location = parseRepoUrl(normalizeRemoteUrl(remoteUrl))
        if (!location) throw new ValidationError("Not a repository URL on the configured GitLab host", {}, "VALIDATION")
        const found = await findProjectsByRepository(location)
        const allowed = await visibleProjects(principal, found.items.map((c) => c.projectId))
        return toolOk({
          data: found.items.filter((c) => allowed.has(c.projectId)),
          repository: { repoPath: location.repoPath },
          ...(found.truncated ? { truncated: true, limit: found.limit } : {}),
        })
      })
  )

  server.registerTool(
    "get_backlog",
    {
      description: describe("The product backlog of a project (PBIs oldest first, cursor-paginated). Use get_pbi for one PBI with its tasks and comments."),
      inputSchema: { projectId: projectIdArg, status: z.enum(PBI_STATUSES).optional(), cursor: cursorArg, limit: limitArg },
      annotations: READ,
    },
    ({ projectId, status, cursor, limit }) =>
      guard("get_backlog", async () => {
        const scope = await projectScope(principal, projectId)
        return toolOk(await listBacklog(scope.projectId, v1BacklogQuerySchema.parse(definedOnly({ status, cursor, limit }))))
      })
  )

  server.registerTool(
    "get_pbi",
    {
      description: describe("One PBI with its acceptance criteria, its sprint tasks and the first page of its comment thread."),
      inputSchema: { pbi: pbiRef, projectId: optionalProjectId },
      annotations: READ,
    },
    ({ pbi, projectId }) =>
      guard("get_pbi", async () => {
        const scope = await pbiScope(principal, projectId, pbi)
        const { data } = await getPbi(scope.projectId, pbi)
        const comments = await listCommentsOp(scope.projectId, scope.actor, { entityType: "pbi", entityId: data.id })
        return toolOk({ data: { ...data, projectId: scope.projectId, comments: comments.data, commentsNextCursor: comments.nextCursor } })
      })
  )

  server.registerTool(
    "list_sprints",
    { description: describe("Sprints of a project, newest first."), inputSchema: { projectId: projectIdArg }, annotations: READ },
    ({ projectId }) =>
      guard("list_sprints", async () => {
        const scope = await projectScope(principal, projectId)
        return toolOk(await listSprints(scope.projectId))
      })
  )

  server.registerTool(
    "get_sprint_tasks",
    {
      description: describe("Tasks of a sprint with their PBI, status, hours, assignees and version (send version back to update_task)."),
      inputSchema: { sprintId: id, projectId: optionalProjectId },
      annotations: READ,
    },
    ({ sprintId, projectId }) =>
      guard("get_sprint_tasks", async () => {
        const scope = await projectScope(principal, projectId, { kind: "sprint", id: sprintId })
        return toolOk(await listSprintTasks(scope.projectId, sprintId))
      })
  )

  server.registerTool(
    "my_tasks",
    {
      description: describe("Tasks assigned to the token user in open sprints (planning / active / review), in one project or in every active project the token can open. At most 200, oldest first; truncated: true when more exist."),
      inputSchema: { projectId: id.optional(), includeDone: z.boolean().optional().describe("Also list done tasks (default false).") },
      annotations: READ,
    },
    ({ projectId, includeDone }) =>
      guard("my_tasks", async () => {
        if (projectId !== undefined) {
          const scope = await projectScope(principal, projectId)
          const found = await listMyTasks(principal.userId, [scope.projectId], includeDone ?? false)
          return toolOk({ data: found.data, ...(found.truncated ? { truncated: true, limit: found.limit } : {}) })
        }
        // No IN list of every project: the query is bounded by the user's assignments (and the token's own
        // project list), then each project found goes through resolveV1ProjectActor (the single enforcement point).
        const found = await listMyTasks(principal.userId, principal.projectIds, includeDone ?? false)
        const allowed = await visibleProjects(principal, found.data.map((t) => t.projectId))
        return toolOk({
          data: found.data.filter((t) => allowed.has(t.projectId)),
          ...(found.truncated ? { truncated: true, limit: found.limit } : {}),
        })
      })
  )

  server.registerTool(
    "get_activity",
    {
      description: describe("The project's change history, newest first (meta.via = \"api\" / \"mcp\" marks token-made changes)."),
      inputSchema: { projectId: projectIdArg, entityType: z.enum(ACTIVITY_ENTITY_TYPES).optional(), cursor: cursorArg, limit: limitArg },
      annotations: READ,
    },
    ({ projectId, entityType, cursor, limit }) =>
      guard("get_activity", async () => {
        const scope = await projectScope(principal, projectId)
        return toolOk(await listActivity(scope.projectId, v1ActivityQuerySchema.parse(definedOnly({ entityType, cursor, limit }))))
      })
  )

  server.registerTool(
    "list_comments",
    {
      description: describe("One comment thread (PBI, sprint task or Icebox item), oldest first."),
      inputSchema: {
        entityType: z.enum(COMMENT_ENTITY_TYPES),
        entityId: id.describe('Id of the PBI / task / Icebox item (a PBI may be "PBI-12" with projectId).'),
        projectId: optionalProjectId,
        cursor: cursorArg,
        limit: limitArg,
      },
      annotations: READ,
    },
    ({ entityType, entityId, projectId, cursor, limit }) =>
      guard("list_comments", async () => {
        const thread = await threadScope(projectId, entityType, entityId)
        return toolOk(await listCommentsOp(thread.scope.projectId, thread.scope.actor, definedOnly({ entityType, entityId: thread.entityId, cursor, limit })))
      })
  )

  // ----------------------------------------------------------------- writes

  server.registerTool(
    "create_pbi",
    {
      description: describeCreate("Create a PBI (scope backlog:write; Product Owner / Scrum Master). Needs a userStory or an initiative. Read the backlog first (get_backlog) and do not create a PBI that already exists."),
      inputSchema: { projectId: projectIdArg, ...createBacklogItemSchema.shape, idempotencyKey: idempotencyKeyArg },
      annotations: CREATE,
    },
    ({ projectId, idempotencyKey, ...fields }) =>
      guard("create_pbi", async () => {
        const scope = await projectScope(principal, projectId)
        return mcpWrite(principal, { tool: "create_pbi", scope, action: "backlog.write", body: definedOnly(fields), params: {}, op: createPbiOp, idempotent: { key: idempotencyKey } })
      })
  )

  server.registerTool(
    "update_pbi",
    {
      description: describe("Edit a PBI (scope backlog:write; Product Owner / Scrum Master). Send `version` from get_pbi to detect concurrent edits (VERSION_CONFLICT). Ordering is not editable here."),
      inputSchema: { pbi: pbiRef, projectId: optionalProjectId, ...v1UpdatePbiSchema.shape },
      annotations: UPDATE,
    },
    ({ pbi, projectId, ...fields }) =>
      guard("update_pbi", async () => {
        const scope = await pbiScope(principal, projectId, pbi)
        return mcpWrite(principal, { tool: "update_pbi", scope, action: "backlog.write", body: definedOnly(fields), params: { itemId: pbi }, op: updatePbiOp })
      })
  )

  server.registerTool(
    "add_acceptance_criterion",
    {
      description: describeCreate(
        "Add an acceptance criterion to a PBI (scope backlog:write; Product Owner / Scrum Master). Give at least one of given / when / then / text (free text is fine); evidenceKind says how it is proven (test | inspection | measurement | approval). It gets the next number on the PBI (e.g. PBI-12/AC-3); numbers never change or come back after a delete. Read the PBI's existing criteria first (get_pbi) and do not add one that exists."
      ),
      inputSchema: { pbi: pbiRef, projectId: optionalProjectId, ...createAcceptanceCriterionSchema.shape, idempotencyKey: idempotencyKeyArg },
      annotations: CREATE,
    },
    ({ pbi, projectId, idempotencyKey, ...fields }) =>
      guard("add_acceptance_criterion", async () => {
        const scope = await pbiScope(principal, projectId, pbi)
        return mcpWrite(principal, {
          tool: "add_acceptance_criterion",
          scope,
          action: "backlog.write",
          body: definedOnly(fields),
          params: { itemId: pbi },
          op: createAcceptanceCriterionOp,
          idempotent: { key: idempotencyKey },
        })
      })
  )

  server.registerTool(
    "update_acceptance_criterion",
    {
      description: describe(
        "Edit an acceptance criterion of a PBI (scope backlog:write; Product Owner / Scrum Master). `criterion` is its id from get_pbi (\"PBI-12/AC-2\") or its number (\"AC-2\", \"2\"). Only the sent fields change; null clears one; the number never changes. There is no delete tool."
      ),
      inputSchema: {
        pbi: pbiRef,
        criterion: z.string().min(1).max(40).describe('Criterion id from get_pbi ("PBI-12/AC-2") or its number ("AC-2", "2").'),
        projectId: optionalProjectId,
        ...updateAcceptanceCriterionSchema.shape,
      },
      annotations: UPDATE,
    },
    ({ pbi, criterion, projectId, ...fields }) =>
      guard("update_acceptance_criterion", async () => {
        const scope = await pbiScope(principal, projectId, pbi)
        return mcpWrite(principal, {
          tool: "update_acceptance_criterion",
          scope,
          action: "backlog.write",
          body: definedOnly(fields),
          params: { itemId: pbi, acRef: criterion },
          op: updateAcceptanceCriterionOp,
        })
      })
  )

  server.registerTool(
    "create_sprint",
    {
      description: describeCreate("Create a sprint (scope sprint:write; Product Owner / Scrum Master). Dates as YYYY-MM-DD; selectedPbIds are internal PBI ids."),
      inputSchema: { projectId: projectIdArg, ...createSprintSchema.shape, idempotencyKey: idempotencyKeyArg },
      annotations: CREATE,
    },
    ({ projectId, idempotencyKey, ...fields }) =>
      guard("create_sprint", async () => {
        const scope = await projectScope(principal, projectId)
        return mcpWrite(principal, { tool: "create_sprint", scope, action: "sprint.manage", body: definedOnly(fields), params: {}, op: createSprintOp, idempotent: { key: idempotencyKey } })
      })
  )

  server.registerTool(
    "update_sprint",
    {
      description: describe("Edit a sprint: goal, dates, status, review, retrospective (scope sprint:write; Product Owner / Scrum Master)."),
      inputSchema: { sprintId: id, projectId: optionalProjectId, ...updateSprintSchema.shape },
      annotations: UPDATE,
    },
    ({ sprintId, projectId, ...fields }) =>
      guard("update_sprint", async () => {
        const scope = await projectScope(principal, projectId, { kind: "sprint", id: sprintId })
        return mcpWrite(principal, { tool: "update_sprint", scope, action: "sprint.manage", body: definedOnly(fields), params: { sprintId }, op: updateSprintOp })
      })
  )

  server.registerTool(
    "add_pbis_to_sprint",
    {
      description: describe("Add PBIs to a sprint (scope sprint:write; Product Owner / Scrum Master). PBIs already in it are skipped, so a retry is harmless."),
      inputSchema: { sprintId: id, projectId: optionalProjectId, pbis: z.array(pbiRef).min(1).max(50) },
      annotations: { ...UPDATE, idempotentHint: true },
    },
    ({ sprintId, projectId, pbis }) =>
      guard("add_pbis_to_sprint", async () => {
        const scope = await projectScope(principal, projectId, { kind: "sprint", id: sprintId })
        const pbIds = await Promise.all(pbis.map((ref) => pbiIdIn(scope.projectId, ref)))
        return mcpWrite(principal, { tool: "add_pbis_to_sprint", scope, action: "sprint.manage", body: { pbIds }, params: { sprintId }, op: addSprintPbisOp })
      })
  )

  // The PBI comes as a reference (`pbi`, may be PBI-12) and is resolved to pbItemId.
  const createTaskFields = createTaskSchema.omit({ pbItemId: true }).shape
  server.registerTool(
    "create_task",
    {
      description: describeCreate("Create a task under a PBI of a sprint (scope task:write; team members). assigneeIds are user ids (whoami gives yours). Read the existing tasks first (get_sprint_tasks / get_pbi) and do not create one that already exists; if a task of the same PBI with the same name exists, the result also lists it in `similar` (the task is still created — tell the user)."),
      inputSchema: { sprintId: id, pbi: pbiRef, projectId: optionalProjectId, ...createTaskFields, idempotencyKey: idempotencyKeyArg },
      annotations: CREATE,
    },
    ({ sprintId, pbi, projectId, idempotencyKey, ...fields }) =>
      guard("create_task", async () => {
        const scope = await projectScope(principal, projectId, { kind: "sprint", id: sprintId })
        const body = { pbItemId: await pbiIdIn(scope.projectId, pbi), ...definedOnly(fields) }
        return mcpWrite(principal, { tool: "create_task", scope, action: "task.write", body, params: { sprintId }, op: createTaskOp, idempotent: { key: idempotencyKey } })
      })
  )

  server.registerTool(
    "update_task",
    {
      description: describe(
        "Update a task: status (todo / in_progress / review / done), actualHours, estimatedHours, assigneeIds, name, completionComment (scope task:write; team members). Send `version` from get_sprint_tasks / my_tasks to detect concurrent edits (VERSION_CONFLICT: re-read and retry)."
      ),
      inputSchema: { taskId: id, projectId: optionalProjectId, ...updateTaskSchema.shape },
      annotations: UPDATE,
    },
    ({ taskId, projectId, ...fields }) =>
      guard("update_task", async () => {
        const scope = await projectScope(principal, projectId, { kind: "task", id: taskId })
        const sprintId = scope.sprintId
        // locateEntity always returns the sprint of a task; treat anything else as not found.
        if (!sprintId) throw new NotFoundError()
        return mcpWrite(principal, { tool: "update_task", scope, action: "task.write", body: definedOnly(fields), params: { sprintId, taskId }, op: updateTaskOp })
      })
  )

  server.registerTool(
    "add_comment",
    {
      description: describeCreate("Comment on a PBI, a sprint task or an Icebox item (scope comment:write; team members). @mentions notify as in the UI."),
      inputSchema: {
        entityType: z.enum(COMMENT_ENTITY_TYPES),
        entityId: id.describe('Id of the PBI / task / Icebox item (a PBI may be "PBI-12" with projectId).'),
        body: z.string().min(1).max(10_000),
        projectId: optionalProjectId,
        idempotencyKey: idempotencyKeyArg,
      },
      annotations: CREATE,
    },
    ({ entityType, entityId, body, projectId, idempotencyKey }) =>
      guard("add_comment", async () => {
        const thread = await threadScope(projectId, entityType, entityId)
        return mcpWrite(principal, {
          tool: "add_comment",
          scope: thread.scope,
          action: "comment.write",
          body: { entityType, entityId: thread.entityId, body },
          params: {},
          op: createCommentOp,
          idempotent: { key: idempotencyKey },
        })
      })
  )

  server.registerTool(
    "create_icebox_item",
    {
      description: describeCreate("Submit a request (idea, improvement, bug report) to the project's Icebox (scope icebox:write)."),
      inputSchema: { projectId: projectIdArg, ...createIceboxItemSchema.shape, idempotencyKey: idempotencyKeyArg },
      annotations: CREATE,
    },
    ({ projectId, idempotencyKey, ...fields }) =>
      guard("create_icebox_item", async () => {
        const scope = await projectScope(principal, projectId)
        return mcpWrite(principal, { tool: "create_icebox_item", scope, action: "icebox.write", body: definedOnly(fields), params: {}, op: createIceboxItemOp, idempotent: { key: idempotencyKey } })
      })
  )

  server.registerTool(
    "post_daily_scrum",
    {
      description: describeCreate("Post a daily scrum note to a sprint (scope daily:write; team members). date as YYYY-MM-DD."),
      inputSchema: { sprintId: id, projectId: optionalProjectId, ...createDailyScrumSchema.shape, idempotencyKey: idempotencyKeyArg },
      annotations: CREATE,
    },
    ({ sprintId, projectId, idempotencyKey, ...fields }) =>
      guard("post_daily_scrum", async () => {
        const scope = await projectScope(principal, projectId, { kind: "sprint", id: sprintId })
        return mcpWrite(principal, { tool: "post_daily_scrum", scope, action: "dailyScrum.write", body: definedOnly(fields), params: { sprintId }, op: createDailyScrumOp, idempotent: { key: idempotencyKey } })
      })
  )

  // ------------------------------------------- development (dev:write, K5)
  registerDevTools(server, principal)
}
