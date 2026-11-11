import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { reorderSheetsSchema } from "@/services/boards/boards.schemas"
import { reorderSheets } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/** Set the tab order: every sheet id of the board, in the new order (board.write). */
export async function PUT(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    const input = reorderSheetsSchema.parse(await request.json())
    return jsonResponse(await reorderSheets(projectId, boardId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "並べ替えに失敗しました", context: "Board sheet order PUT" })
  }
}
