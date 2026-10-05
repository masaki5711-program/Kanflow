/**
 * Pure read-model math of the マイルストーン・検収ボード (client-safe):
 * the summary strip numbers, the 検収完了 rule and the next milestone.
 * Dates are "YYYY-MM-DD" calendar keys; `todayKey` is Asia/Tokyo.
 */
import type { CheckResult, PunchStatus } from "./constants"

export interface StageLike {
  id: string
  name: string
  status: string
  /** computeScheduleState of the plan item (delayed = late). */
  scheduleState: string
  plannedEnd: string | null
  isMilestone: boolean
  /** Sub-steps (children) in display order; milestones among them count for 「次のマイルストーン」. */
  steps: ReadonlyArray<{ id: string; name: string; status: string; plannedEnd: string | null; isMilestone: boolean }>
}

export interface NextMilestone {
  /** The top-level stage to open. */
  stageId: string
  /** The milestone itself (the stage or one of its steps). */
  id: string
  name: string
  date: string | null
}

export interface StageSummary {
  total: number
  done: number
  late: number
  undated: number
  next: NextMilestone | null
}

/** First not-done milestone (a stage or one of its steps) in plan order; else the first not-done stage. */
export function nextMilestone(stages: readonly StageLike[]): NextMilestone | null {
  for (const s of stages) {
    const candidates = [s, ...s.steps]
    const hit = candidates.find((c) => c.isMilestone && c.status !== "done")
    if (hit) return { stageId: s.id, id: hit.id, name: hit.name, date: hit.plannedEnd }
  }
  const open = stages.find((s) => s.status !== "done")
  return open ? { stageId: open.id, id: open.id, name: open.name, date: open.plannedEnd } : null
}

export function summarizeStages(stages: readonly StageLike[]): StageSummary {
  return {
    total: stages.length,
    done: stages.filter((s) => s.status === "done").length,
    late: stages.filter((s) => s.scheduleState === "delayed").length,
    undated: stages.filter((s) => s.plannedEnd === null).length,
    next: nextMilestone(stages),
  }
}

export interface CheckSummary {
  total: number
  /** 合格 + 条件付き合格. */
  passed: number
  conditional: number
  failed: number
  pending: number
  /** 検収完了: at least one check and every check 合格 / 条件付き合格. */
  complete: boolean
}

export function summarizeChecks(checks: ReadonlyArray<{ result: string | null }>): CheckSummary {
  const count = (r: CheckResult) => checks.filter((c) => c.result === r).length
  const conditional = count("conditional")
  const passed = count("passed") + conditional
  const failed = count("failed")
  const pending = checks.length - passed - failed
  return { total: checks.length, passed, conditional, failed, pending, complete: checks.length > 0 && passed === checks.length }
}

export interface PunchSummary {
  total: number
  /** Not done (open + in progress). */
  open: number
  /** Not done and past the due day. */
  overdue: number
  done: number
}

export function isPunchOverdue(p: { status: string; dueDate: string | null }, todayKey: string): boolean {
  return p.status !== ("done" satisfies PunchStatus) && p.dueDate !== null && p.dueDate < todayKey
}

export function summarizePunch(items: ReadonlyArray<{ status: string; dueDate: string | null }>, todayKey: string): PunchSummary {
  const done = items.filter((p) => p.status === "done").length
  return { total: items.length, open: items.length - done, overdue: items.filter((p) => isPunchOverdue(p, todayKey)).length, done }
}

export interface BudgetSummary {
  enabled: boolean
  planned: number
  actual: number
  /** actual − planned (positive = over budget); null without any amount. */
  variance: number | null
}

export function summarizeBudget(enabled: boolean, lines: ReadonlyArray<{ plannedYen: number | null; actualYen: number | null }>): BudgetSummary {
  const planned = lines.reduce((sum, l) => sum + (l.plannedYen ?? 0), 0)
  const actual = lines.reduce((sum, l) => sum + (l.actualYen ?? 0), 0)
  const any = lines.some((l) => l.plannedYen !== null || l.actualYen !== null)
  return { enabled, planned, actual, variance: any ? actual - planned : null }
}

export interface BoardSummary {
  stages: StageSummary
  checks: CheckSummary
  punch: PunchSummary
  documents: { received: number; total: number }
  budget: BudgetSummary
}

export interface SummaryInput {
  stages: readonly StageLike[]
  checks: ReadonlyArray<{ result: string | null }>
  punchItems: ReadonlyArray<{ status: string; dueDate: string | null }>
  documents: ReadonlyArray<{ status: string }>
  budgetEnabled: boolean
  budgetLines: ReadonlyArray<{ plannedYen: number | null; actualYen: number | null }>
}

export function summarizeBoard(input: SummaryInput, todayKey: string): BoardSummary {
  return {
    stages: summarizeStages(input.stages),
    checks: summarizeChecks(input.checks),
    punch: summarizePunch(input.punchItems, todayKey),
    documents: { received: input.documents.filter((d) => d.status === "received").length, total: input.documents.length },
    budget: summarizeBudget(input.budgetEnabled, input.budgetLines),
  }
}

/** A metric value is on the good side of the target (null without a target / value). */
export function metricOnTarget(direction: string, value: number | null, target: number | null): boolean | null {
  if (value === null || target === null) return null
  return direction === "increase" ? value >= target : value <= target
}
