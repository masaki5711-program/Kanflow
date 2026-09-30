import { listSprintTasks } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../../../_lib/v1-route"

/** GET /api/v1/projects/:projectId/sprints/:sprintId/tasks */
export const GET = v1ProjectRoute<{ projectId: string; sprintId: string }>(async ({ projectId, params }) =>
  listSprintTasks(projectId, params.sprintId)
)
