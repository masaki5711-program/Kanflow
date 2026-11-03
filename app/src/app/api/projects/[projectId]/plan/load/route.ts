import { can, forbiddenResponse, requireProject } from "@/lib/authz"
import { baseScheduleSchema, startDateSchema } from "@/lib/plan-schedule/base-schedule"
import { lineageSchema, sourceRefSchema } from "@/lib/plan-schedule/schedule-source"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { loadRunSchema } from "@/services/plan-estimate-run/estimate-run.schemas"
import { loadEstimateRun } from "@/services/plan-estimate-run/estimate-run.service"
import { loadBaseSchedule } from "@/services/plan/plan.base-schedule"
import { z } from "zod"

type Params = { params: Promise<{ projectId: string }> }

const bodySchema = z.object({
  startDate: startDateSchema,
  schedule: baseScheduleSchema,
  proposalId: z.string().min(1).max(64).optional(),
  sourceRef: sourceRefSchema.optional(),
  lineage: lineageSchema.optional(),
})

/**
 * Load a base schedule (phases, milestones, relative durations, dependencies; W12) into the plan with
 * dates from `startDate`. This is what approving a `plan_load` proposal calls (docs/mcp.md propose_plan_items).
 * Body { startDate, schedule: { items, skipWeekends? }, proposalId?, sourceRef?, lineage? } (a proposalId loads once: 409 PLAN_ALREADY_LOADED)
 * → { createdCount, dependencyCount, rootIds, plannedStart, plannedEnd }. Every created row gets its item key, the load
 * record (plan_schedule_load: sourceRef, lineage, content hash) and a baseline equal to its planned dates (plan 12 E0).
 *
 * Approving an estimate run (plan 12 E5): body { estimateRunId, removedOwnerKeys? } — nothing else. Needs plan.write
 * and plan.estimate. The server recomputes the run; 409 PLAN_ESTIMATE_STALE when its inputs changed, it is older than
 * 24 h, the recomputed end date or owners differ, or a source became unusable; 404 PLAN_ESTIMATE_RUN_NOT_FOUND for
 * another project's run. Owners come from the run only (the approver may remove some, never add or swap).
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const raw: unknown = await request.json()
    const actor = actorFromSession(gate.session)
    if (typeof raw === "object" && raw !== null && "estimateRunId" in raw) {
      if (!can(gate.actor, "plan.estimate")) return forbiddenResponse()
      const body = loadRunSchema.parse(raw)
      return jsonResponse(await loadEstimateRun(projectId, body.estimateRunId, body.removedOwnerKeys, actor, { canViewMemberLoad: can(gate.actor, "plan.viewMemberLoad") }), 201)
    }
    const input = bodySchema.parse(raw)
    return jsonResponse(await loadBaseSchedule(projectId, input, actor), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "計画の読み込みに失敗しました", context: "PlanItem LOAD" })
  }
}
