import { z } from "zod"

export const createDailyScrumSchema = z.object({
  date: z.string().min(1), // YYYY-MM-DD or ISO
  content: z.string().min(1).max(20000),
})

export const updateDailyScrumSchema = z.object({
  date: z.string().min(1).optional(),
  content: z.string().min(1).max(20000).optional(),
  archived: z.boolean().optional(),
})

export type CreateDailyScrumInput = z.infer<typeof createDailyScrumSchema>
export type UpdateDailyScrumInput = z.infer<typeof updateDailyScrumSchema>
