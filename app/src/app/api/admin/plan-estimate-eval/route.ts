import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listLineageEvals } from "@/services/plan-estimate-eval/admin.service"
import { recordAllLineages } from "@/services/plan-estimate-eval/eval.service"
import { requireEstimateGateManager } from "@/lib/authz/require-lineage-rule"

/** The backtest of real actuals per lineage, with the approvals (admins). → EvalOverview */
export async function GET() {
  const gate = await requireEstimateGateManager()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listLineageEvals())
  } catch (error) {
    return toHttpResponse(error, { fallback: "見積もりの検証の取得に失敗しました", context: "Admin estimate eval LIST" })
  }
}

/**
 * Recompute the backtest of every lineage with current actuals (admins). Each lineage on its own: one that fails is
 * named in `failed` and the others are still computed. → EvalOverview & { failed: string[] }
 */
export async function POST() {
  const gate = await requireEstimateGateManager()
  if ("error" in gate) return gate.error

  try {
    const { failed } = await recordAllLineages()
    return jsonResponse({ ...(await listLineageEvals()), failed })
  } catch (error) {
    return toHttpResponse(error, { fallback: "見積もりの検証の計算に失敗しました", context: "Admin estimate eval RECOMPUTE" })
  }
}
