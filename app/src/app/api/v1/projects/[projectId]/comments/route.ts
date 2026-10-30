import { createCommentOp, listCommentsOp } from "../../../_lib/v1-handlers"
import { v1ProjectRoute } from "../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../_lib/v1-write"

/** GET /api/v1/projects/:projectId/comments?entityType=pbi|sprint_task|icebox&entityId=&cursor=&limit= — one thread, oldest first. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId, query, actor }) => listCommentsOp(projectId, actor, query))

/** POST /api/v1/projects/:projectId/comments `{ entityType, entityId, body }` (`comment:write`; members). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>("comment.write", 201, createCommentOp, { idempotent: true })
