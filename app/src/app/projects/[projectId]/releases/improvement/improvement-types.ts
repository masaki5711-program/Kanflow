import type { ImprovementSummary } from "@/lib/improvement/metrics"
import type { ReleaseItem } from "../release-types"

/** GET /improvements item: a release item plus the 改善成果ボード columns and children. */
export interface ImprovementRollout {
  id: string
  targetName: string
  status: string
  doneAt: string | null
  sortOrder: number
}

export interface ImprovementCheck {
  id: string
  dueDate: string
  kind: string
  checkedAt: string | null
  result: string | null
  note: string | null
  checkedByName: string | null
  notifiedAt: string | null
}

export interface ImprovementPhoto {
  id: string
  phase: string
  originalName: string
  fileSize: number
  mimeType: string
  createdAt: string
}

export interface ImprovementItem extends ReleaseItem {
  metricCategory: string | null
  metricName: string | null
  metricUnit: string | null
  direction: string
  baselineValue: number | null
  targetValue: number | null
  resultValue: number | null
  annualEffectYen: number | null
  kaizenStage: string
  standardizedAt: string | null
  rollouts: ImprovementRollout[]
  checks: ImprovementCheck[]
  photos: ImprovementPhoto[]
}

export interface BoardPermissions {
  /** PO: effect fields, stage, rollout targets, check dates, delete. */
  canManage: boolean
  /** Any member: record checks, rollout status, photos. */
  canTrack: boolean
}

export interface ImprovementBoard {
  items: ImprovementItem[]
  summary: ImprovementSummary
  rolloutNames: string[]
  permissions: BoardPermissions
}

/**
 * The scalar fields edited in the detail dialog (saved together with the
 * footer button). Numbers are kept as the typed text so a half-typed "12."
 * is not lost; they are parsed on save.
 */
export interface ImprovementForm {
  metricCategory: string
  metricName: string
  metricUnit: string
  direction: string
  baselineValue: string
  targetValue: string
  resultValue: string
  annualEffectYen: string
  manualLink: string
  standardizedAt: string
  releaseDate: string
  poNote: string
}

const numText = (v: number | null) => (v === null ? "" : String(v))
const dayText = (v: string | null) => (v ? v.slice(0, 10) : "")

export function toForm(item: ImprovementItem): ImprovementForm {
  return {
    metricCategory: item.metricCategory ?? "",
    metricName: item.metricName ?? "",
    metricUnit: item.metricUnit ?? "",
    direction: item.direction === "increase" ? "increase" : "decrease",
    baselineValue: numText(item.baselineValue),
    targetValue: numText(item.targetValue),
    resultValue: numText(item.resultValue),
    annualEffectYen: numText(item.annualEffectYen),
    manualLink: item.manualLink ?? "",
    standardizedAt: dayText(item.standardizedAt),
    releaseDate: dayText(item.releaseDate),
    poNote: item.poNote ?? "",
  }
}

/** "1,200.5" / "１２" → number; "" → null; anything else → NaN (invalid). */
export function parseNumberText(text: string): number | null {
  const normalized = text
    .trim()
    .replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/,/g, "")
  if (normalized === "") return null
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN
}

export type NumberField = "baselineValue" | "targetValue" | "resultValue" | "annualEffectYen"
export const NUMBER_FIELDS: readonly NumberField[] = ["baselineValue", "targetValue", "resultValue", "annualEffectYen"]

/** Number fields whose text is not a valid (for money: whole, non-negative) number. */
export function invalidNumberFields(form: ImprovementForm): NumberField[] {
  return NUMBER_FIELDS.filter((f) => {
    const v = parseNumberText(form[f])
    if (v === null) return false
    if (Number.isNaN(v)) return true
    return f === "annualEffectYen" && (!Number.isInteger(v) || v < 0)
  })
}

const orNull = (s: string) => (s.trim() === "" ? null : s.trim())

const TO_API: { [K in keyof ImprovementForm]: (v: string) => unknown } = {
  metricCategory: orNull,
  metricName: orNull,
  metricUnit: orNull,
  direction: (v) => v,
  baselineValue: parseNumberText,
  targetValue: parseNumberText,
  resultValue: parseNumberText,
  annualEffectYen: parseNumberText,
  manualLink: orNull,
  standardizedAt: (v) => v,
  releaseDate: (v) => v,
  poNote: (v) => (v === "" ? null : v),
}

/**
 * PATCH body: only the fields changed since `saved` (so an untouched field
 * never overwrites what the server derived, e.g. the default 標準化日).
 * Call only when invalidNumberFields(form) is empty.
 */
export function toPatch(form: ImprovementForm, saved: ImprovementForm): Record<string, unknown> {
  const keys = (Object.keys(TO_API) as Array<keyof ImprovementForm>).filter((k) => form[k] !== saved[k])
  return Object.fromEntries(keys.map((k) => [k, TO_API[k](form[k])]))
}

/** Next 定着確認 without a result (earliest due first), or null. */
export function nextOpenCheck(item: Pick<ImprovementItem, "checks">): ImprovementCheck | null {
  return item.checks.filter((c) => !c.checkedAt).toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
}

/** Board grouping: items per stage (unknown stages count as 効果確認中), in the loaded order. */
export function groupByStage(items: readonly ImprovementItem[], stages: readonly string[]): Map<string, ImprovementItem[]> {
  const groups = new Map<string, ImprovementItem[]>(stages.map((s) => [s, []]))
  for (const item of items) {
    const key = groups.has(item.kaizenStage) ? item.kaizenStage : "measuring"
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}
