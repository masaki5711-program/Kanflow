import { z } from "zod"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listLineageEvals } from "@/services/plan-estimate-eval/admin.service"
import { approveParams, enqueueAllParamSearches, rejectParams, revertParams } from "@/services/plan-estimate-eval/params.service"
import { lineageSchema } from "@/lib/plan-schedule/schedule-source"
import { requireEstimateParamsApprover } from "@/lib/authz/require-lineage-rule"

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search") }),
  z.object({ action: z.literal("approve"), lineage: lineageSchema, proposalId: z.string().min(1).max(191) }),
  z.object({ action: z.literal("reject"), lineage: lineageSchema, proposalId: z.string().min(1).max(191) }),
  z.object({ action: z.literal("revert"), lineage: lineageSchema }),
])

/**
 * The estimator settings of a lineage (admins: `canApproveEstimateParams`).
 * - { action: "search" }: queue the deterministic parameter search of every lineage with current actuals (runs after
 *   the response, one lineage at a time with the backtests) → 202 EvalOverview (paramSearch.searching lists them)
 * - { action: "approve", lineage, proposalId }: approve the proposal that was shown → EvalOverview
 * - { action: "reject", lineage, proposalId } → EvalOverview
 * - { action: "revert", lineage }: return the lineage to the default settings → EvalOverview
 */
export async function POST(request: Request) {
  const gate = await requireEstimateParamsApprover()
  if ("error" in gate) return gate.error

  try {
    const body = bodySchema.parse(await request.json())
    const actor = gate.session.user.id
    if (body.action === "search") {
      await enqueueAllParamSearches()
      return jsonResponse(await listLineageEvals(), 202)
    }
    if (body.action === "approve") await approveParams(body.lineage, body.proposalId, actor)
    else if (body.action === "reject") await rejectParams(body.lineage, body.proposalId, actor)
    else await revertParams(body.lineage, actor)
    return jsonResponse(await listLineageEvals())
  } catch (error) {
    return toHttpResponse(error, { fallback: "見積もりのパラメータの変更に失敗しました", context: "Admin estimate params" })
  }
}
