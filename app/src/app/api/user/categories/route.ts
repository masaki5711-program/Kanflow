import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createUserCategorySchema } from "@/services/user-categories/user-categories.schemas"
import { createUserCategory, listUserCategories } from "@/services/user-categories/user-categories.service"

export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listUserCategories(gate.session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Category LIST" })
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const input = createUserCategorySchema.parse(await request.json())
    return jsonResponse(await createUserCategory(gate.session.user.id, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Category CREATE" })
  }
}
