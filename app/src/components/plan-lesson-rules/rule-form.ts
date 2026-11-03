/**
 * Form model of the rule editor: every field is kept as typed text, and `toRuleContent` turns it into the params the
 * server validates (the same zod schema runs here first, so the user sees the error before a round trip). Pure.
 */
import { lessonRuleSchema, RULE_KIND_ORDER, type LessonRuleKind } from "@/lib/plan-lesson-rules/rules"

export const FORM_KINDS: readonly LessonRuleKind[] = ["add_buffer", "scale_duration", "add_prerequisite", "add_dependency", "split", "cap_parallel"]

/** Which inputs a kind shows, in order. "role?" = optional role. */
export const KIND_FIELDS: Readonly<Record<LessonRuleKind, readonly FieldName[]>> = {
  scale_duration: ["key", "factor"],
  add_buffer: ["afterKey", "days"],
  add_prerequisite: ["beforeKey", "newKey", "name", "durationDays", "role"],
  add_dependency: ["from", "to"],
  split: ["key", "parts"],
  cap_parallel: ["role", "max"],
}

export type FieldName = "key" | "factor" | "afterKey" | "days" | "beforeKey" | "newKey" | "name" | "durationDays" | "role" | "from" | "to" | "parts" | "max"
const NUMERIC = new Set<FieldName>(["factor", "days", "durationDays", "parts", "max"])

export type FormValues = Partial<Record<FieldName, string>>

export function valuesFromParams(params: Record<string, unknown>): FormValues {
  const out: FormValues = {}
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" || typeof v === "number") out[k as FieldName] = String(v)
  return out
}

export type RuleContentResult = { ok: true; kind: LessonRuleKind; params: Record<string, unknown> } | { ok: false; field: FieldName | null }

/** Build { kind, params } from the form; on a schema error, the first offending field (or null). */
export function toRuleContent(kind: LessonRuleKind, values: FormValues): RuleContentResult {
  if (!RULE_KIND_ORDER.includes(kind)) return { ok: false, field: null }
  const params: Record<string, unknown> = {}
  for (const f of KIND_FIELDS[kind]) {
    const raw = (values[f] ?? "").trim()
    // `role` is optional only for add_prerequisite.
    if (raw === "" && f === "role" && kind === "add_prerequisite") continue
    params[f] = NUMERIC.has(f) ? (raw === "" ? Number.NaN : Number(raw.replace(",", "."))) : raw
  }
  const parsed = lessonRuleSchema.safeParse({ id: "form", state: "draft", kind, params })
  if (parsed.success) return { ok: true, kind, params: parsed.data.params as Record<string, unknown> }
  const path = parsed.error.issues[0]?.path ?? []
  const field = path[0] === "params" && typeof path[1] === "string" ? (path[1] as FieldName) : null
  return { ok: false, field }
}
