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
import { isGridParams, type TunedParams } from "@/lib/plan-estimate/params"
import { logger } from "@/lib/logger"
import { defaultDb, type Db } from "@/services/_shared/db"

const log = logger.child({ module: "plan-estimate-run" })

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

const EVAL_SELECT = { id: true, evaluatedOn: true, n: true, mape: true, mapeTemplate: true, p80Hit: true, endErrorDays: true, endErrorTemplateDays: true, skipped: true, inputHash: true, paramApprovalId: true, createdAt: true } as const

export type LatestEval = EvalRecord & { id: string; evaluatedOn: Date; skipped: number | null; inputHash: string | null; paramApprovalId: string | null; createdAt: Date }

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

export interface ActiveParams {
  id: string
  methodVersion: string
  approvedAt: Date
  params: TunedParams
}

/**
 * The lineage's active approved estimator settings (plan_estimate_param_approval), whatever their method (null =
 * none). A READ: it never writes. A stored value outside the search grid is a broken invariant (only grid values are
 * ever written): it is never used — logged with its id, and null is returned so the lineage uses the defaults (fail
 * closed) — and it is ended by `endInvalidParamApproval`, under the lineage's lock, on the backtest path (finalize,
 * the daily catch-up, a recompute) or before an administrator's approval.
 */
export async function activeParamApproval(lineage: string, db: Db = defaultDb): Promise<ActiveParams | null> {
  const row = await db.planEstimateParamApproval.findFirst({ where: { lineage, endedAt: null }, select: { id: true, methodVersion: true, approvedAt: true, params: true } })
  if (!row) return null
  if (isGridParams(row.params)) return { id: row.id, methodVersion: row.methodVersion, approvedAt: row.approvedAt, params: row.params }
  log.error("approved estimator settings are outside the search grid; not used, the lineage uses the defaults until the next backtest ends them", { lineage, paramApprovalId: row.id, methodVersion: row.methodVersion })
  return null
}

/**
 * When to end a lineage's active approval: `now`, but after its approval and after every earlier end of the lineage
 * ((lineage, endedAt) is unique, NULLS NOT DISTINCT: two ends at the same instant would collide). Under the lock.
 */
export async function paramApprovalEndTime(lineage: string, approvedAt: Date, now: Date, tx: Db): Promise<Date> {
  const last = await tx.planEstimateParamApproval.aggregate({ where: { lineage }, _max: { endedAt: true } })
  return new Date(Math.max(now.getTime(), approvedAt.getTime() + 1, (last._max.endedAt?.getTime() ?? 0) + 1))
}

/**
 * End the lineage's active approval when its stored settings are outside the search grid (reason "failed"). The caller
 * holds the lineage's advisory lock (`plan_estimate_eval:<lineage>`) in `tx`. The ended row — endedAt, endReason, never
 * deleted — is the audit record (an approval belongs to a lineage, not to a project, so there is no project history to
 * write to); the warning log carries the id. Returns the id it ended (null = nothing to end).
 */
export async function endInvalidParamApproval(lineage: string, tx: Db, now: Date = new Date()): Promise<string | null> {
  const row = await tx.planEstimateParamApproval.findFirst({ where: { lineage, endedAt: null }, select: { id: true, approvedAt: true, params: true } })
  if (!row || isGridParams(row.params)) return null
  const endedAt = await paramApprovalEndTime(lineage, row.approvedAt, now, tx)
  const res = await tx.planEstimateParamApproval.updateMany({ where: { id: row.id, endedAt: null }, data: { endedAt, endReason: "failed" } })
  if (res.count !== 1) return null
  log.warn("approved estimator settings outside the search grid ended; the lineage uses the defaults", { lineage, paramApprovalId: row.id, endReason: "failed", cause: "outside_grid" })
  return row.id
}

/** Active settings that apply to the CURRENT method (an approval of an older method is ignored, and ended by the next backtest). */
export const currentParams = (a: ActiveParams | null): ActiveParams | null => (a && a.methodVersion === ESTIMATE_METHOD_VERSION ? a : null)

/**
 * The gate and the settings a run of the lineage uses, from one set of reads. A record is current when it was computed
 * from the current snapshots AND with the settings that are active now (approving or ending settings makes the old row
 * outdated until a backtest with the new ones is recorded).
 */
export async function gateWithParams(lineage: string, db: Db = defaultDb): Promise<{ gate: Gate; params: ActiveParams | null }> {
  const [record, approval, hash, active] = await Promise.all([latestEval(lineage, db), activeApproval(lineage, db), lineageInputHash(lineage, db), activeParamApproval(lineage, db)])
  const params = currentParams(active)
  const gate = withFreshness(decideGate(record), record?.inputHash === hash && (record?.paramApprovalId ?? null) === (params?.id ?? null))
  return { gate: withApproval(gate, approval?.methodVersion === ESTIMATE_METHOD_VERSION), params }
}

export async function gateFor(lineage: string, db: Db = defaultDb): Promise<Gate> {
  return (await gateWithParams(lineage, db)).gate
}
