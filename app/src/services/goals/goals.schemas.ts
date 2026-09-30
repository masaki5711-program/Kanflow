import { z } from "zod"

export const createGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
})

export const updateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
})

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
