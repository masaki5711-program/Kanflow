import { can, forbiddenResponse, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateRolloutSchema } from "@/services/improvements/improvements.schemas"
import { removeRollout, updateRollout } from "@/services/improvements/improvements.rollouts"

type Params = { params: Promise<{ projectId: string; id: string; rolloutId: string }> }

/** Status: any member (improvement.track); renaming the target: PO (release.manage). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, id, rolloutId } = await params
  const gate = await requireProject(projectId, "improvement.track")
  if ("error" in gate) return gate.error

  try {
    const input = updateRolloutSchema.parse(await request.json())
    if (input.targetName !== undefined && !can(gate.actor, "release.manage")) return forbiddenResponse()
    return jsonResponse(await updateRollout(projectId, id, rolloutId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Improvement rollout PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, id, rolloutId } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    await removeRollout(projectId, id, rolloutId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Improvement rollout DELETE" })
  }
}
