import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getVersion } from "@/services/boards/boards.collab"

type Params = { params: Promise<{ projectId: string; boardId: string; sheetId: string; versionId: string }> }

/** One saved version with its elements, to look at before restoring it (board.read). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, boardId, sheetId, versionId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getVersion(projectId, boardId, sheetId, versionId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Board version GET" })
  }
}
