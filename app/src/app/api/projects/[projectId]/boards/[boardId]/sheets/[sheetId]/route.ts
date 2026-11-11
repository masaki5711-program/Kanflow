import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { sheetNameSchema } from "@/services/boards/boards.schemas"
import { deleteSheet, renameSheet } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string; sheetId: string }> }

/** Rename a sheet (board.write). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    const input = sheetNameSchema.parse(await request.json())
    return jsonResponse(await renameSheet(projectId, boardId, sheetId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Board sheet PATCH" })
  }
}

/**
 * Delete a sheet with its elements, permanently (board.write: whoever may draw can already erase every
 * element). The last sheet of a board cannot be deleted (409 BOARD_LAST_SHEET).
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await deleteSheet(projectId, boardId, sheetId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Board sheet DELETE" })
  }
}
