import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateFixedTaskSchema } from "@/services/fixed-tasks/fixed-tasks.schemas"
import { deleteGroup, updateGroup } from "@/services/fixed-tasks/fixed-tasks.service"

type Params = { params: Promise<{ taskId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId } = await params

  try {
    const input = updateFixedTaskSchema.parse(await request.json())
    return jsonResponse(await updateGroup(gate.session.user.id, taskId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "FixedTask PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId } = await params

  try {
    await deleteGroup(gate.session.user.id, taskId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "FixedTask DELETE" })
  }
}
