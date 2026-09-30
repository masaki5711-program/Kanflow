import { z } from "zod"
import { ACTIVITY_ENTITY_TYPES } from "@/services/_shared/activity"
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "@/services/_shared/cursor"

const pageFields = {
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
}

/** GET /api/projects/:id/activity?cursor&limit&entityType */
export const projectActivityQuerySchema = z.object({
  ...pageFields,
  entityType: z.enum(ACTIVITY_ENTITY_TYPES).optional(),
})

/** GET /api/projects/:id/activity/:entityType/:entityId?cursor&limit and GET /api/user/activity */
export const pageQuerySchema = z.object(pageFields)

export const entityRefSchema = z.object({
  entityType: z.enum(ACTIVITY_ENTITY_TYPES),
  entityId: z.string().min(1).max(191),
})

export type ProjectActivityQuery = z.infer<typeof projectActivityQuerySchema>
export type PageQuery = z.infer<typeof pageQuerySchema>
export type EntityRef = z.infer<typeof entityRefSchema>
