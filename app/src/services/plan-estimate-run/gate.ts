/**
 * The per-lineage default (plan 12 §5): durations from actuals are proposed only for a lineage where the backtest
 * (plan_estimate_eval, written by services/plan-estimate-eval after every actuals finalize and on an administrator's
 * request) shows the method beating the template, AND an administrator approved the lineage for the current method
 * (plan_estimate_gate_approval; plan 12 §8 item 6: real data turns the default on only after a person looked at it).
 * Without both the run keeps the template's durations and says why — lesson rules and levelling still apply.
 *
 * The backtest passes when the latest record of the lineage for the current method has: n ≥ 5 projects,
 * MAPE ≤ 0.85 × the template's, P80 hit rate within 0.70–0.90, and an end-date error no worse than the template's.
 */
import { ESTIMATE_METHOD_VERSION } from "@/lib/plan-estimate"
import { defaultDb, type Db } from "@/services/_shared/db"

export type GateReason = "no_backtest" | "not_enough_actuals" | "not_better_than_template" | "p80_out_of_range" | "end_error_worse" | "not_approved"

export interface Gate {
  on: boolean
  /** Why the template's durations are used (null when on). */
  reason: GateReason | null
}

export const GATE_MIN_PROJECTS = 5
export const GATE_MAPE_RATIO = 0.85
export const GATE_P80_RANGE: readonly [number, number] = [0.7, 0.9]

export interface EvalRecord {
  n: number
  mape: number
  mapeTemplate: number
  p80Hit: number
  endErrorDays: number
  endErrorTemplateDays: number
}

/** Pure decision on one backtest record (null = none). Says whether the backtest passes, not whether it is approved. */
export function decideGate(record: EvalRecord | null): Gate {
  if (!record) return { on: false, reason: "no_backtest" }
  if (record.n < GATE_MIN_PROJECTS) return { on: false, reason: "not_enough_actuals" }
  if (!(record.mape <= GATE_MAPE_RATIO * record.mapeTemplate)) return { on: false, reason: "not_better_than_template" }
  if (record.p80Hit < GATE_P80_RANGE[0] || record.p80Hit > GATE_P80_RANGE[1]) return { on: false, reason: "p80_out_of_range" }
  if (record.endErrorDays > record.endErrorTemplateDays) return { on: false, reason: "end_error_worse" }
  return { on: true, reason: null }
}

/** A passing backtest still waits for an approval of the current method (a failing one keeps its own reason). */
export function withApproval(gate: Gate, approved: boolean): Gate {
  return gate.on && !approved ? { on: false, reason: "not_approved" } : gate
}

const EVAL_SELECT = { n: true, mape: true, mapeTemplate: true, p80Hit: true, endErrorDays: true, endErrorTemplateDays: true } as const

/** The latest backtest record of the lineage for the current method (null = none). */
export async function latestEval(lineage: string, db: Db = defaultDb): Promise<(EvalRecord & { id: string; evaluatedOn: Date }) | null> {
  return db.planEstimateEval.findFirst({
    where: { lineage, methodVersion: ESTIMATE_METHOD_VERSION },
    orderBy: [{ evaluatedOn: "desc" }, { createdAt: "desc" }],
    select: { id: true, evaluatedOn: true, ...EVAL_SELECT },
  })
}

export async function isApproved(lineage: string, db: Db = defaultDb): Promise<boolean> {
  const row = await db.planEstimateGateApproval.findUnique({ where: { lineage }, select: { methodVersion: true } })
  return row?.methodVersion === ESTIMATE_METHOD_VERSION
}

export async function gateFor(lineage: string, db: Db = defaultDb): Promise<Gate> {
  const [record, approved] = await Promise.all([latestEval(lineage, db), isApproved(lineage, db)])
  return withApproval(decideGate(record), approved)
}
