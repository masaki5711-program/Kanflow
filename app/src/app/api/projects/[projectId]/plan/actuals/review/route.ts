import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listReviewProposals } from "@/services/plan-actuals/actuals-review.service"

type Params = { params: Promise<{ projectId: string }> }

/** The AI review proposals of the current snapshot (PO / SM). → { snapshotId, job, proposals } */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.actualsReview")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listReviewProposals(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "AI の提案の取得に失敗しました", context: "Plan actuals review GET" })
  }
}
