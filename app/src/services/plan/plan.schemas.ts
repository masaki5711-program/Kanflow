import { z } from "zod"
import { PLAN_STATUSES, PROGRESS_MODES } from "@/lib/plan-progress"
import { versionField } from "@/services/_shared/versioning"

export { PLAN_STATUSES, PROGRESS_MODES }

/** Legacy clients may still send "delayed" (retired: delay is computed) — read as in progress. */
const planStatus = z.preprocess((v) => (v === "delayed" ? "in_progress" : v), z.enum(PLAN_STATUSES))

/** "YYYY-MM-DD" (or an ISO date-time); normalized to date-only in the service. null / "" = 日程未定. */
const planDate = z.string().max(40).nullable()
/** 目安期間 (days) of a stage, used by 「日程を仮置き」. */
export const DURATION_DAYS_MAX = 3650
const durationDays = z.number().int().min(1).max(DURATION_DAYS_MAX).nullable().optional()
const optionalText = z.string().max(10000).nullable().optional()
const id = z.string().min(1).max(64)

export const createPlanItemSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: id.nullable().optional(),
  /** Omitted / null on both = an undated item (日程未定). */
  plannedStart: planDate.optional(),
  plannedEnd: planDate.optional(),
  isMilestone: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  status: planStatus.optional(),
  description: optionalText,
  notes: optionalText,
  ownerId: id.nullable().optional(),
  progressMode: z.enum(PROGRESS_MODES).optional(),
  durationDays,
})

export const updatePlanItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: id.nullable().optional(),
  plannedStart: planDate.optional(),
  plannedEnd: planDate.optional(),
  actualStart: z.string().max(40).nullable().optional(),
  actualEnd: z.string().max(40).nullable().optional(),
  isMilestone: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  status: planStatus.optional(),
  sortOrder: z.number().int().optional(),
  description: optionalText,
  notes: optionalText,
  ownerId: id.nullable().optional(),
  progressMode: z.enum(PROGRESS_MODES).optional(),
  durationDays,
  /** Optimistic lock: the version the client loaded (omitted = unchecked, legacy). */
  version: versionField,
})

export const reorderPlanSchema = z.object({
  updates: z
    .array(z.object({ id: z.string(), parentId: z.string().nullable(), sortOrder: z.number().int() }))
    .min(1)
    .max(2000),
})

/** Upper bound of PBIs one PUT /plan/:id/links may set. */
export const PLAN_LINKS_MAX = 500

export const setPlanLinksSchema = z.object({
  pbiIds: z.array(id).max(PLAN_LINKS_MAX),
})

export const baselineSchema = z.object({
  itemIds: z.array(id).min(1).max(2000).optional(),
})

export const createDependencySchema = z.object({
  predecessorId: id,
  successorId: id,
})

export const EXPORT_LANGS = ["ja", "en", "id"] as const
export type ExportLang = (typeof EXPORT_LANGS)[number]

export type CreatePlanItemInput = z.infer<typeof createPlanItemSchema>
export type UpdatePlanItemInput = z.infer<typeof updatePlanItemSchema>
export type PlanReorderUpdate = z.infer<typeof reorderPlanSchema>["updates"][number]
