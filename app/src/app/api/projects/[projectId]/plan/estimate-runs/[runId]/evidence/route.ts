import { can, requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { evidenceQuerySchema } from "@/services/plan-estimate-run/estimate-run.schemas"
import { readRunEvidence } from "@/services/plan-estimate-run/estimate-run.service"

type Params = { params: Promise<{ projectId: string; runId: string }> }

/**
 * 根拠を見る (plan 12 §3.2 / §3.6): the run's per-item evidence, 50 items per page (?offset=). Re-checked for every
 * reader: a source that became confidential hides that item's numbers, other projects' sources the reader cannot view
 * fold into "other projects (band)", only viewable project names are shown, roles never owners.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId, runId } = await params
  const gate = await requireProject(projectId, "plan.estimate")
  if ("error" in gate) return gate.error
  try {
    const { offset } = evidenceQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    return jsonResponse(await readRunEvidence(projectId, runId, { userId: gate.actor.userId, systemRole: gate.actor.systemRole, canViewMemberLoad: can(gate.actor, "plan.viewMemberLoad") }, offset))
  } catch (error) {
    return toHttpResponse(error, { fallback: "根拠を読み込めませんでした", context: "Plan ESTIMATE evidence" })
  }
}
