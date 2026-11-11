import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { boardsOfPbi } from "@/services/boards/boards.collab"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

/** The White Boards (sheet, box) that stand for this backlog item (board.read): shown in the item's detail. */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await boardsOfPbi(projectId, itemId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PBI boards GET" })
  }
}
