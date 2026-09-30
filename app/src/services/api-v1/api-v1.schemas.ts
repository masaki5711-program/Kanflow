import { z } from "zod"
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "@/services/_shared/cursor"
import { PBI_STATUSES } from "@/services/backlog/backlog.schemas"

export { projectActivityQuerySchema as v1ActivityQuerySchema } from "@/services/activity/activity.schemas"

const cursor = z.string().min(1).max(512).optional()
const limit = z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT)

/** GET /api/v1/projects?status=active|archived (default active). */
export const v1ProjectsQuerySchema = z.object({
  status: z.enum(["active", "archived"]).default("active"),
})

/** GET /api/v1/projects/:id/backlog?status&cursor&limit */
export const v1BacklogQuerySchema = z.object({
  status: z.enum(PBI_STATUSES).optional(),
  cursor,
  limit,
})

export type V1ProjectsQuery = z.infer<typeof v1ProjectsQuerySchema>
export type V1BacklogQuery = z.infer<typeof v1BacklogQuerySchema>
