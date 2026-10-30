import { can } from "@/lib/authz"
import { createCommentSchema, listCommentsQuerySchema } from "@/services/comments/comments.schemas"
import { createComment, listComments } from "@/services/comments/comments.service"
import { v1ProjectRoute } from "../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../_lib/v1-write"

/** GET /api/v1/projects/:projectId/comments?entityType=pbi|sprint_task|icebox&entityId=&cursor=&limit= — one thread, oldest first. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId, query, actor }) => {
  const page = await listComments(projectId, listCommentsQuerySchema.parse(query), {
    userId: actor.userId,
    canModerate: can(actor, "comment.moderate"),
  })
  return { data: page.items, nextCursor: page.nextCursor }
})

/** POST /api/v1/projects/:projectId/comments `{ entityType, entityId, body }` (`comment:write`; members). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>(
  "comment.write",
  201,
  async ({ projectId, body, serviceActor, actor }) => ({
    data: await createComment(projectId, createCommentSchema.parse(body), serviceActor, can(actor, "comment.moderate")),
  }),
  { idempotent: true }
)
