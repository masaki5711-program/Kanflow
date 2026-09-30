import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createFixedTaskSchema } from "@/services/fixed-tasks/fixed-tasks.schemas"
import { createGroup, listGroups } from "@/services/fixed-tasks/fixed-tasks.service"

export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listGroups(gate.session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "FixedTask LIST" })
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const input = createFixedTaskSchema.parse(await request.json())
    return jsonResponse(await createGroup(gate.session.user.id, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "FixedTask CREATE" })
  }
}
