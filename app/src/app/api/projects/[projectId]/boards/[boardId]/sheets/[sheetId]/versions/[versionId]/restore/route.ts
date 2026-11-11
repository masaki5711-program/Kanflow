import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { restoreVersion } from "@/services/boards/boards.collab"

type Params = { params: Promise<{ projectId: string; boardId: string; sheetId: string; versionId: string }> }

/** Puts the sheet back to a saved version (board.write); the state before is kept as a version too. */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, boardId, sheetId, versionId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await restoreVersion(projectId, boardId, sheetId, versionId, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "元に戻せませんでした", context: "Board version restore" })
  }
}
