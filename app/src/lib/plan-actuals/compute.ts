/**
 * Actuals of a finished project, leaf by leaf (plan 12 §2.2 / §2.4, E1). Pure and deterministic: the service reads
 * the plan, the change history, the tasks and the Git links, and these functions turn them into the frozen numbers
 * of `plan_actuals_item` / `_pbi` / `_repo`. Dates are "YYYY-MM-DD" (UTC calendar days); with `skipWeekends` every
 * count is in Monday–Friday days, the same way the plan was placed.
 *
 * Unknown stays unknown: a value that cannot be measured is null, never 0 (plan 12 §2.2, "MR の欄は null にする").
 */
import { dayNumber, dateKeyOf } from "@/lib/plan-estimate/dates"

/** Working hours per person-day (plan 12 §9 Q1). */
export const HOURS_PER_DAY = 7.5
/** `loadObserved` is clamped to 0..this. */
export const LOAD_OBSERVED_MAX = 1.5
/** An actual span above this many times the baseline is flagged (and not learned from). */
export const ACTUAL_OVER_BASELINE_MAX = 5
/** Guard for day-by-day loops (the plan's own maximum span). */
const MAX_SPAN_DAYS = 3650
const HOUR_MS = 3_600_000

const isWeekendDay = (day: number): boolean => {
  const w = (((day + 4) % 7) + 7) % 7
  return w === 0 || w === 6
}

/** Days in the inclusive range [start, end] (Mon–Fri only with skipWeekends); 0 when end < start. */
export function spanDays(start: string, end: string, skipWeekends: boolean): number {
  const from = dayNumber(start)
  const to = dayNumber(end)
  if (to < from) return 0
  if (!skipWeekends) return to - from + 1
  let n = 0
  for (let d = from; d <= to && d - from <= MAX_SPAN_DAYS; d++) if (!isWeekendDay(d)) n++
  return n
}

/** Signed difference `to − from` in days (working days with skipWeekends): positive = `to` is later. */
export function dayDiff(from: string, to: string, skipWeekends: boolean): number {
  if (from === to) return 0
  const a = dayNumber(from)
  const b = dayNumber(to)
  // Count the days strictly after the earlier one up to and including the later one.
  const later = dateKeyOf(Math.max(a, b))
  const afterEarlier = dateKeyOf(Math.min(a, b) + 1)
  const n = spanDays(afterEarlier, later, skipWeekends)
  return b > a ? n : -n
}

export type ActualsIssueKind =
  | "missing_actual"
  | "start_after_end"
  | "actual_over_baseline"
  /** The actual span has no working day (e.g. a weekend with skipWeekends). */
  | "empty_span"
  /** No baseline: the planned dates may have been moved to match reality, so no ratio is learned. */
  | "missing_baseline"
  /** A status change of the leaf could not be read: on-hold days are unknown. */
  | "history_unreadable"

export interface ActualsIssue {
  planItemId: string
  kind: ActualsIssueKind
}

/** One leaf of the plan as the service reads it (dates already as day keys). */
export interface LeafInput {
  planItemId: string
  templateKey: string | null
  name: string
  /** templateKey of the parent (null at the top or for hand-made parents). */
  parentKey: string | null
  isMilestone: boolean
  /** The schedule item's `durationDays` at load time (null for hand-made rows). */
  templateDays: number | null
  baselineStart: string | null
  baselineEnd: string | null
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  ownerId: string | null
  /** The schedule item's role (from the loaded content), if any. */
  role: string | null
  /** Current status (PLAN_STATUSES). */
  status: string
  /** Leaves this one depends on (finish to start). */
  predecessorIds: readonly string[]
}

/** A status change of the leaf (from the activity log), oldest first. */
export interface StatusChange {
  at: string
  from: string | null
  to: string | null
}

export interface LeafContext {
  skipWeekends: boolean
  /** Actual end of every leaf of the project (for the wait gap). */
  actualEndById: ReadonlyMap<string, string | null>
  statusHistory: readonly StatusChange[]
  /** Some status-change row of the leaf could not be read: on-hold days are unknown (never a confident 0). */
  historyUnreadable?: boolean
  /**
   * Actual spans of the OTHER leaves the same owner held, in any project. Only the spans — never which project or
   * item (plan 12 §2.2: other projects' names are not stored).
   */
  ownerIntervals: readonly { start: string; end: string }[]
  /** The owner's other spans could not all be read (a read limit was hit): concurrency is unknown. */
  ownerIntervalsIncomplete?: boolean
}

export interface LeafActuals {
  plannedDays: number | null
  actualDays: number | null
  /** Usable for learning: both actual dates, start ≤ end, not over 5 × baseline. */
  complete: boolean
  startSlipDays: number | null
  endSlipDays: number | null
  waitGapDays: number | null
  onHoldDays: number | null
  ownerConcurrentAvg: number | null
  ownerConcurrentPeak: number | null
  issues: ActualsIssue[]
}

/** On-hold days inside [start, end], reconstructed from the status changes; null when it cannot be told. */
export function onHoldDays(start: string, end: string, history: readonly StatusChange[], currentStatus: string, skipWeekends: boolean): number | null {
  if (history.length === 0) {
    // No change recorded: the status was what it is now the whole time — unless that is on_hold, where we cannot
    // tell since when (plan 12 §2.2: null rather than a guess).
    return currentStatus === "on_hold" ? null : 0
  }
  const from = dayNumber(start)
  const to = dayNumber(end)
  if (to < from) return null
  const changes = history.map((h) => ({ day: dayNumber(h.at), to: h.to }))
  // The status before the first recorded change is that change's `from`.
  let status = history[0].from
  let i = 0
  while (i < changes.length && changes[i].day < from) status = changes[i++].to
  let n = 0
  for (let d = from; d <= to && d - from <= MAX_SPAN_DAYS; d++) {
    // A change on day d takes effect that day (the last change of the day wins).
    while (i < changes.length && changes[i].day === d) status = changes[i++].to
    if (status === "on_hold" && !(skipWeekends && isWeekendDay(d))) n++
  }
  return n
}

/** Average and peak number of leaves the owner held per (working) day of `[start, end]`, this one included. */
export function ownerConcurrency(start: string, end: string, others: readonly { start: string; end: string }[], skipWeekends: boolean): { avg: number; peak: number } | null {
  const from = dayNumber(start)
  const to = dayNumber(end)
  if (to < from) return null
  const spans = others.map((o) => [dayNumber(o.start), dayNumber(o.end)] as const).filter(([a, b]) => b >= a && b >= from && a <= to)
  let days = 0
  let total = 0
  let peak = 0
  for (let d = from; d <= to && d - from <= MAX_SPAN_DAYS; d++) {
    if (skipWeekends && isWeekendDay(d)) continue
    let c = 1
    for (const [a, b] of spans) if (a <= d && d <= b) c++
    days++
    total += c
    peak = Math.max(peak, c)
  }
  if (days === 0) return null
  return { avg: Math.round((total / days) * 100) / 100, peak }
}

/** The frozen numbers of one leaf (plan 12 §2.2 table). */
export function computeLeafActuals(leaf: Readonly<LeafInput>, ctx: Readonly<LeafContext>): LeafActuals {
  const { skipWeekends } = ctx
  const issues: ActualsIssue[] = []
  const issue = (kind: ActualsIssueKind) => issues.push({ planItemId: leaf.planItemId, kind })
  // The baseline only: the current plan may have been moved to match what happened (then the ratio says nothing).
  const baseStart = leaf.baselineStart
  const baseEnd = leaf.baselineEnd
  const plannedDays = baseStart && baseEnd ? spanDays(baseStart, baseEnd, skipWeekends) : null
  if (plannedDays === null) issue("missing_baseline")
  const { actualStart, actualEnd } = leaf
  if (!actualStart || !actualEnd) issue("missing_actual")
  const ordered = actualStart && actualEnd ? dayNumber(actualStart) <= dayNumber(actualEnd) : false
  if (actualStart && actualEnd && !ordered) issue("start_after_end")
  const actualDays = actualStart && actualEnd && ordered ? spanDays(actualStart, actualEnd, skipWeekends) : null
  // A span with no working day (actual or baseline) gives no ratio to learn (and would divide by zero).
  if (actualDays === 0 || plannedDays === 0) issue("empty_span")
  if (actualDays !== null && plannedDays !== null && plannedDays > 0 && actualDays > ACTUAL_OVER_BASELINE_MAX * plannedDays) issue("actual_over_baseline")
  if (ctx.historyUnreadable) issue("history_unreadable")

  let waitGapDays: number | null = null
  if (actualStart && ordered && leaf.predecessorIds.length > 0) {
    const ends = leaf.predecessorIds.map((id) => ctx.actualEndById.get(id) ?? null)
    // One predecessor without an actual end makes the wait unknown (it may have ended later than the others).
    if (ends.every((e): e is string => e !== null)) {
      const lastEnd = Math.max(...ends.map(dayNumber))
      const firstWaitDay = dateKeyOf(lastEnd + 1)
      const dayBefore = dateKeyOf(dayNumber(actualStart) - 1)
      waitGapDays = dayNumber(actualStart) > lastEnd + 1 ? spanDays(firstWaitDay, dayBefore, skipWeekends) : 0
    }
  }

  const concurrency =
    leaf.ownerId && actualStart && actualEnd && ordered && !ctx.ownerIntervalsIncomplete ? ownerConcurrency(actualStart, actualEnd, ctx.ownerIntervals, skipWeekends) : null

  return {
    plannedDays,
    actualDays,
    complete: issues.length === 0,
    startSlipDays: baseStart && actualStart ? dayDiff(baseStart, actualStart, skipWeekends) : null,
    endSlipDays: baseEnd && actualEnd ? dayDiff(baseEnd, actualEnd, skipWeekends) : null,
    waitGapDays,
    onHoldDays: actualStart && actualEnd && ordered && !ctx.historyUnreadable ? onHoldDays(actualStart, actualEnd, ctx.statusHistory, leaf.status, skipWeekends) : null,
    ownerConcurrentAvg: concurrency?.avg ?? null,
    ownerConcurrentPeak: concurrency?.peak ?? null,
    issues,
  }
}

// ---------------------------------------------------------------- merge requests (§2.4) ----------------------------

/** A merge-request link of one PBI (any repository bound to the project). */
export interface MrLinkInput {
  repositoryId: string
  state: string | null
  openedAt: Date | null
  mergedAt: Date | null
  versionCount: number | null
  additions: number | null
  deletions: number | null
}

export interface RepoInput {
  repositoryId: string
  /** Shown on the evidence screen only to readers who can read the repository (plan 12 §4). */
  repositoryRef: string
  /** False when the repository could not be read when finalizing (its numbers are unknown, not zero). */
  readable: boolean
}

export interface RepoBreakdown {
  repositoryId: string
  repositoryRef: string
  mrCount: number | null
  leadTimeP50Hours: number | null
  additions: number | null
  deletions: number | null
  versionCount: number | null
}

export interface PbiMrFacts {
  /** Merged MRs of the PBI across every readable repository; null when a bound repository could not be read. */
  mrCount: number | null
  /** Set lead time: last merge of the set − first open of the set (plan 12 §9 Q10); null when not measurable. */
  mrSetLeadTimeHours: number | null
  repos: RepoBreakdown[]
}

/** Hours from a to b; null when b is before a (clock skew / bad data — never a negative lead time). */
const hoursBetween = (a: Date, b: Date): number | null => {
  const h = Math.round(((b.getTime() - a.getTime()) / HOUR_MS) * 10) / 10
  return h < 0 ? null : h
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((x, y) => x - y)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10
}

/** Sum, or null when any value is unknown (an unknown never counts as 0). */
function sumOrNull(values: readonly (number | null)[]): number | null {
  if (values.length === 0) return null
  return values.some((v) => v === null) ? null : (values as number[]).reduce((a, b) => a + b, 0)
}

/**
 * The PBI's MR set (plan 12 §2.4): its merged MRs in every repository bound to the project. MRs closed without
 * merging are not part of it; the same PBI in two repositories is ONE set. A repository that could not be read makes
 * the set's numbers unknown (null) — and its own row says so — instead of silently counting fewer MRs.
 */
export function pbiMrFacts(links: readonly MrLinkInput[], repos: readonly RepoInput[]): PbiMrFacts {
  // No repository bound: nothing was measured (not "zero MRs").
  if (repos.length === 0) return { mrCount: null, mrSetLeadTimeHours: null, repos: [] }
  const merged = links.filter((l) => l.state === "merged" && l.mergedAt !== null)
  // A merged MR without a merge time cannot be placed in the set: the set is unknown.
  const mergedWithoutTime = links.some((l) => l.state === "merged" && l.mergedAt === null)
  const breakdown: RepoBreakdown[] = []
  for (const repo of repos) {
    const mine = merged.filter((l) => l.repositoryId === repo.repositoryId)
    if (!repo.readable) {
      // Whether or not a link of this PBI is known there: its MRs in that repository are unknown.
      breakdown.push({ repositoryId: repo.repositoryId, repositoryRef: repo.repositoryRef, mrCount: null, leadTimeP50Hours: null, additions: null, deletions: null, versionCount: null })
      continue
    }
    if (mine.length === 0) continue
    const leads = mine.map((l) => (l.openedAt ? hoursBetween(l.openedAt, l.mergedAt as Date) : null))
    breakdown.push({
      repositoryId: repo.repositoryId,
      repositoryRef: repo.repositoryRef,
      mrCount: mine.length,
      leadTimeP50Hours: leads.some((l) => l === null) ? null : median(leads as number[]),
      additions: sumOrNull(mine.map((l) => l.additions)),
      deletions: sumOrNull(mine.map((l) => l.deletions)),
      versionCount: sumOrNull(mine.map((l) => l.versionCount)),
    })
  }
  const unknown = mergedWithoutTime || repos.some((r) => !r.readable)
  // Links to a repository no longer bound to the project are not counted (it is not part of the project now).
  const inSet = merged.filter((l) => repos.some((r) => r.repositoryId === l.repositoryId))
  const allOpened = inSet.every((l) => l.openedAt !== null)
  const lead =
    !unknown && inSet.length > 0 && allOpened
      ? hoursBetween(new Date(Math.min(...inSet.map((l) => (l.openedAt as Date).getTime()))), new Date(Math.max(...inSet.map((l) => (l.mergedAt as Date).getTime()))))
      : null
  return { mrCount: unknown ? null : inSet.length, mrSetLeadTimeHours: lead, repos: breakdown }
}

/** A repository is unreadable at finalize time when it never synced, its last sync failed, or a GitStation re-read is pending. */
export function repositoryReadable(r: { syncedAt: Date | null; lastErrorAt: Date | null; stationRereadAt: Date | null }): boolean {
  if (!r.syncedAt) return false
  if (r.lastErrorAt && r.lastErrorAt.getTime() >= r.syncedAt.getTime()) return false
  return r.stationRereadAt === null
}

// ---------------------------------------------------------------- tasks -----------------------------------------------

export interface TaskInput {
  estimatedHours: number | null
  actualHours: number | null
  /** The task has a carried-over copy in a later sprint (its estimate then counts there, not here). */
  hasCarriedCopy: boolean
}

/**
 * Effort and estimate of one PBI from its sprint tasks. Null when there are no tasks, or when ANY counted task has no
 * recorded hours (a partial sum would understate the effort and look measured).
 */
export function pbiHours(tasks: readonly TaskInput[]): { effortHours: number | null; estimatedHours: number | null } {
  const round = (n: number) => Math.round(n * 100) / 100
  const total = (values: readonly (number | null)[]): number | null => {
    if (values.length === 0 || values.some((h) => h === null || !Number.isFinite(h))) return null
    return round((values as number[]).reduce((a, b) => a + b, 0))
  }
  // A carried-over task's estimate moved with its copy; its spent hours stay where they were spent.
  return {
    effortHours: total(tasks.map((t) => t.actualHours)),
    estimatedHours: total(tasks.filter((t) => !t.hasCarriedCopy).map((t) => t.estimatedHours)),
  }
}

/** Times the PBI went from done back to another status (from its activity log, oldest first). */
export function pbiReopenCount(statusChanges: readonly { from: string | null; to: string | null }[]): number {
  return statusChanges.filter((c) => c.from === "done" && c.to !== null && c.to !== "done").length
}

/** loadObserved = effort ÷ (actual days × 7.5 h), clamped to 0..1.5; null when either side is unknown. */
export function loadObserved(effortHours: number | null, actualDays: number | null): number | null {
  if (effortHours === null || actualDays === null || actualDays <= 0) return null
  const v = effortHours / (actualDays * HOURS_PER_DAY)
  return Math.round(Math.min(LOAD_OBSERVED_MAX, Math.max(0, v)) * 100) / 100
}
