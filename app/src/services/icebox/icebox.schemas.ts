import { z } from "zod"

export const ICEBOX_STATUSES = ["unreviewed", "reviewed", "completed", "frozen"] as const

export const createIceboxItemSchema = z.object({
  request: z.string().min(1).max(5000),
  background: z.string().max(5000).optional(),
  author: z.string().max(200).optional(),
  assignedPo: z.string().max(200).optional(),
})

export const updateIceboxItemSchema = z.object({
  author: z.string().max(200).optional(),
  request: z.string().min(1).max(5000).optional(),
  background: z.string().max(5000).nullable().optional(),
  status: z.enum(ICEBOX_STATUSES).optional(),
  assignedPo: z.string().max(200).nullable().optional(),
  poHearingMemo: z.string().max(5000).nullable().optional(),
  poReviewMemo: z.string().max(5000).nullable().optional(),
  rejectionReason: z.string().max(5000).nullable().optional(),
  freezeReason: z.string().max(5000).nullable().optional(),
  policyDoc: z.string().max(10000).nullable().optional(),
  planningDoc: z.string().max(10000).nullable().optional(),
  pbEpic: z.string().max(500).nullable().optional(),
  poFlag: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export type CreateIceboxItemInput = z.infer<typeof createIceboxItemSchema>
export type UpdateIceboxItemInput = z.infer<typeof updateIceboxItemSchema>
