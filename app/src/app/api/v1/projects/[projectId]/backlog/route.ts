import { v1BacklogQuerySchema } from "@/services/api-v1/api-v1.schemas"
import { listBacklog } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../_lib/v1-route"

/** GET /api/v1/projects/:projectId/backlog?status&cursor&limit — PBIs, oldest first, cursor-paginated. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId, query }) =>
  listBacklog(projectId, v1BacklogQuerySchema.parse(query))
)
