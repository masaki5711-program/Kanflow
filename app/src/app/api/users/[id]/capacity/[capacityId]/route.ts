import { requireUserCapacityManager } from "@/lib/authz/require-user-capacity"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { capacityUpdateSchema, versionSchema } from "@/services/plan-leveling/capacity.schemas"
import { deleteCapacity, updateCapacity } from "@/services/plan-leveling/capacity.service"

type Params = { params: Promise<{ id: string; capacityId: string }> }

/** Body { from, to?, fte, version } → the period. Only the person's own-FTE rows are reachable here. */
export async function PATCH(request: Request, { params }: Params) {
  const { id, capacityId } = await params
  const gate = await requireUserCapacityManager(id)
  if ("error" in gate) return gate.error
  try {
    const input = capacityUpdateSchema.parse(await request.json())
    return jsonResponse(await updateCapacity(capacityId, { userId: id, projectId: null }, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の保存に失敗しました", context: "User capacity UPDATE" })
  }
}

/** Body { version } → { deleted }. */
export async function DELETE(request: Request, { params }: Params) {
  const { id, capacityId } = await params
  const gate = await requireUserCapacityManager(id)
  if ("error" in gate) return gate.error
  try {
    const { version } = versionSchema.parse(await request.json())
    return jsonResponse(await deleteCapacity(capacityId, { userId: id, projectId: null }, version, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の削除に失敗しました", context: "User capacity DELETE" })
  }
}
