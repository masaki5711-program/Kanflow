import { listPlan } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../_lib/v1-route"

/** GET /api/v1/projects/:projectId/plan — master-plan items (flat; tree via parentId). */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId }) => listPlan(projectId))
