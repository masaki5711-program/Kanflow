import { requireProject } from "@/lib/authz"
import { baseScheduleSchema, startDateSchema } from "@/lib/plan-schedule/base-schedule"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { loadBaseSchedule } from "@/services/plan/plan.base-schedule"
import { z } from "zod"

type Params = { params: Promise<{ projectId: string }> }

const bodySchema = z.object({ startDate: startDateSchema, schedule: baseScheduleSchema })

/**
 * Load a base schedule (phases, milestones, relative durations, dependencies; W12) into the plan with
 * dates from `startDate`. This is what approving a `plan_load` proposal calls (docs/mcp.md propose_plan_items).
 * Body { startDate, schedule: { items, skipWeekends? } } → { createdCount, dependencyCount, rootIds, plannedStart, plannedEnd }.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = bodySchema.parse(await request.json())
    return jsonResponse(await loadBaseSchedule(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "計画の読み込みに失敗しました", context: "PlanItem LOAD" })
  }
}
