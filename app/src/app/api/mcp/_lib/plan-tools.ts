import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { BASE_SCHEDULE_MAX_DEPTH, BASE_SCHEDULE_MAX_ITEMS, baseScheduleSchema, startDateSchema } from "@/lib/plan-schedule/base-schedule"
import { lineageSchema, sourceRefSchema } from "@/lib/plan-schedule/schedule-source"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { getPlanTree } from "@/services/plan/plan.tree"
import { proposePlanItems, proposePlanItemsSchema } from "@/services/plan/plan.propose"
import { DATA_NOTICE, definedOnly, guard, mcpWrite, projectScope, toolOk } from "./tool-kit"

/**
 * Master-plan (全体計画) tools of the Kanflow MCP server (W12; docs/mcp.md "Plan tools"):
 * get_plan (scope read) and propose_plan_items (scope backlog:write; Product Owner / Scrum Master).
 *
 * propose_plan_items never writes to the plan. It puts ONE approval card (the AI-chat `plan_load`
 * proposal) into a chat thread of the token's owner; approving it calls POST /plan/load under that person's
 * own rights. Scope: there is no `plan:write` token scope, and `backlog:write` is the existing scope whose
 * project action (`backlog.write`) is held by exactly the roles that hold `plan.write` (PO and SM) — the
 * approval itself re-checks `plan.write`.
 */

const projectIdArg = z.string().min(1).max(191).describe("The Kanflow project id (list_projects / resolve_project).")
const idempotencyKeyArg = z
  .string()
  .regex(/^[\x21-\x7e]{1,200}$/)
  .optional()
  .describe("Optional. Same key = same call (kept 24 h). Without a key an identical call within 2 minutes returns the first result (replayed: true).")

const READ = { readOnlyHint: true, openWorldHint: false } as const
const PROPOSE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

const describe = (text: string) => `${text}\n\n${DATA_NOTICE}`

export function registerPlanTools(server: McpServer, principal: ApiPrincipal): void {
  server.registerTool(
    "get_plan",
    {
      description: describe(
        "The project's master plan (全体計画) as a tree (scope read): each item has name, status, progressPct, isMilestone, plannedStart / plannedEnd (YYYY-MM-DD, null = 日程未定), durationDays, owner, dependsOn (ids of items that must finish first) and children. " +
          "Read it before propose_plan_items so you do not propose what the plan already has.",
      ),
      inputSchema: { projectId: projectIdArg },
      annotations: READ,
    },
    ({ projectId }) =>
      guard("get_plan", async () => {
        const scope = await projectScope(principal, projectId)
        return toolOk(await getPlanTree(scope.projectId))
      }),
  )

  server.registerTool(
    "propose_plan_items",
    {
      description: describe(
        "Propose loading a base schedule into the master plan (scope backlog:write; Product Owner / Scrum Master). " +
          "Give the schedule of the spec template (schedule.yml) as JSON — `items`: a tree of { key, name, durationDays?, milestone?, dependsOn?: [keys], children?, role?, load?, formerKeys?: [keys] } with relative durations in days — and the project's `startDate` (YYYY-MM-DD). " +
          "Optional per item: role (short id of who does it), load (share of one person's time, 0..1, default 1), formerKeys (the item's keys in earlier template versions; never another item's key). " +
          "Pass sourceRef (gitstation:<repo>@<tag>:<path> or template:<id>@v<n>) when you know where the schedule came from, and lineage (the template family name that stays the same across versions) if the source does not imply it. " +
          `Kanflow places every leaf from the start date (dependencies respected; skipWeekends counts Monday–Friday only) and derives the parents' spans. At most ${BASE_SCHEDULE_MAX_ITEMS} items and ${BASE_SCHEDULE_MAX_DEPTH} levels; keys are unique; a dependency may not point at itself, an ancestor, a descendant or form a cycle (PLAN_SCHEDULE_INVALID). ` +
          "This does NOT change the plan: it puts one approval card into a chat thread of the token's owner (chatPath in the answer), and the plan changes only when that person approves it. Tell the user to open it. " +
          "A schedule too large for one card is refused with PLAN_PROPOSAL_TOO_LARGE.",
      ),
      inputSchema: {
        projectId: projectIdArg,
        startDate: startDateSchema.describe("Start of the first item, YYYY-MM-DD."),
        ...baseScheduleSchema.shape,
        name: z.string().max(200).optional().describe("Heading of the card (e.g. the template's name)."),
        reason: z.string().max(1000).optional().describe("One sentence on why this plan is proposed."),
        sourceRef: sourceRefSchema.optional().describe("Where the schedule came from: gitstation:<repo>@<tag>:<path> (e.g. gitstation:equipment-spec@v1.2.0:schedule.yml) or template:<id>@v<n>."),
        lineage: lineageSchema.optional().describe("Template family name stable across versions (default: derived from sourceRef, else from name)."),
        idempotencyKey: idempotencyKeyArg,
      },
      annotations: PROPOSE,
    },
    ({ projectId, idempotencyKey, startDate, items, skipWeekends, name, reason, sourceRef, lineage }) =>
      guard("propose_plan_items", async () => {
        const scope = await projectScope(principal, projectId)
        return mcpWrite(principal, {
          tool: "propose_plan_items",
          scope,
          action: "backlog.write",
          body: definedOnly({ startDate, schedule: definedOnly({ items, skipWeekends }), name, reason, sourceRef, lineage }),
          params: {},
          op: async ({ projectId: pid, body, serviceActor }) => ({ data: await proposePlanItems(pid, proposePlanItemsSchema.parse(body), serviceActor) }),
          idempotent: { key: idempotencyKey },
        })
      }),
  )
}
