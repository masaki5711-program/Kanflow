import { z } from "zod"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { approveLineage, listLineageEvals, withdrawLineage } from "@/services/plan-estimate-eval/admin.service"
import { lineageSchema } from "@/lib/plan-schedule/schedule-source"
import { requireEstimateGateManager } from "@/lib/authz/require-lineage-rule"

const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), lineage: lineageSchema, evalId: z.string().min(1).max(191) }),
  z.object({ decision: z.literal("withdraw"), lineage: lineageSchema }),
])

/**
 * Approve "実績で調整" for a lineage on the backtest record the admin saw, or withdraw it (admins).
 * Body { decision: "approve", lineage, evalId } | { decision: "withdraw", lineage } → EvalOverview
 */
export async function POST(request: Request) {
  const gate = await requireEstimateGateManager()
  if ("error" in gate) return gate.error

  try {
    const body = bodySchema.parse(await request.json())
    if (body.decision === "approve") await approveLineage(body.lineage, body.evalId, gate.session.user.id)
    else await withdrawLineage(body.lineage, gate.session.user.id)
    return jsonResponse(await listLineageEvals())
  } catch (error) {
    return toHttpResponse(error, { fallback: "見積もりの有効化の変更に失敗しました", context: "Admin estimate eval APPROVAL" })
  }
}
