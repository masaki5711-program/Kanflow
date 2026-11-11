import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { pbiSummaries, searchPbis } from "@/services/boards/boards.collab"
import { pbiIdsSchema } from "@/services/boards/boards.collab.schemas"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/**
 * The backlog items (PBIs) the board's boxes stand for, read live (board.read): `?ids=a,b`. With `?q=` (board.write):
 * the project's items matching a number or words, to link a box to.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const url = new URL(request.url)
  const query = url.searchParams.get("q")
  const gate = await requireProject(projectId, query === null ? "board.read" : "board.write")
  if ("error" in gate) return gate.error
  try {
    if (query !== null) return jsonResponse(await searchPbis(projectId, query))
    return jsonResponse(await pbiSummaries(projectId, boardId, pbiIdsSchema.parse(url.searchParams.get("ids") ?? "")))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Board PBIs GET" })
  }
}
