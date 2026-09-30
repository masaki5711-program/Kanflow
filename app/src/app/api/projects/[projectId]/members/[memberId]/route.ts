import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateMemberSchema } from "@/services/members/members.schemas"
import { changeMemberRole, removeMember } from "@/services/members/members.service"

type Params = { params: Promise<{ projectId: string; memberId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, memberId } = await params
  const gate = await requireProject(projectId, "member.manage")
  if ("error" in gate) return gate.error

  try {
    const { role } = updateMemberSchema.parse(await request.json())
    return jsonResponse(await changeMemberRole(projectId, memberId, role, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Member PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, memberId } = await params
  const gate = await requireProject(projectId, "member.manage")
  if ("error" in gate) return gate.error

  try {
    await removeMember(projectId, memberId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Member DELETE" })
  }
}
