import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { answersActualDates } from "@/lib/plan-progress"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { ValidationError } from "@/services/_shared/errors"
import type { PlanItemDto } from "@/services/plan/plan.dto"
import { setPredecessors } from "@/services/plan/plan.schedule"
import { PLAN_PREDECESSORS_MAX, createPlanItemSchema, setPredecessorsSchema, updatePlanItemSchema } from "@/services/plan/plan.schemas"
import { createPlanItem, updatePlanItem } from "@/services/plan/plan.service"
import { CREATE_NOTE, DATA_NOTICE, definedOnly, guard, mcpWrite, projectScope } from "./tool-kit"

/**
 * Direct edits of master-plan (全体計画) rows over MCP (docs/mcp.md "Plan tools"): create_plan_item,
 * update_plan_item, set_plan_dependencies.
 *
 * All need the token scope `plan:write` AND the person's `plan.write` in the project (Product Owner /
 * Scrum Master) — the same services and rules as the web UI's plan routes, recorded with `via: "mcp"`.
 * A change of an existing row must carry the row's `version` from get_plan, so an edit a person made in
 * the meantime is never overwritten. A whole base schedule still goes through propose_plan_items (one
 * approval card); these tools are for single rows. There is no delete tool: rows are removed in Kanflow.
 *
 * Confidential PBIs (D-5): a row whose progress follows its linked PBIs takes status, percentage and actual dates
 * from ALL of them, and a row with ANY linked PBI cannot become a milestone. Nothing these tools accept or answer
 * may depend on a PBI the token cannot see:
 *  - `progressMode` is not an input (a row made here is kept by hand, an existing row keeps its mode);
 *  - status / actualStart / actualEnd of a row that follows its PBIs are refused by the mode alone
 *    (PLAN_FOLLOWS_PBIS, assertHandKeptFields) — a written status would stay only when no PBI is linked;
 *  - `isMilestone` is an input of create only — on an existing row the switch is refused when a PBI is linked;
 *  - the answer carries no actual dates for such a row (answersActualDates).
 * What stays is the documented residual: `progressPct` / `status` of such a row (docs/api-v1.md "Confidential PBIs").
 * `color` is a display setting of the web UI and is not an input either.
 */

const projectIdArg = z.string().min(1).max(191).describe("The Kanflow project id (list_projects / resolve_project).")
const itemIdArg = z.string().min(1).max(64).describe("Id of the plan item (get_plan).")
const versionArg = z.number().int().min(0).describe("The item's `version` from get_plan (or from the last answer for this item). A stale version is refused with VERSION_CONFLICT: call get_plan again and retry.")
const idempotencyKeyArg = z
  .string()
  .regex(/^[\x21-\x7e]{1,200}$/)
  .optional()
  .describe("Optional. Same key = same call (kept 24 h). Without a key an identical call within 2 minutes returns the first result (replayed: true).")

const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const UPDATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

const describe = (text: string) => `${text}\n\n${DATA_NOTICE}`
const describeCreate = (text: string) => `${text}\n\n${CREATE_NOTE}\n\n${DATA_NOTICE}`

/** What create_plan_item accepts: the UI's POST body without the progress mode and the display colour. */
const createFields = createPlanItemSchema.omit({ progressMode: true, color: true })
/** What update_plan_item accepts: the UI's PATCH body without those two, the milestone switch and the display order, and with `version` required. */
const updateFields = updatePlanItemSchema.omit({ progressMode: true, color: true, isMilestone: true, sortOrder: true, version: true })
const updateBody = updateFields.extend({ version: versionArg })

export interface PlanItemAnswer {
  id: string
  parentId: string | null
  name: string
  status: string
  progressPct: number
  isMilestone: boolean
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  durationDays: number | null
  owner: { id: string; name: string } | null
  version: number
}

/**
 * Pure: the answer of a plan write — the fields get_plan shows for a node. The linked-PBI figures, sprint
 * names and translations of the UI's DTO stay inside Kanflow, and so do the actual dates of a row whose
 * progress follows its linked PBIs (as in get_plan).
 */
export function toPlanItemAnswer(dto: PlanItemDto): PlanItemAnswer {
  return {
    id: dto.id,
    parentId: dto.parentId,
    name: dto.name,
    status: dto.status,
    progressPct: dto.progressPct,
    isMilestone: dto.isMilestone,
    plannedStart: dto.plannedStart,
    plannedEnd: dto.plannedEnd,
    actualStart: answersActualDates(dto.progressMode) ? dto.actualStart : null,
    actualEnd: answersActualDates(dto.progressMode) ? dto.actualEnd : null,
    durationDays: dto.durationDays,
    owner: dto.owner ? { id: dto.owner.id, name: dto.owner.name } : null,
    version: dto.version,
  }
}

export function registerPlanWriteTools(server: McpServer, principal: ApiPrincipal): void {
  server.registerTool(
    "create_plan_item",
    {
      description: describeCreate(
        "Add ONE row to the master plan (全体計画) (scope plan:write; Product Owner / Scrum Master). The plan changes at once, as if the person had added the row in Kanflow. " +
          "Give `name`; optional: parentId (the row it goes under), plannedStart / plannedEnd (YYYY-MM-DD; leave both out for 日程未定), durationDays, isMilestone, status (not_started / in_progress / done / on_hold), ownerId (a project member), description, notes. " +
          "The row's progress is kept by hand (its status); linking it to backlog items is done in Kanflow. " +
          "Read get_plan first so you do not add a row the plan already has. For a whole schedule use propose_plan_items instead (one approval card).",
      ),
      inputSchema: { projectId: projectIdArg, ...createFields.shape, idempotencyKey: idempotencyKeyArg },
      annotations: CREATE,
    },
    ({ projectId, idempotencyKey, ...fields }) =>
      guard("create_plan_item", async () => {
        const scope = await projectScope(principal, projectId)
        return mcpWrite(principal, {
          tool: "create_plan_item",
          scope,
          action: "plan.write",
          body: definedOnly(fields),
          params: {},
          op: async ({ projectId: pid, body, serviceActor }) => ({ data: toPlanItemAnswer(await createPlanItem(pid, createFields.parse(body), serviceActor)) }),
          idempotent: { key: idempotencyKey },
        })
      }),
  )

  server.registerTool(
    "update_plan_item",
    {
      description: describe(
        "Change ONE row of the master plan (scope plan:write; Product Owner / Scrum Master): name, parentId (move under another row; null = top level), plannedStart / plannedEnd, actualStart / actualEnd (YYYY-MM-DD; null clears), durationDays, status (not_started / in_progress / done / on_hold), ownerId, description, notes. " +
          "Send only the fields that change, plus the row's `version` from get_plan. The plan changes at once. " +
          "Dates and progress of a row that has children are derived from the children: change the children. " +
          "A row whose progress follows its linked backlog items keeps doing so (that setting is changed in Kanflow): its status and actual dates cannot be set here (PLAN_FOLLOWS_PBIS — change the other fields, or the backlog items), and its actual dates are not answered (null). " +
          "Whether a row is a milestone is set when it is created (or in Kanflow), not here.",
      ),
      inputSchema: { projectId: projectIdArg, itemId: itemIdArg, ...updateFields.shape, version: versionArg },
      annotations: UPDATE,
    },
    ({ projectId, itemId, version, ...fields }) =>
      guard("update_plan_item", async () => {
        const scope = await projectScope(principal, projectId)
        const changes = definedOnly(fields)
        if (Object.keys(changes).length === 0) throw new ValidationError("Give at least one field to change", {}, "VALIDATION")
        return mcpWrite(principal, {
          tool: "update_plan_item",
          scope,
          action: "plan.write",
          body: { ...changes, version },
          params: { itemId },
          op: async ({ projectId: pid, params, body, serviceActor }) => ({
            data: toPlanItemAnswer(await updatePlanItem(pid, params.itemId, updateBody.parse(body), serviceActor, new Date(), { handKeptFieldsOnly: true })),
          }),
        })
      }),
  )

  server.registerTool(
    "set_plan_dependencies",
    {
      description: describe(
        "Set which plan items must finish before one item starts (scope plan:write; Product Owner / Scrum Master). `dependsOn` replaces the item's whole list as get_plan shows it ([] = no dependency): send the ids to keep together with the new ones. The answer names the ids that were taken away (`removedIds`). " +
          "A dependency is drawn on the Gantt chart; no date is moved. " +
          `At most ${PLAN_PREDECESSORS_MAX} ids. Refused, with nothing changed, when an id is the item itself, its ancestor or descendant (PLAN_DEPENDENCY_INVALID) or would close a cycle (PLAN_DEPENDENCY_CYCLE).`,
      ),
      inputSchema: { projectId: projectIdArg, itemId: itemIdArg, ...setPredecessorsSchema.shape },
      annotations: { ...UPDATE, idempotentHint: true },
    },
    ({ projectId, itemId, dependsOn }) =>
      guard("set_plan_dependencies", async () => {
        const scope = await projectScope(principal, projectId)
        return mcpWrite(principal, {
          tool: "set_plan_dependencies",
          scope,
          action: "plan.write",
          body: { dependsOn },
          params: { itemId },
          op: async ({ projectId: pid, params, body, serviceActor }) => ({
            data: await setPredecessors(pid, params.itemId, setPredecessorsSchema.parse(body).dependsOn, serviceActor),
          }),
        })
      }),
  )
}
