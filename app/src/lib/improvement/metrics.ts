/**
 * Pure math of the 改善成果ボード: achievement rate (達成率), worsening,
 * the board summary and 定着確認 due dates. Shared by the service, the
 * Excel export and the UI.
 */
import { BOARD_STAGES, KAIZEN_STAGES, type KaizenStage, type MetricDirection } from "./constants"

/** Upper clamp of the achievement rate (200 % = twice the planned gain). */
export const MAX_ACHIEVEMENT_RATE = 2

export interface MetricValues {
  direction: string
  baselineValue: number | null
  targetValue: number | null
  resultValue: number | null
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v)

/** True when `a` is at least as good as `b` in the metric's direction. */
function atLeastAsGood(a: number, b: number, direction: string): boolean {
  return direction === "increase" ? a >= b : a <= b
}

/**
 * 達成率 = achieved gain / planned gain:
 *   decrease: (baseline − result) / (baseline − target)
 *   increase: (result − baseline) / (target − baseline)
 * (both are (result − baseline) / (target − baseline)). Clamped to 0..2.
 * null while any of the three values is missing. A zero planned gain
 * (target = baseline) counts 100 % when the result is at least as good as
 * the target, else 0 %.
 */
export function achievementRate(m: MetricValues): number | null {
  const { baselineValue: base, targetValue: target, resultValue: result } = m
  if (!isNum(base) || !isNum(target) || !isNum(result)) return null
  const planned = target - base
  if (planned === 0) return atLeastAsGood(result, target, m.direction) ? 1 : 0
  const rate = (result - base) / planned
  if (!Number.isFinite(rate)) return null
  return Math.min(MAX_ACHIEVEMENT_RATE, Math.max(0, rate))
}

/** The result is worse than before (the change went the wrong way). */
export function isWorsened(m: MetricValues): boolean {
  if (!isNum(m.baselineValue) || !isNum(m.resultValue)) return false
  return m.resultValue !== m.baselineValue && !atLeastAsGood(m.resultValue, m.baselineValue, m.direction)
}

/** The target is not an improvement over the baseline in the chosen direction. */
export function targetContradictsDirection(direction: MetricDirection | string, baseline: number | null, target: number | null): boolean {
  if (!isNum(baseline) || !isNum(target) || baseline === target) return false
  return !atLeastAsGood(target, baseline, direction)
}

export interface SummaryItem extends MetricValues {
  kaizenStage: string
  annualEffectYen: number | null
  rollouts: ReadonlyArray<{ status: string }>
}

export interface ImprovementSummary {
  /** 効果金額合計 (yen / year) of every item except 延期. */
  totalAnnualEffectYen: number
  countByStage: Record<KaizenStage, number>
  /** Items at or past 標準化済み (standardized / deploying / sustained). */
  standardizedCount: number
  rolloutTotal: number
  rolloutDone: number
  /** 横展開完了率 0..1, null without any rollout target. */
  rolloutCompletion: number | null
  /** Mean achievement rate of items that have all three values, null when none. */
  averageAchievement: number | null
  itemCount: number
}

const STANDARDIZED_OR_LATER: ReadonlySet<string> = new Set(BOARD_STAGES.slice(1))

function emptyStageCounts(): Record<KaizenStage, number> {
  return Object.fromEntries(KAIZEN_STAGES.map((s) => [s, 0])) as Record<KaizenStage, number>
}

/** Board summary strip numbers (延期 items count only in their own stage). */
export function summarizeImprovements(items: readonly SummaryItem[]): ImprovementSummary {
  const countByStage = emptyStageCounts()
  let total = 0
  let rolloutTotal = 0
  let rolloutDone = 0
  const rates: number[] = []
  for (const item of items) {
    const stage = (KAIZEN_STAGES as readonly string[]).includes(item.kaizenStage) ? (item.kaizenStage as KaizenStage) : "measuring"
    countByStage[stage] += 1
    if (stage === "deferred") continue
    total += isNum(item.annualEffectYen) ? item.annualEffectYen : 0
    rolloutTotal += item.rollouts.length
    rolloutDone += item.rollouts.filter((r) => r.status === "done").length
    const rate = achievementRate(item)
    if (rate !== null) rates.push(rate)
  }
  return {
    totalAnnualEffectYen: total,
    countByStage,
    standardizedCount: items.filter((i) => STANDARDIZED_OR_LATER.has(i.kaizenStage)).length,
    rolloutTotal,
    rolloutDone,
    rolloutCompletion: rolloutTotal > 0 ? rolloutDone / rolloutTotal : null,
    averageAchievement: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    itemCount: items.length,
  }
}

/**
 * `months` calendar months after a day stored as UTC midnight, clamped to
 * the month's last day (1/31 + 1 month = 2/28 or 2/29).
 */
export function addMonthsUtc(day: Date, months: number): Date {
  const y = day.getUTCFullYear()
  const m = day.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(day.getUTCDate(), lastDay)))
}

/** UTC midnight of the viewer's / server's local calendar day of `now`. */
export function localDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/** A check is due once its day (UTC midnight) is today or earlier (local calendar). */
export function isCheckDue(dueDate: Date | string, now: Date): boolean {
  return new Date(dueDate).getTime() <= localDayUtc(now).getTime()
}
