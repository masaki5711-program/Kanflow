import { z } from "zod"
import {
  CHECK_NOTE_MAX,
  CHECK_RESULTS,
  KAIZEN_STAGES,
  METRIC_CATEGORIES,
  METRIC_DIRECTIONS,
  METRIC_NAME_MAX,
  METRIC_UNIT_MAX,
  ROLLOUT_NAME_MAX,
  ROLLOUT_STATUSES,
} from "@/lib/improvement/constants"

/** Largest metric value accepted (well inside DOUBLE; keeps sums and exports sane). */
export const METRIC_VALUE_MAX = 1e12
/** 効果金額 upper bound: INT column (signed 32 bit). */
export const ANNUAL_EFFECT_MAX = 2_000_000_000
/** スペース削減 upper bound in m² (a whole plant is far below this). */
export const SPACE_SAVED_MAX = 10_000_000

const metricValue = z.number().finite().min(-METRIC_VALUE_MAX).max(METRIC_VALUE_MAX).nullable().optional()

/** "YYYY-MM-DD" calendar day (stored as UTC midnight), "" / null clears. */
const day = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "日付は YYYY-MM-DD 形式です")
  .refine((v) => v === "" || !isNaN(new Date(v).getTime()), "日付が不正です")
  .nullable()
  .optional()

const text = (max: number) => z.string().trim().max(max).nullable().optional()

/** PATCH /improvements/[id]: the effect, standardisation and stage of one item. */
export const updateImprovementSchema = z.object({
  metricCategory: z.enum(METRIC_CATEGORIES).nullable().optional(),
  metricName: text(METRIC_NAME_MAX),
  metricUnit: text(METRIC_UNIT_MAX),
  direction: z.enum(METRIC_DIRECTIONS).optional(),
  baselineValue: metricValue,
  targetValue: metricValue,
  resultValue: metricValue,
  annualEffectUsd: z.number().int().min(0).max(ANNUAL_EFFECT_MAX).nullable().optional(),
  spaceSavedM2: z.number().min(0).max(SPACE_SAVED_MAX).nullable().optional(),
  kaizenStage: z.enum(KAIZEN_STAGES).optional(),
  standardizedAt: day,
  /** 標準書リンク (the release item's manualLink). */
  manualLink: z.string().trim().max(2000).nullable().optional(),
  /** 展開日 (the release item's releaseDate); setting it creates the 1 / 3 month checks. */
  releaseDate: day,
  /** 改善オーナーメモ (the release item's poNote). */
  poNote: z.string().max(10000).nullable().optional(),
  initiative: z.string().max(500).nullable().optional(),
  userStory: z.string().max(20000).nullable().optional(),
})

export const createRolloutSchema = z.object({
  targetName: z.string().trim().min(1).max(ROLLOUT_NAME_MAX),
})

export const updateRolloutSchema = z
  .object({
    targetName: z.string().trim().min(1).max(ROLLOUT_NAME_MAX).optional(),
    status: z.enum(ROLLOUT_STATUSES).optional(),
  })
  .refine((v) => v.targetName !== undefined || v.status !== undefined, "変更内容がありません")

export const reorderRolloutsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(200),
})

export const createCheckSchema = z.object({
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式です").refine((v) => !isNaN(new Date(v).getTime()), "日付が不正です"),
})

/** Record (or clear with result null) a 定着確認 result. */
export const recordCheckSchema = z.object({
  result: z.enum(CHECK_RESULTS).nullable(),
  note: z.string().trim().max(CHECK_NOTE_MAX).nullable().optional(),
})

export type UpdateImprovementInput = z.infer<typeof updateImprovementSchema>
export type CreateRolloutInput = z.infer<typeof createRolloutSchema>
export type UpdateRolloutInput = z.infer<typeof updateRolloutSchema>
export type ReorderRolloutsInput = z.infer<typeof reorderRolloutsSchema>
export type CreateCheckInput = z.infer<typeof createCheckSchema>
export type RecordCheckInput = z.infer<typeof recordCheckSchema>
