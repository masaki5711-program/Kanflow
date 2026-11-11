import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { sheetNameSchema } from "@/services/boards/boards.schemas"
import { duplicateSheet } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string; sheetId: string }> }

/** Copy a sheet with its elements; the copy goes right after it under the given name (board.write). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    const input = sheetNameSchema.parse(await request.json())
    return jsonResponse(await duplicateSheet(projectId, boardId, sheetId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "複製に失敗しました", context: "Board sheet duplicate POST" })
  }
}
