import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listSharedAndRequested } from "@/services/plan-lesson-rules/lesson-rules.service"
import { requireLineageRuleConfirmer } from "@/lib/authz/require-lineage-rule"

/** Shared lesson rules and pending promotion requests across projects (admins). → { rules } */
export async function GET() {
  const gate = await requireLineageRuleConfirmer()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse({ rules: await listSharedAndRequested() })
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の取得に失敗しました", context: "Admin lesson rules LIST" })
  }
}
