import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updatePunchSchema } from "@/services/milestones/milestones.schemas"
import { deletePunch, updatePunch } from "@/services/milestones/milestones.punch"

type Params = { params: Promise<{ projectId: string; punchId: string }> }

/** Edit / work a 残課題 (status, assignee, due day …): any member (milestone.track). Delete: plan.write. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, punchId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const input = updatePunchSchema.parse(await request.json())
    return jsonResponse(await updatePunch(projectId, punchId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone punch PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, punchId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    await deletePunch(projectId, punchId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Milestone punch DELETE" })
  }
}
