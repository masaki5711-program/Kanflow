import { z } from "zod"

export const PBI_STATUSES = ["ready", "not_ready", "completed"] as const

export const createBacklogItemSchema = z.object({
  initiative: z.string().max(500).optional(),
  epic: z.string().max(500).optional(),
  userStory: z.string().optional(),
  acceptanceCriteria: z.string().max(5000).optional(),
  referenceDoc: z.string().max(10000).optional(),
  workloadScore: z.number().int().min(0).optional(),
  status: z.enum(PBI_STATUSES).optional(),
  iceboxItemId: z.string().optional(),
  productGoalId: z.string().nullable().optional(),
  assignedPo: z.string().max(200).optional(),
  poNote: z.string().max(5000).optional(),
  notReadyReason: z.string().max(5000).optional(),
})

export const updateBacklogItemSchema = z.object({
  initiative: z.string().optional(),
  epic: z.string().optional(),
  userStory: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  referenceDoc: z.string().optional(),
  workloadScore: z.number().int().min(0).optional(),
  assignedPo: z.string().optional(),
  poNote: z.string().optional(),
  status: z.enum(PBI_STATUSES).optional(),
  notReadyReason: z.string().optional(),
  sortOrder: z.number().int().optional(),
  productGoalId: z.string().nullable().optional(),
})

export const reorderBacklogSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
})

export type CreateBacklogItemInput = z.infer<typeof createBacklogItemSchema>
export type UpdateBacklogItemInput = z.infer<typeof updateBacklogItemSchema>
