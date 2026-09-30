import { z } from "zod"

export const createUserCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().min(1).max(20),
})

export const updateUserCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().min(1).max(20).optional(),
  sortOrder: z.number().int().optional(),
})

export const assignCategorySchema = z.object({
  projectId: z.string().min(1),
})

export type CreateUserCategoryInput = z.infer<typeof createUserCategorySchema>
export type UpdateUserCategoryInput = z.infer<typeof updateUserCategorySchema>
