import { z } from "zod"

export const PLAN_STATUSES = ["not_started", "in_progress", "done", "on_hold", "delayed"] as const

export const createPlanItemSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().nullable().optional(),
  plannedStart: z.string(),
  plannedEnd: z.string(),
  isMilestone: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  status: z.enum(PLAN_STATUSES).optional(),
  description: z.string().max(10000).nullable().optional(),
})

export const updatePlanItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().nullable().optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  actualStart: z.string().nullable().optional(),
  actualEnd: z.string().nullable().optional(),
  isMilestone: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  status: z.enum(PLAN_STATUSES).optional(),
  sortOrder: z.number().int().optional(),
  description: z.string().max(10000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
})

export const reorderPlanSchema = z.object({
  updates: z
    .array(z.object({ id: z.string(), parentId: z.string().nullable(), sortOrder: z.number().int() }))
    .min(1)
    .max(2000),
})

export type CreatePlanItemInput = z.infer<typeof createPlanItemSchema>
export type UpdatePlanItemInput = z.infer<typeof updatePlanItemSchema>
export type PlanReorderUpdate = z.infer<typeof reorderPlanSchema>["updates"][number]
