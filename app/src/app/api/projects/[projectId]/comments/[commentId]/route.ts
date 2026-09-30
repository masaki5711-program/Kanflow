import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateCommentSchema } from "@/services/comments/comments.schemas"
import { deleteComment, updateComment } from "@/services/comments/comments.service"

type Params = { params: Promise<{ projectId: string; commentId: string }> }

/** Author only (403 otherwise): `{ body }` → CommentDto. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, commentId } = await params
  const gate = await requireProject(projectId, "comment.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateCommentSchema.parse(await request.json())
    const actor = actorFromSession(gate.session)
    return jsonResponse(await updateComment(projectId, commentId, input, actor, can(gate.actor, "comment.moderate")))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Comment PATCH" })
  }
}

/** Author, or `comment.moderate` for anyone's comment (soft delete) → `{ success: true }`. */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, commentId } = await params
  const gate = await requireProject(projectId, "comment.write")
  if ("error" in gate) return gate.error

  try {
    await deleteComment(projectId, commentId, actorFromSession(gate.session), can(gate.actor, "comment.moderate"))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Comment DELETE" })
  }
}
