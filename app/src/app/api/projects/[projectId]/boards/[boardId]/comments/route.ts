import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createComment, listComments } from "@/services/boards/boards.collab"
import { createCommentSchema } from "@/services/boards/boards.collab.schemas"
import { readBoundedJson } from "@/services/boards/boards.http"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/** The board's comments, oldest first (board.read). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await listComments(projectId, boardId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Board comments GET" })
  }
}

/** Adds a comment on a sheet or one of its elements (board.write); @mentioned members are notified. */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error
  try {
    const input = createCommentSchema.parse(await readBoundedJson(request, 16 * 1024))
    return jsonResponse(await createComment(projectId, boardId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "保存に失敗しました", context: "Board comments POST" })
  }
}
