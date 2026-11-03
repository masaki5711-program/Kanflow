import { requireActualsPseudonymizer } from "@/lib/authz/require-lineage-rule"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { pseudonymizeSchema } from "@/services/plan-actuals/actuals.schemas"
import { pseudonymizeActuals } from "@/services/plan-actuals/actuals.service"

/**
 * Admins only (`canPseudonymizeActuals`, plan 12 §4 / Q8). Body { userId } (a retired user) or { snapshotId } (rows past
 * retention) → { updated }. Owners become role names; numbers never change; audited per project.
 */
export async function POST(request: Request) {
  const gate = await requireActualsPseudonymizer()
  if ("error" in gate) return gate.error

  try {
    const input = pseudonymizeSchema.parse(await request.json())
    return jsonResponse(await pseudonymizeActuals(input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "仮名化に失敗しました", context: "Admin actuals PSEUDONYMIZE" })
  }
}
