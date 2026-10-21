import { z } from "zod"
import { versionField } from "@/services/_shared/versioning"

export const SPRINT_STATUSES = ["planning", "active", "review", "done", "archived"] as const

export const createSprintSchema = z.object({
  sprintName: z.string().min(1).max(200),
  startDate: z.string(),
  endDate: z.string(),
  sprintGoal: z.string().max(5000).optional(),
  capacity: z.number().int().min(0).optional(),
  selectedPbIds: z.array(z.string()).optional(),
  /**
   * Unfinished work of an earlier sprint to continue in the new one: its open
   * tasks of these PBIs are copied (the earlier sprint keeps its own record).
   */
  carryOver: z.object({
    fromSprintId: z.string().min(1),
    pbItemIds: z.array(z.string()).max(500),
  }).optional(),
})

export const updateSprintSchema = z.object({
  sprintName: z.string().min(1).max(200).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sprintGoal: z.string().max(5000).nullable().optional(),
  capacity: z.number().int().min(0).optional(),
  status: z.enum(SPRINT_STATUSES).optional(),
  reviewComment: z.string().max(10000).nullable().optional(),
  retrospectiveMemo: z.string().max(10000).nullable().optional(),
  retrospectiveKeep: z.string().max(10000).nullable().optional(),
  retrospectiveProblem: z.string().max(10000).nullable().optional(),
  retrospectiveTry: z.string().max(10000).nullable().optional(),
  /** Optimistic lock: the version the client loaded (omitted = unchecked, legacy). */
  version: versionField,
})

export type CreateSprintInput = z.infer<typeof createSprintSchema>
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>
