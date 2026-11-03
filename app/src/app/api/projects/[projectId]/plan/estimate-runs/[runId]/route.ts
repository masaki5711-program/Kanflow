import { can, requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { readRunCard } from "@/services/plan-estimate-run/estimate-run.service"

type Params = { params: Promise<{ projectId: string; runId: string }> }

/**
 * The card of an estimate run (plan 12 §3.6): end dates (template / P50 / P80 / levelled), the largest changes, the
 * data volume as a band, the per-lineage default, expiry and staleness. The per-person part (owners, moves,
 * utilization) only with plan.viewMemberLoad. A run of another project answers 404 like a missing one.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, runId } = await params
  const gate = await requireProject(projectId, "plan.estimate")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await readRunCard(projectId, runId, { userId: gate.actor.userId, systemRole: gate.actor.systemRole, canViewMemberLoad: can(gate.actor, "plan.viewMemberLoad") }))
  } catch (error) {
    return toHttpResponse(error, { fallback: "計画の案を読み込めませんでした", context: "Plan ESTIMATE card" })
  }
}
