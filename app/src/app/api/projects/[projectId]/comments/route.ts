import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { createCommentSchema, listCommentsQuerySchema } from "@/services/comments/comments.schemas"
import { createComment, listComments } from "@/services/comments/comments.service"

type Params = { params: Promise<{ projectId: string }> }

/** Thread of one entity, oldest first: `?entityType=pbi|sprint_task|icebox&entityId=&cursor=&limit=` → `{ items, nextCursor }`. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const query = listCommentsQuerySchema.parse(searchParamsObject(request.url))
    const viewer = { userId: gate.actor.userId, canModerate: can(gate.actor, "comment.moderate") }
    return jsonResponse(await listComments(projectId, query, viewer))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Comment LIST" })
  }
}

/** `{ entityType, entityId, body }` → 201 CommentDto. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "comment.write")
  if ("error" in gate) return gate.error

  try {
    const input = createCommentSchema.parse(await request.json())
    const actor = actorFromSession(gate.session)
    return jsonResponse(await createComment(projectId, input, actor, can(gate.actor, "comment.moderate")), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Comment CREATE" })
  }
}
