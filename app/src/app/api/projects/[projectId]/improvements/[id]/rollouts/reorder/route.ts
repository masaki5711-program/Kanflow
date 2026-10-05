import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { reorderRolloutsSchema } from "@/services/improvements/improvements.schemas"
import { reorderRollouts } from "@/services/improvements/improvements.rollouts"

type Params = { params: Promise<{ projectId: string; id: string }> }

/** `{ orderedIds }` = every rollout id of the item in the new order (PO: release.manage). */
export async function PUT(request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = reorderRolloutsSchema.parse(await request.json())
    return jsonResponse(await reorderRollouts(projectId, id, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "並べ替えに失敗しました", context: "Improvement rollout reorder" })
  }
}
