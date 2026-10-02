import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getChatSummary, markChatRead } from "@/services/team-chat/team-chat.service"

type Params = { params: Promise<{ projectId: string }> }

/** `{ unread, forYou, lastReadAt }` for the viewer (sidebar badge). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getChatSummary(gate.session.user.id, projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Team chat SUMMARY" })
  }
}

/** The viewer has read the chat up to now. */
export async function POST(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await markChatRead(gate.session.user.id, projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Team chat READ" })
  }
}
