import { z } from "zod"

/** How a criterion is proven (W12): a test, an inspection record, a measurement against the theoretical value, a document approval. */
export const EVIDENCE_KINDS = ["test", "inspection", "measurement", "approval"] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

/** Upper bound of live criteria on one PBI. */
export const AC_MAX_PER_PBI = 100
/** Upper bound of one text field (characters). */
export const AC_TEXT_MAX = 2000

// No transforms here: the MCP tools reuse `.shape` (JSON Schema). Trimming happens in the service.
const text = z.string().max(AC_TEXT_MAX).nullable().optional().describe(`Optional, at most ${AC_TEXT_MAX} characters. Empty = not set.`)
const evidenceKind = z.enum(EVIDENCE_KINDS).nullable().optional().describe("How it is proven: test | inspection | measurement | approval. null = not decided.")

/** Create: at least one of given / when / then / text must have content (checked in the service, after trimming). */
export const createAcceptanceCriterionSchema = z.object({ given: text, when: text, then: text, text, evidenceKind })

/** Update: only the sent fields change (null / "" clears one); `seq` never changes. */
export const updateAcceptanceCriterionSchema = createAcceptanceCriterionSchema

export type CreateAcceptanceCriterionInput = z.infer<typeof createAcceptanceCriterionSchema>
export type UpdateAcceptanceCriterionInput = z.infer<typeof updateAcceptanceCriterionSchema>

/** Display id of a criterion: `PBI-12/AC-2`. */
export function formatAcId(pbiDisplayId: number, seq: number): string {
  return `PBI-${pbiDisplayId}/AC-${seq}`
}

/**
 * The `seq` named by "AC-2", "ac2", "2" or "PBI-12/AC-2". With `pbiDisplayId` a reference that
 * names another PBI ("PBI-13/AC-2" on PBI 12) is null, so it is a 404 instead of silently
 * editing the wrong item. null when the reference is none of these.
 */
export function parseAcRef(ref: string, pbiDisplayId?: number): number | null {
  const m = /^(?:pbi-?(\d{1,9})\/)?(?:ac-?)?(\d{1,9})$/i.exec(ref.trim())
  if (!m) return null
  if (m[1] !== undefined && pbiDisplayId !== undefined && Number(m[1]) !== pbiDisplayId) return null
  const seq = Number(m[2])
  return seq >= 1 ? seq : null
}
