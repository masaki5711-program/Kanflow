import { z } from "zod"
import {
  CHECK_RESULTS,
  DOCUMENT_STATUSES,
  METRIC_DIRECTIONS,
  MONTH_RE,
  MS_CHECK_LABEL_MAX,
  MS_METRIC_NAME_MAX,
  MS_METRIC_UNIT_MAX,
  MS_NAME_MAX,
  MS_NUMBER_MAX,
  MS_TEXT_MAX,
  PUNCH_STATUSES,
} from "@/lib/milestones/constants"

/** "YYYY-MM-DD" calendar day (stored as UTC midnight); null / "" clears. */
const day = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "日付は YYYY-MM-DD 形式です")
  .refine((v) => v === "" || !isNaN(new Date(v).getTime()), "日付が不正です")
  .nullable()
  .optional()

const name = z.string().trim().min(1).max(MS_NAME_MAX)
const text = (max: number) => z.string().trim().max(max).nullable().optional()
const id = z.string().min(1).max(64)
const amount = z.number().finite().min(-MS_NUMBER_MAX).max(MS_NUMBER_MAX).nullable().optional()
const nonEmpty = (v: object) => Object.values(v).some((x) => x !== undefined)

/** PATCH /milestones/settings (plan.write). */
export const updateSettingsSchema = z
  .object({
    checkLabel: text(MS_CHECK_LABEL_MAX),
    budgetEnabled: z.boolean().optional(),
    trendEnabled: z.boolean().optional(),
  })
  .refine(nonEmpty, "変更内容がありません")

/** PUT /milestones/stages/[planItemId]/checklist: tick / untick one 完了条件 (any member). */
export const tickConditionSchema = z.object({
  label: z.string().trim().min(1).max(2000),
  checked: z.boolean(),
})

// === チェック項目 ===

export const createCheckSchema = z.object({
  name,
  criterion: text(MS_TEXT_MAX),
  planItemId: id.nullable().optional(),
})

/** Structure fields (plan.write). */
export const CHECK_STRUCTURE_FIELDS = ["name", "criterion", "planItemId", "sortOrder"] as const

/** PATCH /milestones/checks/[checkId]: result fields any member; structure fields need plan.write. */
export const updateCheckSchema = z
  .object({
    name: name.optional(),
    criterion: text(MS_TEXT_MAX),
    planItemId: id.nullable().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    result: z.enum(CHECK_RESULTS).nullable().optional(),
    witness: text(MS_NAME_MAX),
    checkedAt: day,
    note: text(MS_TEXT_MAX),
  })
  .refine(nonEmpty, "変更内容がありません")

// === 残課題 ===

export const createPunchSchema = z.object({
  title: name,
  detail: text(MS_TEXT_MAX),
  planItemId: id.nullable().optional(),
  assigneeId: id.nullable().optional(),
  assigneeName: text(MS_NAME_MAX),
  dueDate: day,
})

export const updatePunchSchema = z
  .object({
    title: name.optional(),
    detail: text(MS_TEXT_MAX),
    planItemId: id.nullable().optional(),
    assigneeId: id.nullable().optional(),
    assigneeName: text(MS_NAME_MAX),
    dueDate: day,
    status: z.enum(PUNCH_STATUSES).optional(),
  })
  .refine(nonEmpty, "変更内容がありません")

// === 引き渡し資料 ===

export const createDocumentSchema = z.object({ name })

export const DOCUMENT_STRUCTURE_FIELDS = ["name", "sortOrder"] as const

/** PATCH /milestones/documents/[documentId]: status / note any member; name / order plan.write. */
export const updateDocumentSchema = z
  .object({
    name: name.optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    status: z.enum(DOCUMENT_STATUSES).optional(),
    note: text(MS_TEXT_MAX),
  })
  .refine(nonEmpty, "変更内容がありません")

// === 予算 ===

export const createBudgetLineSchema = z.object({ name, plannedYen: amount, actualYen: amount, note: text(MS_TEXT_MAX) })

export const updateBudgetLineSchema = z
  .object({ name: name.optional(), plannedYen: amount, actualYen: amount, note: text(MS_TEXT_MAX) })
  .refine(nonEmpty, "変更内容がありません")

// === 推移 ===

const metricFields = {
  name: z.string().trim().min(1).max(MS_METRIC_NAME_MAX),
  unit: text(MS_METRIC_UNIT_MAX),
  direction: z.enum(METRIC_DIRECTIONS).optional(),
  baselineValue: amount,
  targetValue: amount,
}

export const createMetricSchema = z.object(metricFields)

export const updateMetricSchema = z
  .object({ ...metricFields, name: metricFields.name.optional() })
  .refine(nonEmpty, "変更内容がありません")

/** PUT /milestones/metrics/[metricId]/points: one month's value (null removes it). Any member. */
export const putMetricPointSchema = z.object({
  month: z.string().regex(MONTH_RE, "月は YYYY-MM 形式です"),
  value: z.number().finite().min(-MS_NUMBER_MAX).max(MS_NUMBER_MAX).nullable(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
export type TickConditionInput = z.infer<typeof tickConditionSchema>
export type CreateCheckInput = z.infer<typeof createCheckSchema>
export type UpdateCheckInput = z.infer<typeof updateCheckSchema>
export type CreatePunchInput = z.infer<typeof createPunchSchema>
export type UpdatePunchInput = z.infer<typeof updatePunchSchema>
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>
export type CreateBudgetLineInput = z.infer<typeof createBudgetLineSchema>
export type UpdateBudgetLineInput = z.infer<typeof updateBudgetLineSchema>
export type CreateMetricInput = z.infer<typeof createMetricSchema>
export type UpdateMetricInput = z.infer<typeof updateMetricSchema>
export type PutMetricPointInput = z.infer<typeof putMetricPointSchema>

/** True when the input touches a field outside `allowed` (e.g. a structure field on a track-only call). */
export function touchesAny(input: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.some((f) => input[f] !== undefined)
}
