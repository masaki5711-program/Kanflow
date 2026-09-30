import { z } from "zod"
import { versionField } from "@/services/_shared/versioning"

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
  /** Source IceBox request ("" / null = unlink). */
  iceboxItemId: z.string().nullable().optional(),
  /** Optimistic lock: the version the client loaded (omitted = unchecked, legacy). */
  version: versionField,
})

export const reorderBacklogSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
})

/** Upper bound of PBIs one bulk request may touch. */
export const BULK_MAX_IDS = 200

const bulkIds = z.array(z.string().min(1).max(64)).min(1).max(BULK_MAX_IDS)

/**
 * POST /backlog/bulk. Each action has its own payload; the route checks the
 * action's permission (status / assignPo: backlog.write, trash: backlog.delete,
 * addToSprint: sprint.manage).
 */
export const bulkBacklogSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), ids: bulkIds, payload: z.object({ status: z.enum(PBI_STATUSES) }) }),
  z.object({ action: z.literal("assignPo"), ids: bulkIds, payload: z.object({ assignedPo: z.string().max(200).nullable() }) }),
  z.object({ action: z.literal("addToSprint"), ids: bulkIds, payload: z.object({ sprintId: z.string().min(1) }) }),
  z.object({ action: z.literal("trash"), ids: bulkIds, payload: z.object({}).optional() }),
])
export type BulkBacklogInput = z.infer<typeof bulkBacklogSchema>
export type BulkBacklogAction = BulkBacklogInput["action"]

export type CreateBacklogItemInput = z.infer<typeof createBacklogItemSchema>
export type UpdateBacklogItemInput = z.infer<typeof updateBacklogItemSchema>

export type PbiStatus = (typeof PBI_STATUSES)[number]

/** GET /backlog query: optional `?status=` filter (unknown values are rejected with 400). */
export const listBacklogQuerySchema = z.object({
  status: z.enum(PBI_STATUSES).optional(),
})
export type ListBacklogQuery = z.infer<typeof listBacklogQuerySchema>
