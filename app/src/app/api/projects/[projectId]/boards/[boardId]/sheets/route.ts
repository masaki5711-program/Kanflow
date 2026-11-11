import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { sheetNameSchema } from "@/services/boards/boards.schemas"
import { addSheet } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/** Add an empty sheet at the end (board.write). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    const input = sheetNameSchema.parse(await request.json())
    return jsonResponse(await addSheet(projectId, boardId, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "追加に失敗しました", context: "Board sheet POST" })
  }
}
