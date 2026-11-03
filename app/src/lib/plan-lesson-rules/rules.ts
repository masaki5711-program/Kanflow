/**
 * Lesson rules (反省点の規則, plan 12 §2.3): the only shapes in which a lesson — written by a person or drafted by
 * the local LLM — may change a base schedule. Six fixed kinds with bounded numbers; anything else is refused with
 * PLAN_RULE_INVALID. Pure and client-safe; the table `plan_lesson_rule` and the confirm flow come later (E3 second
 * half). Only `confirmed` rules ever change a plan (`applyLessonRules`).
 */
import { z } from "zod"
import { BASE_SCHEDULE_MAX_DURATION, BASE_SCHEDULE_ROLE_MAX } from "@/lib/plan-schedule/base-schedule"

export const SCALE_FACTOR_MIN = 0.5
export const SCALE_FACTOR_MAX = 3.0
export const BUFFER_DAYS_MIN = 1
export const BUFFER_DAYS_MAX = 30
export const SPLIT_PARTS_MIN = 2
export const SPLIT_PARTS_MAX = 4
/** Every part of a split item keeps at least this many days. */
export const SPLIT_PART_MIN_DAYS = 2
export const CAP_PARALLEL_MIN = 1
export const CAP_PARALLEL_MAX = 5
/** `add_prerequisite.name` (plain text; see `plainNameSchema`). */
export const RULE_NAME_MAX = 80
/** Items one application may add (split parts beyond the first, buffers, prerequisites): at most 30 ... */
export const ADDED_ITEMS_MAX = 30
/** ... and at most this share of the template's leaves. */
export const ADDED_ITEMS_MAX_SHARE = 0.2

/** Applied in this order, then by rule id (plan 12 §3.4). */
export const RULE_KIND_ORDER = ["add_prerequisite", "add_dependency", "split", "add_buffer", "scale_duration", "cap_parallel"] as const
export type LessonRuleKind = (typeof RULE_KIND_ORDER)[number]

export const RULE_STATES = ["draft", "confirmed", "retired"] as const
export type LessonRuleState = (typeof RULE_STATES)[number]

const keySchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "key: letters, digits, _ and - (1-40 chars)")
const roleSchema = z.string().regex(new RegExp(`^[A-Za-z0-9_-]{1,${BASE_SCHEDULE_ROLE_MAX}}$`), `role: letters, digits, _ and - (1-${BASE_SCHEDULE_ROLE_MAX} chars)`)

// Control characters (incl. newlines), markup and links are refused rather than cleaned: a name is shown in the
// plan and on the approval card, and the drafting step (E6) is the place that turns free text into a plain name.
const CONTROL = new RegExp("[\u0000-\u001f\u007f-\u009f\u2028\u2029]")
const MARKUP = /[<>`]|\[[^\]]*\]\(|&[#a-z0-9]+;/i
const LINK = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i

/** A short plain-text item name: trimmed, 1-80 chars, no control characters, markup or URLs. */
export const plainNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(RULE_NAME_MAX)
  .refine((s) => !CONTROL.test(s), "name: no control characters or line breaks")
  .refine((s) => !MARKUP.test(s), "name: no markup")
  .refine((s) => !LINK.test(s), "name: no URLs")

export const scaleDurationParams = z.object({ key: keySchema, factor: z.number().finite().min(SCALE_FACTOR_MIN).max(SCALE_FACTOR_MAX) }).strict()
export const addBufferParams = z.object({ afterKey: keySchema, days: z.number().int().min(BUFFER_DAYS_MIN).max(BUFFER_DAYS_MAX) }).strict()
export const addPrerequisiteParams = z
  .object({
    beforeKey: keySchema,
    newKey: keySchema,
    name: plainNameSchema,
    durationDays: z.number().int().min(1).max(BASE_SCHEDULE_MAX_DURATION),
    role: roleSchema.optional(),
    load: z.number().min(0).max(1).optional(),
  })
  .strict()
export const addDependencyParams = z.object({ from: keySchema, to: keySchema }).strict()
export const splitParams = z.object({ key: keySchema, parts: z.number().int().min(SPLIT_PARTS_MIN).max(SPLIT_PARTS_MAX) }).strict()
export const capParallelParams = z.object({ role: roleSchema, max: z.number().int().min(CAP_PARALLEL_MIN).max(CAP_PARALLEL_MAX) }).strict()

const base = { id: z.string().min(1).max(64), state: z.enum(RULE_STATES) }

export const lessonRuleSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("scale_duration"), params: scaleDurationParams }).strict(),
  z.object({ ...base, kind: z.literal("add_buffer"), params: addBufferParams }).strict(),
  z.object({ ...base, kind: z.literal("add_prerequisite"), params: addPrerequisiteParams }).strict(),
  z.object({ ...base, kind: z.literal("add_dependency"), params: addDependencyParams }).strict(),
  z.object({ ...base, kind: z.literal("split"), params: splitParams }).strict(),
  z.object({ ...base, kind: z.literal("cap_parallel"), params: capParallelParams }).strict(),
])

export type LessonRule = z.infer<typeof lessonRuleSchema>
export type LessonRuleOf<K extends LessonRuleKind> = Extract<LessonRule, { kind: K }>

export class PlanRuleError extends Error {
  readonly code = "PLAN_RULE_INVALID" as const
  constructor(message: string) {
    super(message)
    this.name = "PlanRuleError"
  }
}

/** Parse an untrusted rule (API body, stored row, LLM draft). Throws PlanRuleError (PLAN_RULE_INVALID). */
export function parseLessonRule(input: unknown): LessonRule {
  const parsed = lessonRuleSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new PlanRuleError(`Invalid lesson rule${issue ? ` at ${issue.path.join(".") || "(root)"}: ${issue.message}` : ""}`)
  }
  return parsed.data
}
