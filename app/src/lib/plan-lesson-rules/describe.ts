/**
 * Words for a lesson rule (kind label + one sentence with its numbers) — what the confirmer reads before confirming
 * (plan 12 §2.3: one at a time, numbers on screen). Pure; takes the translations so it renders ja / en / id. Unknown
 * or malformed params fall back to the kind label alone (a stored rule is re-validated before it changes a plan).
 */
import { fillTemplate } from "@/lib/fill-template"
import type { PlanLessonRulesTranslations } from "@/lib/i18n/plan-lesson-rules"
import { lessonRuleSchema, type LessonRuleKind } from "./rules"

type T = Pick<
  PlanLessonRulesTranslations,
  | "plrKindScaleDuration"
  | "plrKindAddBuffer"
  | "plrKindAddPrerequisite"
  | "plrKindAddDependency"
  | "plrKindSplit"
  | "plrKindCapParallel"
  | "plrSumScaleDuration"
  | "plrSumAddBuffer"
  | "plrSumAddPrerequisite"
  | "plrSumAddDependency"
  | "plrSumSplit"
  | "plrSumCapParallel"
>

export function ruleKindLabel(kind: string, t: T): string {
  switch (kind as LessonRuleKind) {
    case "scale_duration":
      return t.plrKindScaleDuration
    case "add_buffer":
      return t.plrKindAddBuffer
    case "add_prerequisite":
      return t.plrKindAddPrerequisite
    case "add_dependency":
      return t.plrKindAddDependency
    case "split":
      return t.plrKindSplit
    case "cap_parallel":
      return t.plrKindCapParallel
    default:
      return kind
  }
}

/**
 * One sentence with the rule's numbers, e.g. "「受入」の後に 3 日の余裕を入れる". Numbers are written for `locale`
 * (BCP 47; id-ID writes ×0,5), so the sentence matches what the form accepts.
 */
export function ruleSummary(kind: string, params: unknown, t: T, locale = "ja-JP"): string {
  const parsed = lessonRuleSchema.safeParse({ id: "x", state: "draft", kind, params })
  if (!parsed.success) return ruleKindLabel(kind, t)
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const num = (v: number): string => fmt.format(v)
  const r = parsed.data
  switch (r.kind) {
    case "scale_duration":
      return fillTemplate(t.plrSumScaleDuration, { key: r.params.key, factor: num(r.params.factor) })
    case "add_buffer":
      return fillTemplate(t.plrSumAddBuffer, { afterKey: r.params.afterKey, days: num(r.params.days) })
    case "add_prerequisite":
      return fillTemplate(t.plrSumAddPrerequisite, { beforeKey: r.params.beforeKey, name: r.params.name, durationDays: num(r.params.durationDays) })
    case "add_dependency":
      return fillTemplate(t.plrSumAddDependency, { from: r.params.from, to: r.params.to })
    case "split":
      return fillTemplate(t.plrSumSplit, { key: r.params.key, parts: num(r.params.parts) })
    case "cap_parallel":
      return fillTemplate(t.plrSumCapParallel, { role: r.params.role, max: num(r.params.max) })
  }
}
