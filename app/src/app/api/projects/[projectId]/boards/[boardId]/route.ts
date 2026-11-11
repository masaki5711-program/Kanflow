import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateBoardSchema } from "@/services/boards/boards.schemas"
import { deleteBoard, getBoard, renameBoard } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/** A board with its sheets in tab order (board.read); `permissions` are UI hints only. */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error

  try {
    const board = await getBoard(projectId, boardId)
    const permissions = { canWrite: can(gate.actor, "board.write"), canManage: can(gate.actor, "board.manage") }
    return jsonResponse({ ...board, permissions })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Board GET" })
  }
}

/** Rename (board.write). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateBoardSchema.parse(await request.json())
    return jsonResponse(await renameBoard(projectId, boardId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Board PATCH" })
  }
}

/** Move to the trash (board.manage). */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.manage")
  if ("error" in gate) return gate.error

  try {
    await deleteBoard(projectId, boardId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Board DELETE" })
  }
}
