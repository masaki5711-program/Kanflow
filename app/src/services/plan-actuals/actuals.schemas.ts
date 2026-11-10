/** Request bodies of the actuals routes (plan 12 E1). */
import { z } from "zod"

/** 確定の時のメモ: multi-line plain text (line breaks and tabs kept; other controls / invisible format characters refused). */
export const FINALIZE_NOTE_MAX = 2000
const finalizeNote = z
  .string()
  .transform((s) => s.normalize("NFKC").replace(/\r\n?/g, "\n").trim())
  .pipe(z.string().max(FINALIZE_NOTE_MAX).refine((s) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s.replace(/[\n\t]/g, "")), "note: no control or invisible format characters"))
  .transform((s) => (s === "" ? null : s))

/**
 * The finalizer repeats how many items to check they were shown (finalizing anyway); 0 / absent = none. `note` is the
 * optional 確定の時のメモ (a source of the E6 rule drafts).
 */
export const finalizeSchema = z.object({ acknowledgedIssueCount: z.number().int().min(0).max(100_000).optional(), note: finalizeNote.nullable().optional() }).strict()

const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u
const plainText = (max: number) =>
  z
    .string()
    .transform((s) => s.normalize("NFKC").trim())
    .pipe(z.string().min(1).max(max).refine((s) => !UNSAFE.test(s), "no control or invisible format characters"))

/** The learning switch needs a reason (plan 12 §2.2: 理由と操作した人を ActivityLog に残す). */
export const learningSwitchSchema = z.object({ includeInLearning: z.boolean(), reason: plainText(500), version: z.number().int().min(0) }).strict()

const id = z.string().min(1).max(191)
/** A user id, never an already pseudonymised "role:" value. */
const userId = id.refine((s) => !s.startsWith("role:"), "userId: not a pseudonym")
/** By retired user or by (superseded) snapshot — always with a reason for the audit. */
export const pseudonymizeSchema = z.union([z.object({ userId, reason: plainText(500) }).strict(), z.object({ snapshotId: id, reason: plainText(500) }).strict()])

export const ATTRIBUTE_KINDS = ["equipment", "process", "tag"] as const
/** Attributes per project. */
export const ATTRIBUTES_MAX = 50
export const attributesSchema = z
  .object({ attributes: z.array(z.object({ kind: z.enum(ATTRIBUTE_KINDS), ref: plainText(200) }).strict()).max(ATTRIBUTES_MAX) })
  .strict()
export type AttributesInput = z.infer<typeof attributesSchema>

/** Accept or reject one AI review proposal (the proposal's version guards against a decision made meanwhile). */
export const reviewDecisionSchema = z.object({ decision: z.enum(["accept", "reject"]), version: z.number().int().min(0) }).strict()
