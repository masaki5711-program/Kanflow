import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { finalizeSchema } from "@/services/plan-actuals/actuals.schemas"
import { finalizeActuals, listSnapshots, previewActuals } from "@/services/plan-actuals/actuals.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * 実績を確定 screen: what would be frozen now (issues), the snapshots so far, and whether the viewer may finalize and
 * decide the AI review proposals.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const [preview, snapshots] = await Promise.all([previewActuals(projectId), listSnapshots(projectId)])
    const finalize = can(gate.actor, "plan.actualsFinalize")
    // Repository paths go to those who act on them (PO / SM); others see that a repository could not be read.
    const issues = finalize ? preview.issues : preview.issues.map((i) => (i.kind === "repository_unreadable" ? { ...i, repositoryRef: "" } : i))
    return jsonResponse({ preview: { ...preview, issues }, snapshots, permissions: { finalize, review: can(gate.actor, "plan.actualsReview") } })
  } catch (error) {
    return toHttpResponse(error, { fallback: "実績の取得に失敗しました", context: "Plan actuals GET" })
  }
}

/**
 * Body { acknowledgedIssueCount? } — the number of items to check the finalizer was shown → the new current snapshot
 * (201). 400 PLAN_ACTUALS_INCOMPLETE { issues } when it does not match what is found now.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.actualsFinalize")
  if ("error" in gate) return gate.error

  try {
    const text = await request.text()
    const input = finalizeSchema.parse(text.trim() ? JSON.parse(text) : {})
    return jsonResponse(await finalizeActuals(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "実績の確定に失敗しました", context: "Plan actuals FINALIZE" })
  }
}
