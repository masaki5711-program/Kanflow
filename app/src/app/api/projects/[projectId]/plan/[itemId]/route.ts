import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { parseVersionParam } from "@/services/_shared/versioning"
import { updatePlanItemSchema } from "@/services/plan/plan.schemas"
import { deletePlanItem, updatePlanItem } from "@/services/plan/plan.service"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

/** Body: any create field + actualStart / actualEnd + `version` (optimistic lock) → PlanItemDto. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = updatePlanItemSchema.parse(await request.json())
    return jsonResponse(await updatePlanItem(projectId, itemId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "PlanItem PATCH" })
  }
}

/** Moves the item and its subtree to the trash. `?version=N` (optional) = optimistic lock. → { success, deletedCount } */
export async function DELETE(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const { deletedCount } = await deletePlanItem(projectId, itemId, actorFromSession(gate.session), parseVersionParam(request))
    return jsonResponse({ success: true, deletedCount })
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "PlanItem DELETE" })
  }
}
