/**
 * The administrators' view of the backtest on real actuals (plan 12 §5 / §8 item 6): per lineage, the latest record
 * (exact numbers — administrators only), whether it passes and is of the current snapshots, and the approval that
 * turns "実績での見直し" on. Approving is allowed only for the passing, current record the administrator saw;
 * approvals are kept as history (withdrawn, ended by a failing backtest, ended by a new method).
 */
import { ESTIMATE_METHOD_VERSION } from "@/lib/plan-estimate"
import { logger } from "@/lib/logger"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import { DEFAULT_PARAMS, PARAM_GRID, type TunedKey, type TunedParams } from "@/lib/plan-estimate/params"
import { activeApproval, activeParamApproval, currentParams, decideGate, latestEval, lineageInputHash, lineageInputHashes, GATE_MAPE_RATIO, GATE_MIN_PROJECTS, GATE_P80_RANGE, type GateReason } from "@/services/plan-estimate-run/gate"
import { currentLineages, lineageNames } from "./eval.service"
import { SEARCH_MARGIN } from "./param-search"
import { lineageParamViews, searchingLineages, type LineageParamsView } from "./params.service"

const log = logger.child({ module: "plan-estimate-eval" })

export type ApprovalEndReason = "withdrawn" | "failed" | "method"

export interface LineageEvalView {
  lineage: string
  /** Template name for a template lineage, the schedule name for a name lineage (null otherwise or when gone). */
  name: string | null
  /** The latest record of the current method (null = never computed). */
  latest: {
    id: string
    evaluatedOn: string
    n: number
    /** Finished projects not scored (null on older rows). */
    skipped: number | null
    mape: number
    mapeTemplate: number
    p80Hit: number
    endErrorDays: number
    endErrorTemplateDays: number
  } | null
  /** The latest record was computed from other snapshots than the current ones (recompute queued, or it failed). */
  outdated: boolean
  /** The latest record passes the conditions (whatever its freshness and approval). */
  passes: boolean
  /** Why it does not pass (null when it passes). */
  reason: GateReason | null
  approval: { approvedAt: string; approvedByName: string | null } | null
  /** When there is no active approval: how the last one ended (null = never approved). */
  lastEnded: { endedAt: string; reason: ApprovalEndReason } | null
  /** Approved, passing and current: runs of this lineage propose durations from actuals. */
  on: boolean
  /** The estimator settings: the approved ones, the latest search and its proposal. */
  params: LineageParamsView
}

export interface EvalOverview {
  methodVersion: string
  /** The thresholds of the gate (shown with the numbers). */
  conditions: { minProjects: number; mapeRatio: number; p80Range: readonly [number, number] }
  lineages: LineageEvalView[]
  /** The parameter search: the defaults, the searched grid, the margin a proposal must beat the defaults by. */
  paramSearch: { defaults: TunedParams; grid: Readonly<Record<TunedKey, readonly number[]>>; margin: number; searching: string[] }
}

const lineageLock = (tx: Db, lineage: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan_estimate_eval:${lineage}`}))`

/** Lineages with current actuals, plus any lineage that carries an active approval. */
export async function listLineageEvals(db: Db = defaultDb): Promise<EvalOverview> {
  const actives = await db.planEstimateGateApproval.findMany({ where: { endedAt: null }, select: { lineage: true, methodVersion: true, approvedAt: true, approvedBy: { select: { name: true } } } })
  const lineages = [...new Set([...(await currentLineages(db)), ...actives.map((a) => a.lineage)])].sort()
  const ended = lineages.length
    ? await db.planEstimateGateApproval.findMany({ where: { lineage: { in: lineages }, endedAt: { not: null } }, orderBy: { endedAt: "desc" }, select: { lineage: true, endedAt: true, endReason: true } })
    : []
  const [names, hashes, latest, settings] = await Promise.all([
    lineageNames(lineages, { db }),
    lineageInputHashes(lineages, db),
    // One indexed read per lineage, bounded by LINEAGES_MAX (an admin page).
    Promise.all(lineages.map((l) => latestEval(l, db))),
    Promise.all(lineages.map(async (l) => currentParams(await activeParamApproval(l, db)))),
  ])
  const params = await lineageParamViews(lineages, hashes, db)
  const activeBy = new Map(actives.map((a) => [a.lineage, a]))
  const lastEndedBy = new Map<string, (typeof ended)[number]>()
  for (const e of ended) if (!lastEndedBy.has(e.lineage)) lastEndedBy.set(e.lineage, e)
  return {
    methodVersion: ESTIMATE_METHOD_VERSION,
    conditions: { minProjects: GATE_MIN_PROJECTS, mapeRatio: GATE_MAPE_RATIO, p80Range: GATE_P80_RANGE },
    paramSearch: { defaults: DEFAULT_PARAMS, grid: PARAM_GRID, margin: SEARCH_MARGIN, searching: searchingLineages() },
    lineages: lineages.map((lineage, i) => {
      const rec = latest[i]
      const gate = decideGate(rec)
      // Of other snapshots, or computed with other settings than the active ones (the same rule as the gate).
      const outdated = rec !== null && (rec.inputHash !== hashes.get(lineage) || (rec.paramApprovalId ?? null) !== (settings[i]?.id ?? null))
      const active = activeBy.get(lineage)
      const approval = active && active.methodVersion === ESTIMATE_METHOD_VERSION ? active : undefined
      const end = approval ? undefined : lastEndedBy.get(lineage)
      return {
        lineage,
        name: names.get(lineage) ?? null,
        latest: rec
          ? { id: rec.id, evaluatedOn: rec.evaluatedOn.toISOString().slice(0, 10), n: rec.n, skipped: rec.skipped, mape: rec.mape, mapeTemplate: rec.mapeTemplate, p80Hit: rec.p80Hit, endErrorDays: rec.endErrorDays, endErrorTemplateDays: rec.endErrorTemplateDays }
          : null,
        outdated,
        passes: gate.on,
        reason: gate.reason,
        approval: approval ? { approvedAt: approval.approvedAt.toISOString(), approvedByName: approval.approvedBy?.name ?? null } : null,
        lastEnded: end?.endedAt && end.endReason ? { endedAt: end.endedAt.toISOString(), reason: end.endReason as ApprovalEndReason } : null,
        on: gate.on && !outdated && approval !== undefined,
        params: params.get(lineage) as LineageParamsView,
      }
    }),
  }
}

/**
 * Approve a lineage on the record the administrator saw (`evalId`): it must still be the latest record of the current
 * method, pass, and be of the current snapshots. Under the lineage's lock, so a backtest recorded meanwhile is seen.
 */
export async function approveLineage(lineage: string, evalId: string, actorId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await lineageLock(tx, lineage)
    const rec = await latestEval(lineage, tx)
    if (!rec) throw new NotFoundError("この系統の検証の記録がありません", { lineage }, "PLAN_ESTIMATE_EVAL_NOT_FOUND")
    const settings = currentParams(await activeParamApproval(lineage, tx))
    if (rec.id !== evalId || rec.inputHash !== (await lineageInputHash(lineage, tx)) || (rec.paramApprovalId ?? null) !== (settings?.id ?? null)) {
      throw new ConflictError("検証の記録が新しくなっています。もう一度確かめてください", { lineage }, "PLAN_ESTIMATE_EVAL_CHANGED")
    }
    if (!decideGate(rec).on) throw new ConflictError("この系統の検証は条件を満たしていません", { lineage }, "PLAN_ESTIMATE_EVAL_NOT_PASSING")
    const now = new Date()
    const active = await activeApproval(lineage, tx)
    if (active?.methodVersion === ESTIMATE_METHOD_VERSION) return // already on: idempotent
    if (active) await tx.planEstimateGateApproval.update({ where: { id: active.id }, data: { endedAt: now, endedById: actorId, endReason: "method" } })
    await tx.planEstimateGateApproval.create({ data: { lineage, methodVersion: ESTIMATE_METHOD_VERSION, evalId, approvedById: actorId, approvedAt: now } })
  })
  log.info("estimate from actuals approved for a lineage", { lineage, evalId, actorId, methodVersion: ESTIMATE_METHOD_VERSION })
}

/** Withdraw the approval (kept as history; withdrawing a lineage without one is not an error). */
export async function withdrawLineage(lineage: string, actorId: string): Promise<void> {
  const ended = await withTransaction(async (tx) => {
    await lineageLock(tx, lineage)
    const { count } = await tx.planEstimateGateApproval.updateMany({ where: { lineage, endedAt: null }, data: { endedAt: new Date(), endedById: actorId, endReason: "withdrawn" } })
    return count
  })
  log.info("estimate from actuals withdrawn for a lineage", { lineage, actorId, ended })
}
