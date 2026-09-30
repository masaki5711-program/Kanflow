import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateUserCategorySchema } from "@/services/user-categories/user-categories.schemas"
import { deleteUserCategory, updateUserCategory } from "@/services/user-categories/user-categories.service"

type Params = { params: Promise<{ categoryId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  try {
    const input = updateUserCategorySchema.parse(await request.json())
    return jsonResponse(await updateUserCategory(gate.session.user.id, categoryId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Category PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  try {
    await deleteUserCategory(gate.session.user.id, categoryId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Category DELETE" })
  }
}
