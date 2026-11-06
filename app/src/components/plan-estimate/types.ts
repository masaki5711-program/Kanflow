/** Client-side shapes of the 計画を作る API (plan 12 E5; see services/plan-estimate-run) and display helpers. */
import { fillTemplate } from "@/lib/fill-template"
import type { Language, Translations } from "@/lib/i18n"

export type GateReason = "no_backtest" | "not_enough_actuals" | "not_better_than_template" | "p80_out_of_range" | "end_error_worse" | "backtest_outdated" | "not_approved"
export type Band = "~3" | "4-9" | "10+"
export type FeedbackKind = "too_high" | "too_low" | "rule_not_applicable" | "other"

export interface RunSummary {
  gateOn: boolean
  gateReason: GateReason | null
  templateEnd: string
  p50End: string
  p80End: string
  bufferDays: number
  plannedEnd: string
  leafCount: number
  rulesApplied: number
  rulesRejected: number
  matchedProjects: Band | null
  /** templateDays null = an item a lesson rule added. */
  changes: { key: string; name: string; templateDays: number | null; days: number }[]
  changesTotal: number
  /** E6 candidate review (absent on runs made before E6). */
  assist?: { candidates: CandidateAssistState; rejected: number }
}

export type CandidateAssistState = "off" | "no_candidates" | "applied" | "timeout" | "unavailable" | "http" | "invalid" | "aborted" | "error"

/** E6: what this reader may see of the run's AI explanation. */
export type ExplanationView =
  | { state: "ready"; text: { ja: string; en: string; id: string } }
  | { state: "hidden" | "pending" | "failed" | "skipped" | "off" }

/** The candidate review was attempted and did not work: the formula alone ("AI の補助なし"). */
export function candidateAssistFailed(state: CandidateAssistState | undefined): boolean {
  return state === "timeout" || state === "unavailable" || state === "http" || state === "invalid" || state === "error"
}

export interface UsageRow {
  userId: string
  name: string
  maxUtilization: number
  daysOverCapacity: number
}

export interface RunCard {
  runId: string
  summary: RunSummary
  createdAt: string
  expiresAt: string
  expired: boolean
  stale: boolean
  changesWithheld: number
  explanation: ExplanationView
  ownerPlan?: { owners: Record<string, string | null>; names: Record<string, string>; before: UsageRow[]; after: UsageRow[] }
}

export interface EvidenceLeaf {
  key: string
  name: string
  role: string | null
  addedByRule: string | null
  templateDays: number | null
  reduced: boolean
  limited: boolean
  estimate: null | {
    d50: number
    d80: number
    r50: number | null
    r80: number | null
    observations: Band
    otherProjects: Band | null
    sources: { projectName: string; stage: number; ratio: number }[]
  }
}

export interface EvidencePage {
  leaves: EvidenceLeaf[]
  total: number
  offset: number
  stale: boolean
}

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["too_high", "too_low", "rule_not_applicable", "other"]

/** The translated text of a gate reason (an explicit map: every reason has a key in ja / en / id). */
export function gateReasonText(t: Translations, reason: GateReason): string {
  const map: Record<GateReason, string> = {
    no_backtest: t.pesGateReason_no_backtest,
    not_enough_actuals: t.pesGateReason_not_enough_actuals,
    not_better_than_template: t.pesGateReason_not_better_than_template,
    p80_out_of_range: t.pesGateReason_p80_out_of_range,
    end_error_worse: t.pesGateReason_end_error_worse,
    backtest_outdated: t.pesGateReason_backtest_outdated,
    not_approved: t.pesGateReason_not_approved,
  }
  return map[reason]
}

export function feedbackText(t: Translations, kind: FeedbackKind): string {
  const map: Record<FeedbackKind, string> = {
    too_high: t.pesFeedback_too_high,
    too_low: t.pesFeedback_too_low,
    rule_not_applicable: t.pesFeedback_rule_not_applicable,
    other: t.pesFeedback_other,
  }
  return map[kind]
}

/** A count band ("~3", "4-9", "10+") in the reader's language. */
export function bandText(t: Translations, band: Band): string {
  return band === "~3" ? t.pesBandFew : band === "4-9" ? t.pesBandSome : t.pesBandMany
}

/** "{n} days" with the singular where the language has one. */
export function daysText(t: Translations, n: number): string {
  return fillTemplate(n === 1 ? t.pesDay : t.pesDays, { n })
}

/** A ratio rounded to 0.1 in the reader's number format ("×1.6", "×1,6"). */
export function ratioText(t: Translations, language: Language, ratio: number): string {
  return fillTemplate(t.pesRatio, { n: new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ratio) })
}

export function percentText(t: Translations, share: number): string {
  return fillTemplate(t.pesPercent, { n: Math.round(share * 100) })
}
