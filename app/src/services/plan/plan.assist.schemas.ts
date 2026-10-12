/** Request schemas of the scheduling-assist endpoints (reflow / bulk / duplicate / import). */
import { z } from "zod"
import { PLAN_STATUSES } from "@/lib/plan-progress"

/** Legacy clients may still send "delayed" (retired) — read as in progress. */
const planStatus = z.preprocess((v) => (v === "delayed" ? "in_progress" : v), z.enum(PLAN_STATUSES))
const id = z.string().min(1).max(64)
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** POST /plan/reflow: 依存関係で再計算 (every dependency strict finish-to-start). */
export const reflowSchema = z.object({
  /** false = preview only. */
  apply: z.boolean(),
  /** Land on business days (weekends and Japanese holidays skipped). */
  businessDays: z.boolean().optional(),
})

/** Upper bound of ids one POST /plan/bulk may target. */
export const PLAN_BULK_IDS_MAX = 200

/** POST /plan/bulk: one operation on many rows (shift / owner / status), preview or apply. */
export const bulkPlanSchema = z.object({
  target: z.union([z.object({ ids: z.array(id).min(1).max(PLAN_BULK_IDS_MAX) }), z.object({ fromDate: dateKey })]),
  op: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("shift"),
      days: z.number().int().min(-3650).max(3650).refine((n) => n !== 0, "days must not be 0"),
      businessDays: z.boolean().optional(),
    }),
    z.object({ type: z.literal("owner"), ownerId: id.nullable() }),
    z.object({ type: z.literal("status"), status: planStatus }),
  ]),
  /** false = preview only. */
  apply: z.boolean(),
})

/** POST /plan/:id/duplicate: copy the item and its live subtree. */
export const duplicatePlanSchema = z.object({
  suffix: z.string().max(40).optional(),
})

export const PLAN_IMPORT_ROWS_MAX = 500
export const PLAN_IMPORT_MAX_DEPTH = 5

/**
 * POST /plan/import: a flat outline (depth 0 = child of parentId). The row
 * content is validated per row by the service (every problem is reported at
 * once); the schema only bounds the shape.
 */
export const importPlanSchema = z.object({
  parentId: id.nullable().optional(),
  apply: z.boolean(),
  rows: z
    .array(
      z.object({
        depth: z.number().int().min(0).max(100),
        name: z.string().max(255),
        plannedStart: z.string().max(40).nullable(),
        plannedEnd: z.string().max(40).nullable(),
        ownerId: id.nullable(),
        isMilestone: z.boolean().optional(),
      })
    )
    .min(1)
    .max(PLAN_IMPORT_ROWS_MAX),
})

export type ReflowInput = z.infer<typeof reflowSchema>
export type BulkPlanInput = z.infer<typeof bulkPlanSchema>
export type DuplicatePlanInput = z.infer<typeof duplicatePlanSchema>
export type ImportPlanInput = z.infer<typeof importPlanSchema>
