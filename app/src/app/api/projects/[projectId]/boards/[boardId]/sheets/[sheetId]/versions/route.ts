import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { listVersions, saveVersion } from "@/services/boards/boards.collab"
import { saveVersionSchema } from "@/services/boards/boards.collab.schemas"
import { readBoundedJson } from "@/services/boards/boards.http"

type Params = { params: Promise<{ projectId: string; boardId: string; sheetId: string }> }

/** The sheet's saved versions, newest first (board.read): who saved each and when, without their content. */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await listVersions(projectId, boardId, sheetId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Board versions GET" })
  }
}

/** Saves the sheet now under a name (board.write). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error
  try {
    const input = saveVersionSchema.parse(await readBoundedJson(request, 4 * 1024))
    return jsonResponse(await saveVersion(projectId, boardId, sheetId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "保存に失敗しました", context: "Board versions POST" })
  }
}
