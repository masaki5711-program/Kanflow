import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createSprintSchema } from "@/services/sprints/sprints.schemas"
import { createSprint, listSprints } from "@/services/sprints/sprints.service"

type Params = { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listSprints(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Sprint LIST" })
  }
}

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "sprint.manage")
  if ("error" in gate) return gate.error

  try {
    const input = createSprintSchema.parse(await request.json())
    return jsonResponse(await createSprint(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Sprint CREATE" })
  }
}
