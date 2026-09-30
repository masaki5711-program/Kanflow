import { z } from "zod"

/** Used for both groups (UserFixedTask) and their items. */
export const createFixedTaskSchema = z.object({
  taskName: z.string().min(1).max(200),
})

export const updateFixedTaskSchema = z.object({
  taskName: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
})

export type CreateFixedTaskInput = z.infer<typeof createFixedTaskSchema>
export type UpdateFixedTaskInput = z.infer<typeof updateFixedTaskSchema>
