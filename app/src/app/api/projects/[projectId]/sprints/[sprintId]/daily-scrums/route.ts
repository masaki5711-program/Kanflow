import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createDailyScrumSchema } from "@/services/daily-scrums/daily-scrums.schemas"
import { createNote, listNotes } from "@/services/daily-scrums/daily-scrums.service"

type Params = { params: Promise<{ projectId: string; sprintId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listNotes(projectId, sprintId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "DailyScrum LIST" })
  }
}

export async function POST(request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "dailyScrum.write")
  if ("error" in gate) return gate.error

  try {
    const input = createDailyScrumSchema.parse(await request.json())
    return jsonResponse(await createNote(projectId, sprintId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "DailyScrum CREATE" })
  }
}
