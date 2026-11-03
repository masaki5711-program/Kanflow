/** Request bodies of the 計画を作る routes (plan 12 E5). */
import { z } from "zod"
import { baseScheduleSchema, startDateSchema } from "@/lib/plan-schedule/base-schedule"
import { lineageSchema, sourceRefSchema } from "@/lib/plan-schedule/schedule-source"
import { REMOVED_OWNER_KEYS_MAX } from "./estimate-run.service"

const role = z.string().regex(/^(?!__)[A-Za-z0-9_-]{1,32}$/)
const userId = z.string().min(1).max(191)
const roleAssignmentsSchema = z
  .record(role, z.array(userId).max(50))
  .refine((m) => Object.keys(m).length <= 50, "at most 50 roles")
  .default({})

/**
 * Make a run: from a Kanflow plan template, or from a base schedule an agent read (schedule.yml, like plan_load).
 * The schedule's own fields never name owners (unknown keys such as ownerId are dropped by baseScheduleSchema).
 */
export const createRunSchema = z
  .object({
    startDate: startDateSchema,
    skipWeekends: z.boolean().optional(),
    roleAssignments: roleAssignmentsSchema,
    templateId: z.string().min(1).max(64).optional(),
    schedule: baseScheduleSchema.optional(),
    sourceRef: sourceRefSchema.optional(),
    lineage: lineageSchema.optional(),
  })
  .strict()
  .refine((b) => (b.templateId === undefined) !== (b.schedule === undefined), { message: "templateId or schedule (exactly one)", path: ["templateId"] })
  .refine((b) => b.templateId === undefined || (b.sourceRef === undefined && b.lineage === undefined), { message: "sourceRef / lineage come from the template", path: ["sourceRef"] })
export type CreateRunBody = z.infer<typeof createRunSchema>

export const feedbackSchema = z
  .object({
    key: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    kind: z.enum(["too_high", "too_low", "rule_not_applicable", "other"]),
    note: z.string().max(500).nullable().optional(),
  })
  .strict()

export const evidenceQuerySchema = z.object({ offset: z.coerce.number().int().min(0).max(100_000).default(0) })

/**
 * /plan/load with an estimate run: the run is the only source of the schedule, the start date and the owners. The
 * approver may only REMOVE owners (plan 12 §3.6): no schedule, no owner map, no added user is accepted.
 */
export const loadRunSchema = z
  .object({
    estimateRunId: z.string().min(1).max(64),
    removedOwnerKeys: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(REMOVED_OWNER_KEYS_MAX).default([]),
  })
  .strict()
