import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { capacityUpdateSchema, versionSchema } from "@/services/plan-leveling/capacity.schemas"
import { deleteCapacity, updateCapacity } from "@/services/plan-leveling/capacity.service"

type Params = { params: Promise<{ projectId: string; capacityId: string }> }

/** Body { from, to?, fte, version } → the allocation. Only rows of THIS project are reachable (others are 404). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, capacityId } = await params
  const gate = await requireProject(projectId, "capacity.manage")
  if ("error" in gate) return gate.error
  try {
    const input = capacityUpdateSchema.parse(await request.json())
    return jsonResponse(await updateCapacity(capacityId, { projectId }, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の保存に失敗しました", context: "Project capacity UPDATE" })
  }
}

/** Body { version } → { deleted }. */
export async function DELETE(request: Request, { params }: Params) {
  const { projectId, capacityId } = await params
  const gate = await requireProject(projectId, "capacity.manage")
  if ("error" in gate) return gate.error
  try {
    const { version } = versionSchema.parse(await request.json())
    return jsonResponse(await deleteCapacity(capacityId, { projectId }, version, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の削除に失敗しました", context: "Project capacity DELETE" })
  }
}
