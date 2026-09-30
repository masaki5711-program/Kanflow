import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createFixedTaskSchema } from "@/services/fixed-tasks/fixed-tasks.schemas"
import { createItem } from "@/services/fixed-tasks/fixed-tasks.service"

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId } = await params

  try {
    const input = createFixedTaskSchema.parse(await request.json())
    return jsonResponse(await createItem(gate.session.user.id, taskId, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "FixedTaskItem CREATE" })
  }
}
