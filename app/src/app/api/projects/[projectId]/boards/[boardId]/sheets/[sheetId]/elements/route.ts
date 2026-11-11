import { requireProject } from "@/lib/authz"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { readBoundedJson } from "@/services/boards/boards.http"
import { sinceSchema, writeElementsSchema, type WriteElementsInput } from "@/services/boards/boards.schemas"
import { readElements, writeElements } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string; sheetId: string }> }

/**
 * The elements of a sheet (board.read): every live element, or with `?since=<rev>` only what was written
 * after that sheet revision (deleted elements included).
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error

  try {
    const raw = new URL(request.url).searchParams.get("since")
    const since = raw === null ? undefined : sinceSchema.parse(raw)
    return jsonResponse(await readElements(projectId, boardId, sheetId, since))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Board elements GET" })
  }
}

/**
 * Store changed elements (board.write). The client sends only what it changed; per element the higher
 * version stays, and the rows the server kept come back in `stale`. Body and element count are bounded.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    const body = await readBoundedJson(request, BOARD_LIMITS.writeBodyBytes)
    const input = writeElementsSchema.parse(body) as WriteElementsInput
    return jsonResponse(await writeElements(projectId, boardId, sheetId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "保存に失敗しました", context: "Board elements POST" })
  }
}
