import { listSprints } from "@/services/api-v1/api-v1.service"
import { createSprintOp } from "../../../_lib/v1-handlers"
import { v1ProjectRoute } from "../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../_lib/v1-write"

/** GET /api/v1/projects/:projectId/sprints — newest first. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId }) => listSprints(projectId))

/** POST /api/v1/projects/:projectId/sprints — create a sprint (`sprint:write`; PO / SM). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>("sprint.manage", 201, createSprintOp, { idempotent: true })
