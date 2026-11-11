import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { deleteComment, resolveComment } from "@/services/boards/boards.collab"
import { resolveCommentSchema } from "@/services/boards/boards.collab.schemas"
import { readBoundedJson } from "@/services/boards/boards.http"

type Params = { params: Promise<{ projectId: string; boardId: string; commentId: string }> }

/** Marks a comment resolved or open again (board.write). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, boardId, commentId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error
  try {
    const { resolved } = resolveCommentSchema.parse(await readBoundedJson(request, 1024))
    return jsonResponse(await resolveComment(projectId, boardId, commentId, resolved, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "保存に失敗しました", context: "Board comment PATCH" })
  }
}

/** Deletes a comment (board.write): the author's own, or any when the person manages boards. */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, boardId, commentId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error
  try {
    await deleteComment(projectId, boardId, commentId, actorFromSession(gate.session), can(gate.actor, "board.manage"))
    return new Response(null, { status: 204 })
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Board comment DELETE" })
  }
}
