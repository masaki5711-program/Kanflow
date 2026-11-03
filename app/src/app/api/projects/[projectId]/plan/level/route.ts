import { can, forbiddenResponse, requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { levelSchema } from "@/services/plan-leveling/capacity.schemas"
import { levelProject } from "@/services/plan-leveling/load.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * Level the project's loaded base schedule (plan 12 §3.5). Body { startDate, skipWeekends?, roleAssignments }.
 * Needs plan.write AND plan.viewMemberLoad (the result shows who is busy when). Nothing is written: a proposal.
 * 400 PLAN_ROLE_ASSIGNMENT_INVALID when a role names someone who is not an explicit member.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error
  if (!can(gate.actor, "plan.viewMemberLoad")) return forbiddenResponse()
  try {
    const input = levelSchema.parse(await request.json())
    return jsonResponse(await levelProject(projectId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "平準化に失敗しました", context: "Plan LEVEL" })
  }
}
