/**
 * Pure portfolio aggregation (no I/O): sprint burn series, velocity trend,
 * master-plan summary and the "needs attention" rule. Days are Tokyo
 * calendar days.
 */
import type { PortfolioPlan, Severity, VelocityTrend } from "./portfolio.types"

const DAY_MS = 86_400_000
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000
/** Longest burn series drawn (a sprint is normally 1-4 weeks). */
export const BURN_MAX_DAYS = 60
/** Velocity counts as rising / falling beyond ±10 % of the earlier average. */
const TREND_TOLERANCE = 0.1
/** A plan leaf is "at risk" when its progress trails the elapsed share of its window by more than this. */
const AT_RISK_GAP = 0.2

/** Tokyo calendar day number of an instant. */
export function tokyoDay(d: Date): number {
  return Math.floor((d.getTime() + TOKYO_OFFSET_MS) / DAY_MS)
}

export function daysLeft(today: Date, end: Date): number {
  return tokyoDay(end) - tokyoDay(today)
}

export interface BurnTask {
  status: string
  completedAt: Date | null
}

/**
 * Remaining tasks at the end of each day, from the sprint start through
 * min(today, end) — the "actual" line of a burndown. A task counts as done
 * on the day of its completedAt (done without a date: done from the start).
 */
export function sprintBurn(tasks: readonly BurnTask[], start: Date, end: Date, today: Date): number[] {
  const first = tokyoDay(start)
  const last = Math.min(tokyoDay(end), tokyoDay(today), first + BURN_MAX_DAYS - 1)
  if (last < first) return [tasks.length]
  const doneDays = tasks.filter((t) => t.status === "done").map((t) => (t.completedAt ? tokyoDay(t.completedAt) : first))
  const out: number[] = []
  for (let day = first; day <= last; day++) out.push(tasks.length - doneDays.filter((d) => d <= day).length)
  return out
}

/** Last value against the mean of the earlier ones; null with fewer than 2 values. */
export function velocityTrend(points: readonly number[]): VelocityTrend | null {
  if (points.length < 2) return null
  const earlier = points.slice(0, -1)
  const mean = earlier.reduce((a, b) => a + b, 0) / earlier.length
  const last = points[points.length - 1]
  if (mean === 0) return last > 0 ? "up" : "flat"
  const change = (last - mean) / mean
  if (change > TREND_TOLERANCE) return "up"
  if (change < -TREND_TOLERANCE) return "down"
  return "flat"
}

export interface PlanRow {
  id: string
  parentId: string | null
  progressPct: number
  plannedStart: Date
  plannedEnd: Date
  status: string
}

function isDone(p: PlanRow): boolean {
  return p.status === "done" || p.progressPct >= 100
}

function planState(p: PlanRow, todayDay: number): "delayed" | "at_risk" | "ok" {
  if (isDone(p)) return "ok"
  const [start, end] = [tokyoDay(p.plannedStart), tokyoDay(p.plannedEnd)]
  if (end < todayDay) return "delayed"
  if (todayDay < start) return "ok"
  const elapsed = (todayDay - start + 1) / (end - start + 1)
  return p.progressPct / 100 < elapsed - AT_RISK_GAP ? "at_risk" : "ok"
}

/**
 * Master-plan summary of one project: progress = top-level items weighted by
 * planned duration (parents already roll up their children); delayed /
 * at-risk are counted on leaves only, so a late subtree counts once per leaf.
 */
export function planSummary(items: readonly PlanRow[], today: Date): PortfolioPlan {
  if (items.length === 0) return { progressPct: null, delayed: 0, atRisk: 0, total: 0 }
  const ids = new Set(items.map((i) => i.id))
  const parents = new Set(items.map((i) => i.parentId).filter((p): p is string => !!p && ids.has(p)))
  const roots = items.filter((i) => !i.parentId || !ids.has(i.parentId))
  const weight = (i: PlanRow) => Math.max(1, tokyoDay(i.plannedEnd) - tokyoDay(i.plannedStart) + 1)
  const totalWeight = roots.reduce((n, r) => n + weight(r), 0)
  const progressPct = Math.round(roots.reduce((n, r) => n + Math.min(100, Math.max(0, r.progressPct)) * weight(r), 0) / totalWeight)
  const todayDay = tokyoDay(today)
  const leaves = items.filter((i) => !parents.has(i.id))
  const states = leaves.map((l) => planState(l, todayDay))
  return {
    progressPct,
    delayed: states.filter((s) => s === "delayed").length,
    atRisk: states.filter((s) => s === "at_risk").length,
    total: items.length,
  }
}

export function needsAttention(row: { surveillance: { severity: Severity } | null; overdueTasks: number; plan: PortfolioPlan }): boolean {
  return row.surveillance?.severity === "critical" || row.overdueTasks > 0 || row.plan.delayed > 0
}
