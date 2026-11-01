import type { Db } from "@/services/_shared/db"
import { findResidualSecret, redactText, allowedHostsFromEnv } from "./redact"
import { computeSignature } from "./signature"

/**
 * Import of the agent model's mistake-memory (`.claude/mistakes/records.jsonl`) as confirmed, global
 * lessons (W11; scripts/import-mistake-memory.ts). Pure planning + an idempotent apply:
 * the lesson key is (signature, "global"), the signature comes from the record's `signature` text
 * (redacted and normalized like any other failure text, tool "mistake-memory"), so running the import
 * twice — or on a file that gained records — never duplicates.
 *
 * A record is skipped, with the reason reported, when it has no fix, no usable signature text, a
 * signature already planned from an earlier line, or something credential-like after redaction.
 */

export const IMPORT_TOOL = "mistake-memory"
const TEXT_MAX = 4000

export interface ImportRecord {
  id?: unknown
  title?: unknown
  signature?: unknown
  context?: unknown
  root_cause?: unknown
  fix?: unknown
  recurrence?: unknown
  last_hit_at?: unknown
  updated_at?: unknown
  created_at?: unknown
}

export interface PlannedLesson {
  signature: string
  scope: "global"
  symptom: string
  cause: string | null
  fix: string
  evidence: string[]
  hits: number
  lastSeenAt: Date
  sourceId: string
}

export type SkipReason = "invalid-json" | "no-fix" | "no-signature-text" | "duplicate-in-file" | "residual-secret"

export interface ImportPlan {
  lessons: PlannedLesson[]
  skipped: Array<{ line: number; id: string | null; reason: SkipReason }>
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")
const clip = (s: string) => (s.length > TEXT_MAX ? s.slice(0, TEXT_MAX) : s)

function dateOf(...candidates: unknown[]): Date | null {
  for (const c of candidates) {
    if (typeof c !== "string") continue
    const d = new Date(c)
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

/** Pure: JSONL text → planned lessons and skipped lines. */
export function planMistakeImport(jsonl: string, sourceLabel: string, now: Date, opts: { allowedHosts?: readonly string[] } = {}): ImportPlan {
  const hosts = opts.allowedHosts ?? allowedHostsFromEnv()
  const plan: ImportPlan = { lessons: [], skipped: [] }
  const seen = new Set<string>()
  const lines = jsonl.split(/\r?\n/)
  lines.forEach((raw, index) => {
    if (!raw.trim()) return
    const line = index + 1
    let rec: ImportRecord
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
      rec = parsed as ImportRecord
    } catch {
      plan.skipped.push({ line, id: null, reason: "invalid-json" })
      return
    }
    const id = str(rec.id) || null
    const skip = (reason: SkipReason) => plan.skipped.push({ line, id, reason })
    const fixRaw = str(rec.fix)
    if (!fixRaw) return skip("no-fix")
    const sigText = str(rec.signature) || str(rec.title)
    const sig = computeSignature({ tool: IMPORT_TOOL, text: sigText }, { allowedHosts: hosts })
    if (!sig.signatureText) return skip("no-signature-text")
    if (seen.has(sig.signature)) return skip("duplicate-in-file")

    const clean = (s: string) => redactText(s, { allowedHosts: hosts }).text
    const symptom = clip(clean(str(rec.title) || sigText))
    const cause = str(rec.root_cause) ? clip(clean(str(rec.root_cause))) : null
    const fix = clip(clean(fixRaw))
    if ([symptom, cause, fix].some((t) => t && findResidualSecret(t))) return skip("residual-secret")

    seen.add(sig.signature)
    const recurrence = typeof rec.recurrence === "number" && Number.isInteger(rec.recurrence) && rec.recurrence > 0 ? rec.recurrence : 0
    plan.lessons.push({
      signature: sig.signature,
      scope: "global",
      symptom,
      cause,
      fix,
      evidence: [`${IMPORT_TOOL}:${id ?? `line-${line}`} (${sourceLabel})`],
      hits: recurrence,
      lastSeenAt: dateOf(rec.last_hit_at, rec.updated_at, rec.created_at) ?? now,
      sourceId: id ?? `line-${line}`,
    })
  })
  return plan
}

export interface ImportResult {
  created: number
  existing: number
}

/** Idempotent: a lesson whose (signature, global) exists is left untouched (it may have been curated since). */
export async function applyMistakeImport(db: Db, plan: ImportPlan, now: Date): Promise<ImportResult> {
  const result: ImportResult = { created: 0, existing: 0 }
  for (const l of plan.lessons) {
    const found = await db.lesson.findUnique({ where: { signature_scope: { signature: l.signature, scope: l.scope } }, select: { id: true } })
    if (found) {
      result.existing += 1
      continue
    }
    await db.lesson.create({
      data: {
        signature: l.signature,
        scope: l.scope,
        state: "confirmed",
        symptom: l.symptom,
        cause: l.cause,
        fix: l.fix,
        evidence: JSON.stringify(l.evidence),
        hits: l.hits,
        resolvedCount: 0,
        lastSeenAt: l.lastSeenAt,
        confirmedAt: now,
      },
      select: { id: true },
    })
    result.created += 1
  }
  return result
}
