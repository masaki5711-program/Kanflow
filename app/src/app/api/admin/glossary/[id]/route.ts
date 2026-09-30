import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateGlossarySchema } from "@/services/glossary/glossary.schemas"
import { deleteTerm, updateTerm } from "@/services/glossary/glossary.service"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error
  const { id } = await params
  try {
    const input = updateGlossarySchema.parse(await request.json())
    return jsonResponse(await updateTerm(id, input, auth.session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Glossary PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error
  const { id } = await params
  try {
    await deleteTerm(id)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Glossary DELETE" })
  }
}
