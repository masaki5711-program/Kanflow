import { createBacklogItemSchema } from "@/services/backlog/backlog.schemas"
import { createBacklogItem } from "@/services/backlog/backlog.service"
import { v1BacklogQuerySchema } from "@/services/api-v1/api-v1.schemas"
import { listBacklog } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../_lib/v1-write"

/** GET /api/v1/projects/:projectId/backlog?status&cursor&limit — PBIs, oldest first, cursor-paginated. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId, query }) =>
  listBacklog(projectId, v1BacklogQuerySchema.parse(query))
)

/** POST /api/v1/projects/:projectId/backlog — create a PBI (`backlog:write`; PO / SM). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>(
  "backlog.write",
  201,
  async ({ projectId, body, serviceActor }) => ({
    data: await createBacklogItem(projectId, createBacklogItemSchema.parse(body), serviceActor),
  }),
  { idempotent: true }
)
