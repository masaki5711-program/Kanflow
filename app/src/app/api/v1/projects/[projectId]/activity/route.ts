import { v1ActivityQuerySchema } from "@/services/api-v1/api-v1.schemas"
import { listActivity } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../_lib/v1-route"

/** GET /api/v1/projects/:projectId/activity?cursor&limit&entityType — newest first, cursor-paginated. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId, query }) =>
  listActivity(projectId, v1ActivityQuerySchema.parse(query))
)
