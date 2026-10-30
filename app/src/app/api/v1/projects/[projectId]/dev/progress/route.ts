import { postProgressOp } from "../../../../_lib/v1-dev-handlers"
import { v1ProjectWrite } from "../../../../_lib/v1-write"

/** POST /api/v1/projects/:projectId/dev/progress `{ entityType: pbi | sprint_task, entityId, body }` (`dev:write`; members). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>("dev.write", 201, postProgressOp, { idempotent: true })
