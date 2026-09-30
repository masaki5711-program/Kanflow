import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createTaskSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { createTask } from "@/services/sprint-backlog/sprint-backlog.service"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "task.write")
  if ("error" in gate) return gate.error

  try {
    const input = createTaskSchema.parse(await request.json())
    return jsonResponse(await createTask(projectId, sprintId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Sprint task CREATE" })
  }
}
