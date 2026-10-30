import { v1ProjectsQuerySchema } from "@/services/api-v1/api-v1.schemas"
import { listProjects } from "@/services/api-v1/api-v1.service"
import { v1Route } from "../_lib/v1-route"

/** GET /api/v1/projects?status=active|archived — projects the token owner can access. */
export const GET = v1Route(async ({ principal, query }) =>
  listProjects({ id: principal.userId, role: principal.role }, v1ProjectsQuerySchema.parse(query), principal.projectIds)
)
