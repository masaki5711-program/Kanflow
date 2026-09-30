import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateDailyScrumSchema } from "@/services/daily-scrums/daily-scrums.schemas"
import { deleteNote, updateNote } from "@/services/daily-scrums/daily-scrums.service"

type Params = { params: Promise<{ projectId: string; sprintId: string; noteId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, sprintId, noteId } = await params
  const gate = await requireProject(projectId, "dailyScrum.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateDailyScrumSchema.parse(await request.json())
    return jsonResponse(await updateNote(projectId, sprintId, noteId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "DailyScrum PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, sprintId, noteId } = await params
  const gate = await requireProject(projectId, "dailyScrum.write")
  if ("error" in gate) return gate.error

  try {
    await deleteNote(projectId, sprintId, noteId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "DailyScrum DELETE" })
  }
}
