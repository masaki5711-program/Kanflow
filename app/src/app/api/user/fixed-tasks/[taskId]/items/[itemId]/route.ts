import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateFixedTaskSchema } from "@/services/fixed-tasks/fixed-tasks.schemas"
import { deleteItem, updateItem } from "@/services/fixed-tasks/fixed-tasks.service"

type Params = { params: Promise<{ taskId: string; itemId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId, itemId } = await params

  try {
    const input = updateFixedTaskSchema.parse(await request.json())
    return jsonResponse(await updateItem(gate.session.user.id, taskId, itemId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "FixedTaskItem PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId, itemId } = await params

  try {
    await deleteItem(gate.session.user.id, taskId, itemId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "FixedTaskItem DELETE" })
  }
}
