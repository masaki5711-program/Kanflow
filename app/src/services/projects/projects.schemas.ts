import { z } from "zod"

export const PROJECT_TYPES = ["software", "process_improvement", "equipment", "general"] as const
export const CARD_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "indigo", "purple", "pink"] as const

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  projectType: z.enum(PROJECT_TYPES).optional(),
  sectionIds: z.array(z.string()).optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  defaultCapacity: z.number().int().min(0).optional(),
  sprintDurationDays: z.number().int().min(1).max(56).optional(),
  pointUnit: z.string().min(1).max(50).optional(),
  pointDescription: z.string().max(200).optional(),
  language: z.enum(["ja", "en", "id"]).optional(),
  projectType: z.enum(PROJECT_TYPES).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  cardColor: z.enum(CARD_COLORS).nullable().optional(),
  /** Replace the project's section assignments (PO / admin only). */
  sectionIds: z.array(z.string()).optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
