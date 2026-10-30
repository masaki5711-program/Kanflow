import { createSprintSchema } from "@/services/sprints/sprints.schemas"
import { createSprint } from "@/services/sprints/sprints.service"
import { listSprints } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../_lib/v1-write"

/** GET /api/v1/projects/:projectId/sprints — newest first. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId }) => listSprints(projectId))

/** POST /api/v1/projects/:projectId/sprints — create a sprint (`sprint:write`; PO / SM). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>(
  "sprint.manage",
  201,
  async ({ projectId, body, serviceActor }) => ({
    data: await createSprint(projectId, createSprintSchema.parse(body), serviceActor),
  }),
  { idempotent: true }
)
