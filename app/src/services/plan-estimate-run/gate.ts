/**
 * The per-lineage default (plan 12 §5): durations from actuals are proposed only for a lineage where the backtest
 * (plan_estimate_eval, written by services/plan-estimate-eval after every actuals finalize / learning switch and on an
 * administrator's request) shows the method beating the template, AND an administrator approved the lineage for the
 * current method (plan_estimate_gate_approval; plan 12 §8 item 6: real data turns the default on only after a person
 * looked at it). Without both the run keeps the template's durations and says why — lesson rules and levelling still
 * apply.
 *
 * The backtest passes when the latest record of the lineage for the current method has: n ≥ 5 projects,
 * MAPE ≤ 0.85 × the template's, P80 hit rate within 0.70–0.90, and an end-date error no worse than the template's.
 * It must also have been computed from the lineage's CURRENT learnable snapshots (inputHash): a record older than the
 * last finalize / learning switch — the recompute is still queued, or it failed — fails closed.
 */
import { createHash } from "node:crypto"
import { ESTIMATE_METHOD_VERSION } from "@/lib/plan-estimate"
import { defaultDb, type Db } from "@/services/_shared/db"

export type GateReason = "no_backtest" | "not_enough_actuals" | "not_better_than_template" | "p80_out_of_range" | "end_error_worse" | "backtest_outdated" | "not_approved"

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

/** A passing record that is not of the current snapshots fails closed (a failing one keeps its own reason). */
export function withFreshness(gate: Gate, current: boolean): Gate {
  return gate.on && !current ? { on: false, reason: "backtest_outdated" } : gate
}

/** A passing, current backtest still waits for an approval of the current method. */
export function withApproval(gate: Gate, approved: boolean): Gate {
  return gate.on && !approved ? { on: false, reason: "not_approved" } : gate
}

const EVAL_SELECT = { id: true, evaluatedOn: true, n: true, mape: true, mapeTemplate: true, p80Hit: true, endErrorDays: true, endErrorTemplateDays: true, skipped: true, inputHash: true, createdAt: true } as const

export type LatestEval = EvalRecord & { id: string; evaluatedOn: Date; skipped: number | null; inputHash: string | null; createdAt: Date }

/** The latest backtest record of the lineage for the current method (null = none). */
export async function latestEval(lineage: string, db: Db = defaultDb): Promise<LatestEval | null> {
  return db.planEstimateEval.findFirst({
    where: { lineage, methodVersion: ESTIMATE_METHOD_VERSION },
    orderBy: [{ evaluatedOn: "desc" }, { createdAt: "desc" }],
    select: EVAL_SELECT,
  })
}

/** Snapshots a lineage's backtest is computed from (current, included in learning). */
const learnableSnapshots = (lineage: string) => ({ lineage, supersededAt: null, includeInLearning: true }) as const

const hashOf = (rows: readonly { id: string; version: number }[]) =>
  createHash("sha256").update(JSON.stringify(rows.map((r) => [r.id, r.version]))).digest("hex")

/**
 * sha256 of the lineage's learnable snapshots (id + version, sorted): changes with every finalize (a new snapshot), a
 * learning switch (version) and a supersede. Not with confidentiality changes of PBIs (read at use time anyway).
 */
export async function lineageInputHash(lineage: string, db: Db = defaultDb): Promise<string> {
  const rows = await db.planActualsSnapshot.findMany({ where: learnableSnapshots(lineage), select: { id: true, version: true }, orderBy: { id: "asc" } })
  return hashOf(rows)
}

/** lineageInputHash for many lineages in one read. */
export async function lineageInputHashes(lineages: readonly string[], db: Db = defaultDb): Promise<Map<string, string>> {
  if (lineages.length === 0) return new Map()
  const rows = await db.planActualsSnapshot.findMany({ where: { lineage: { in: [...lineages] }, supersededAt: null, includeInLearning: true }, select: { id: true, version: true, lineage: true }, orderBy: { id: "asc" } })
  return new Map(lineages.map((l) => [l, hashOf(rows.filter((r) => r.lineage === l))]))
}

/** The active approval of the lineage (null = none). */
export async function activeApproval(lineage: string, db: Db = defaultDb): Promise<{ id: string; methodVersion: string; approvedAt: Date } | null> {
  return db.planEstimateGateApproval.findFirst({ where: { lineage, endedAt: null }, select: { id: true, methodVersion: true, approvedAt: true } })
}

export async function gateFor(lineage: string, db: Db = defaultDb): Promise<Gate> {
  const [record, approval, hash] = await Promise.all([latestEval(lineage, db), activeApproval(lineage, db), lineageInputHash(lineage, db)])
  const gate = withFreshness(decideGate(record), record?.inputHash === hash)
  return withApproval(gate, approval?.methodVersion === ESTIMATE_METHOD_VERSION)
}
