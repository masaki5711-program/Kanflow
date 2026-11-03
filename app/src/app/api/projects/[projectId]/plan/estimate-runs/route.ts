import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createRunSchema } from "@/services/plan-estimate-run/estimate-run.schemas"
import { createRun } from "@/services/plan-estimate-run/estimate-run.service"
import { loadVisibleTemplate } from "@/services/plan-templates/plan-templates.service"
import { defaultDb } from "@/services/_shared/db"

type Params = { params: Promise<{ projectId: string }> }

/**
 * 計画を作る (plan 12 E5): make an estimate run — the template (or a base schedule) with the actuals, the confirmed
 * lesson rules and the levelling applied. Needs plan.estimate. Body { startDate, skipWeekends?, roleAssignments,
 * templateId | schedule (+ sourceRef?, lineage?) } → 201 { runId, expiresAt, summary }. Nothing in the plan changes:
 * approving is /plan/load with estimateRunId. 400 PLAN_ROLE_ASSIGNMENT_INVALID when a role names a non-member.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.estimate")
  if ("error" in gate) return gate.error
  try {
    const body = createRunSchema.parse(await request.json())
    const actor = actorFromSession(gate.session)
    // A private template is usable only by those who may see it (the run then keeps its content by version).
    if (body.templateId) await loadVisibleTemplate(defaultDb, body.templateId, actor)
    const source = body.templateId
      ? { kind: "template" as const, templateId: body.templateId }
      : { kind: "schedule" as const, schedule: body.schedule!, ...(body.sourceRef ? { sourceRef: body.sourceRef } : {}), ...(body.lineage ? { lineage: body.lineage } : {}) }
    const skipWeekends = body.skipWeekends ?? (body.schedule?.skipWeekends === true)
    const run = await createRun(projectId, { startDate: body.startDate, skipWeekends, roleAssignments: body.roleAssignments, source }, { userId: actor.userId, userName: actor.userName, systemRole: actor.systemRole })
    return jsonResponse(run, 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "計画の案を作れませんでした", context: "Plan ESTIMATE" })
  }
}
