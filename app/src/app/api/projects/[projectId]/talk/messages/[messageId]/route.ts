import { can, requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deleteMessage } from "@/services/team-chat/team-chat.service"

type Params = { params: Promise<{ projectId: string; messageId: string }> }

/** Author or moderator; mirrored comments are deleted in their own thread. */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, messageId } = await params
  const gate = await requireProject(projectId, "comment.write")
  if ("error" in gate) return gate.error

  try {
    await deleteMessage(projectId, messageId, actorFromSession(gate.session), can(gate.actor, "comment.moderate"))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Team chat DELETE" })
  }
}
