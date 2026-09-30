import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { addMemberSchema } from "@/services/members/members.schemas"
import { addMember, addMembersBulk, listMembers } from "@/services/members/members.service"

type Params = { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listMembers(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Member LIST" })
  }
}

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "member.manage")
  if ("error" in gate) return gate.error

  try {
    const data = addMemberSchema.parse(await request.json())
    if (data.userIds && data.userIds.length > 0) {
      const result = await addMembersBulk(projectId, data.userIds, data.role, actorFromSession(gate.session))
      return jsonResponse(result, result.added === 0 ? 200 : 201)
    }
    const member = await addMember(projectId, { userId: data.userId, email: data.email }, data.role, actorFromSession(gate.session))
    return jsonResponse(member, 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "追加に失敗しました", context: "Member CREATE" })
  }
}
