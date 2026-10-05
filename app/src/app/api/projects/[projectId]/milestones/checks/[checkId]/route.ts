import { can, forbiddenResponse, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { CHECK_STRUCTURE_FIELDS, touchesAny, updateCheckSchema } from "@/services/milestones/milestones.schemas"
import { deleteCheck, updateCheck } from "@/services/milestones/milestones.checks"

type Params = { params: Promise<{ projectId: string; checkId: string }> }

/** Result / 立会者 / day / note: any member (milestone.track); name, criterion, stage and order also need plan.write (403). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, checkId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const input = updateCheckSchema.parse(await request.json())
    if (touchesAny(input, CHECK_STRUCTURE_FIELDS) && !can(gate.actor, "plan.write")) return forbiddenResponse()
    return jsonResponse(await updateCheck(projectId, checkId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone check PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, checkId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    await deleteCheck(projectId, checkId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Milestone check DELETE" })
  }
}
