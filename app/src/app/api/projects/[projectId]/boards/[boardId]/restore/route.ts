import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { restoreBoard } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/** Take a board out of the trash (board.manage). */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.manage")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await restoreBoard(projectId, boardId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "復元に失敗しました", context: "Board restore POST" })
  }
}
