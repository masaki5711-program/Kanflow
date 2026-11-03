/**
 * Request bodies of the lesson-rule routes (plan 12 §2.3, E3). The rule itself (kind + params) is validated with the
 * one schema in src/lib/plan-lesson-rules/rules.ts; these only add the envelope (sources, quote, version).
 */
import { z } from "zod"
import { RULE_KIND_ORDER } from "@/lib/plan-lesson-rules/rules"

/** Most PBIs one rule may cite (the table CHECK has the same bound). */
export const RULE_SOURCE_PBIS_MAX = 50
/** Quote length (the table CHECK has the same bound). */
export const RULE_QUOTE_MAX = 1000

const id = z.string().min(1).max(191)
/** Controls (tab and newline aside), line / paragraph separators and format characters (bidi overrides, zero-width, BOM). */
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

const quoteSchema = z
  .string()
  .transform((s) => s.normalize("NFKC").replace(/\r\n?/g, "\n").trim())
  .pipe(z.string().max(RULE_QUOTE_MAX).refine((s) => !UNSAFE_TEXT.test(s.replace(/[\n\t]/g, "")), "quote: no control or invisible format characters"))
  .transform((s) => (s === "" ? null : s))

const ruleContent = {
  kind: z.enum(RULE_KIND_ORDER),
  /** Validated against the kind's schema by the service (`parseLessonRule`). */
  params: z.record(z.string(), z.unknown()),
}

export const createRuleSchema = z
  .object({
    ...ruleContent,
    quote: quoteSchema.nullable().optional(),
    sourceLessonId: id.nullable().optional(),
    sourceBacklogItemIds: z.array(id).max(RULE_SOURCE_PBIS_MAX).optional(),
    sourceSprintId: id.nullable().optional(),
  })
  .strict()
export type CreateRuleInput = z.infer<typeof createRuleSchema>

/** A draft's content may change until it is confirmed; the sources stay as drafted. */
export const updateDraftSchema = z.object({ version: z.number().int().min(0), ...ruleContent, quote: quoteSchema.nullable().optional() }).strict()
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>

/** Confirm repeats the kind and numbers the confirmer saw: one rule at a time, never in bulk (plan 12 §2.3). */
export const confirmRuleSchema = z.object({ version: z.number().int().min(0), ...ruleContent }).strict()
export type ConfirmRuleInput = z.infer<typeof confirmRuleSchema>

export const versionSchema = z.object({ version: z.number().int().min(0) }).strict()

const lineage = z.string().trim().min(1).max(200)
const projectType = z.string().trim().min(1).max(40)

/** Promotion request (source project PO): at least one filter. */
export const promotionRequestSchema = z
  .object({ version: z.number().int().min(0), lineage: lineage.nullable().optional(), projectType: projectType.nullable().optional() })
  .strict()
  .refine((b) => Boolean(b.lineage) || Boolean(b.projectType), { message: "lineage or projectType is required", path: ["lineage"] })
export type PromotionRequestInput = z.infer<typeof promotionRequestSchema>

/** Admin decision on a promotion request. Confirm repeats the kind, the numbers and the requested reach. */
export const promotionDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({ decision: z.literal("confirm"), version: z.number().int().min(0), ...ruleContent, lineage: lineage.nullable(), projectType: projectType.nullable() })
    .strict(),
  z.object({ decision: z.literal("reject"), version: z.number().int().min(0) }).strict(),
])
export type PromotionDecisionInput = z.infer<typeof promotionDecisionSchema>
