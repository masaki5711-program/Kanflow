/**
 * Proposals of estimator settings per lineage (handoff 2026-11-05 "次の案" (2)) and their approval by an administrator.
 * The search (param-search.ts) is deterministic and runs on the same serialized path as the backtests (one job at a
 * time on the web's event loop, yielding between candidates); it never changes anything an estimate uses. Only an
 * administrator's approval does — and a later backtest that fails with the approved settings ends them (eval.service).
 *
 * Privacy (plan 12 §10): the stored metrics are lineage aggregates only (no project ids, no per-project rows) and are
 * read by administrators only, the same rule as the backtest records.
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { ESTIMATE_METHOD_VERSION } from "@/lib/plan-estimate"
import { isGridParams, type TunedParams } from "@/lib/plan-estimate/params"
import { tokyoDateKey } from "@/lib/plan-progress"
import { logger } from "@/lib/logger"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import { activeParamApproval, currentParams, decideGate, lineageInputHash } from "@/services/plan-estimate-run/gate"
import { backtestInput, currentLineages, enqueueLineageRecompute, runSerialized, type TypePoolCache } from "./eval.service"
import { searchParams, type CandidateMetrics, type KeepReason, type SearchOptions } from "./param-search"

const log = logger.child({ module: "plan-estimate-eval" })

const lineageLock = (tx: Db, lineage: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan_estimate_eval:${lineage}`}))`
const errText = (err: unknown) => (err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300))

const subsetSchema = z.object({ projects: z.number(), leaves: z.number(), mape: z.number(), mapeTemplate: z.number(), p80Hit: z.number(), endErrorDays: z.number(), endErrorTemplateDays: z.number() })
const candidateSchema = z.object({
  full: z.object({ n: z.number(), mape: z.number(), mapeTemplate: z.number(), p80Hit: z.number(), endErrorDays: z.number(), endErrorTemplateDays: z.number() }),
  search: subsetSchema,
  holdout: subsetSchema,
})
/** The stored `metrics` column. */
const metricsSchema = z.object({ before: candidateSchema.nullable(), after: candidateSchema.nullable(), skipped: z.number().int().min(0) })

export type ParamDecision = "approved" | "rejected" | "superseded"
export type ParamEndReason = "withdrawn" | "failed" | "method" | "replaced"

export interface ProposalView {
  id: string
  createdAt: string
  outcome: "propose" | "keep_default"
  reason: KeepReason | null
  params: TunedParams
  before: CandidateMetrics | null
  after: CandidateMetrics | null
  candidates: number
  evaluated: number
  /** Computed from other snapshots or another method than the current ones: it cannot be approved. */
  outdated: boolean
  decision: ParamDecision | null
}

export interface LineageParamsView {
  /** The approved settings in use (null = the defaults). */
  active: { params: TunedParams; approvedAt: string; approvedByName: string | null } | null
  /** When there are none: how the last approved settings ended (null = never approved). */
  lastEnded: { endedAt: string; reason: ParamEndReason } | null
  /** The latest search of the lineage (null = never searched). */
  latest: ProposalView | null
  /** A search of this lineage is queued or running in this process. */
  searching: boolean
}

/** Lineages whose search is queued or running in this process. */
const searching = new Set<string>()

export interface SearchRecorded {
  lineage: string
  /** false: the snapshots changed while searching — nothing was written. */
  written: boolean
  outcome: "propose" | "keep_default"
  reason: KeepReason | null
}

/**
 * Searches one lineage and records the result (a proposal or "keep the defaults"). Under the lineage's lock: written
 * only when the snapshots are still the ones searched; a pending older proposal is superseded.
 */
export async function searchLineageParams(lineage: string, opts: { now?: Date; db?: Db; cache?: TypePoolCache; search?: SearchOptions } = {}): Promise<SearchRecorded> {
  const input = await backtestInput(lineage, opts.db ?? defaultDb, opts.cache)
  const result = await searchParams(input, opts.search)
  const skipped = input.skips.length
  const run = async (tx: Db): Promise<SearchRecorded> => {
    await lineageLock(tx, lineage)
    const now = opts.now ?? new Date()
    if ((await lineageInputHash(lineage, tx)) !== input.inputHash) {
      log.info("parameter search discarded: the snapshots changed while searching", { lineage })
      return { lineage, written: false, outcome: result.outcome, reason: result.reason }
    }
    await tx.planEstimateParamProposal.updateMany({ where: { lineage, outcome: "propose", decision: null }, data: { decision: "superseded", decidedAt: now } })
    await tx.planEstimateParamProposal.create({
      data: {
        lineage,
        methodVersion: ESTIMATE_METHOD_VERSION,
        inputHash: input.inputHash,
        outcome: result.outcome,
        reason: result.reason,
        params: { ...result.params },
        // Plain JSON (numbers only): the metrics are lineage aggregates, never project ids.
        metrics: JSON.parse(JSON.stringify({ before: result.before, after: result.after, skipped })) as Prisma.InputJsonObject,
        candidates: result.candidates,
        evaluated: result.evaluated,
        timedOut: result.timedOut,
      },
    })
    return { lineage, written: true, outcome: result.outcome, reason: result.reason }
  }
  const recorded = await (opts.db ? run(opts.db) : withTransaction(run))
  const level = result.timedOut ? "warn" : "info"
  log[level]("parameter search recorded", { lineage, written: recorded.written, outcome: result.outcome, reason: result.reason, evaluated: result.evaluated, candidates: result.candidates })
  return recorded
}

export interface SearchRun {
  searched: SearchRecorded[]
  /** Lineages whose search failed (the others were still searched). */
  failed: string[]
}

/**
 * Queue the search of these lineages on the serialized backtest path, one lineage after another, each on its own (a
 * failure is logged and the others go on). Resolves when they are done; never rejects. A lineage already queued here is
 * not queued twice.
 */
export function enqueueParamSearch(lineages: readonly string[], opts: { now?: Date; search?: SearchOptions } = {}): Promise<SearchRun> {
  const todo = [...new Set(lineages)].filter((l) => !searching.has(l))
  for (const l of todo) searching.add(l)
  const cache: TypePoolCache = new Map()
  const out: SearchRun = { searched: [], failed: [] }
  const jobs = todo.map((lineage) =>
    runSerialized(async () => {
      try {
        out.searched.push(await searchLineageParams(lineage, { ...opts, cache }))
      } catch (err) {
        out.failed.push(lineage)
        log.error("parameter search of a lineage failed; the others go on", { lineage, error: errText(err) })
      } finally {
        searching.delete(lineage)
      }
    }),
  )
  return Promise.all(jobs).then(() => out)
}

/** An administrator's "パラメータを探す": every lineage with current actuals, queued (the response does not wait). */
export async function enqueueAllParamSearches(): Promise<string[]> {
  const lineages = await currentLineages()
  void enqueueParamSearch(lineages)
  return lineages
}

const PROPOSAL_SELECT = { id: true, lineage: true, methodVersion: true, inputHash: true, outcome: true, reason: true, params: true, metrics: true, candidates: true, evaluated: true, createdAt: true, decision: true } as const

/** The latest search of the lineage (any outcome). */
function latestProposal(lineage: string, db: Db) {
  return db.planEstimateParamProposal.findFirst({ where: { lineage }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: PROPOSAL_SELECT })
}

type ProposalRow = NonNullable<Awaited<ReturnType<typeof latestProposal>>>

function toView(row: ProposalRow, currentHash: string | undefined): ProposalView {
  const metrics = metricsSchema.parse(row.metrics)
  if (!isGridParams(row.params)) throw new Error(`plan_estimate_param_proposal ${row.id} holds settings outside the search grid`)
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    outcome: row.outcome as ProposalView["outcome"],
    reason: (row.reason as KeepReason | null) ?? null,
    params: row.params,
    before: metrics.before,
    after: metrics.after,
    candidates: row.candidates,
    evaluated: row.evaluated,
    outdated: row.inputHash !== currentHash || row.methodVersion !== ESTIMATE_METHOD_VERSION,
    decision: (row.decision as ParamDecision | null) ?? null,
  }
}

/** The settings view per lineage, for the administrators' page. `hashes`: lineageInputHash of each lineage. */
export async function lineageParamViews(lineages: readonly string[], hashes: ReadonlyMap<string, string>, db: Db = defaultDb): Promise<Map<string, LineageParamsView>> {
  if (lineages.length === 0) return new Map()
  const [actives, ended, latest] = await Promise.all([
    db.planEstimateParamApproval.findMany({ where: { lineage: { in: [...lineages] }, endedAt: null }, select: { lineage: true, methodVersion: true, params: true, approvedAt: true, approvedBy: { select: { name: true } } } }),
    db.planEstimateParamApproval.findMany({ where: { lineage: { in: [...lineages] }, endedAt: { not: null } }, orderBy: { endedAt: "desc" }, select: { lineage: true, endedAt: true, endReason: true } }),
    // One indexed read per lineage, bounded by LINEAGES_MAX (an admin page).
    Promise.all(lineages.map((l) => latestProposal(l, db))),
  ])
  const activeBy = new Map(actives.map((a) => [a.lineage, a]))
  const endedBy = new Map<string, (typeof ended)[number]>()
  for (const e of ended) if (!endedBy.has(e.lineage)) endedBy.set(e.lineage, e)
  return new Map(
    lineages.map((lineage, i) => {
      const a = activeBy.get(lineage)
      const usable = a && a.methodVersion === ESTIMATE_METHOD_VERSION && isGridParams(a.params) ? a : undefined
      const e = usable ? undefined : endedBy.get(lineage)
      const row = latest[i]
      return [
        lineage,
        {
          active: usable ? { params: usable.params as TunedParams, approvedAt: usable.approvedAt.toISOString(), approvedByName: usable.approvedBy?.name ?? null } : null,
          lastEnded: e?.endedAt && e.endReason ? { endedAt: e.endedAt.toISOString(), reason: e.endReason as ParamEndReason } : null,
          latest: row ? toView(row, hashes.get(lineage)) : null,
          searching: searching.has(lineage),
        },
      ]
    }),
  )
}

/** Lineages whose search is queued or running in this process (sorted). */
export const searchingLineages = (): string[] => [...searching].sort()

/**
 * Approve the proposal the administrator saw: it must be the lineage's latest search, a pending proposal of the current
 * method and snapshots, and its backtest must still pass the gate. The settings become the lineage's active ones (an
 * older approval ends as "replaced"), and the proposal's backtest is recorded as the lineage's latest backtest with them
 * (so the gate sees a current record at once). Under the lineage's lock.
 */
export async function approveParams(lineage: string, proposalId: string, actorId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await lineageLock(tx, lineage)
    const row = await latestProposal(lineage, tx)
    if (!row) throw new NotFoundError("この系統のパラメータの提案がありません", { lineage }, "PLAN_ESTIMATE_PARAMS_NOT_FOUND")
    const hash = await lineageInputHash(lineage, tx)
    if (row.id !== proposalId || row.inputHash !== hash || row.methodVersion !== ESTIMATE_METHOD_VERSION) {
      throw new ConflictError("パラメータの提案が新しくなっています。もう一度確かめてください", { lineage }, "PLAN_ESTIMATE_PARAMS_CHANGED")
    }
    if (row.outcome !== "propose" || row.decision !== null) throw new ConflictError("この提案はもう決まっています", { lineage }, "PLAN_ESTIMATE_PARAMS_DECIDED")
    const metrics = metricsSchema.parse(row.metrics)
    if (!isGridParams(row.params) || !metrics.after || !decideGate(metrics.after.full).on) {
      throw new ConflictError("この提案の検証は条件を満たしていません", { lineage }, "PLAN_ESTIMATE_PARAMS_NOT_PASSING")
    }
    const now = new Date()
    const active = await activeParamApproval(lineage, tx)
    if (active) await tx.planEstimateParamApproval.update({ where: { id: active.id }, data: { endedAt: new Date(Math.max(now.getTime(), active.approvedAt.getTime() + 1)), endedById: actorId, endReason: "replaced" } })
    const approval = await tx.planEstimateParamApproval.create({ data: { lineage, methodVersion: ESTIMATE_METHOD_VERSION, proposalId, params: { ...row.params }, approvedById: actorId, approvedAt: now } })
    await tx.planEstimateParamProposal.update({ where: { id: proposalId }, data: { decision: "approved", decidedAt: now, decidedById: actorId } })
    await tx.planEstimateEval.create({
      data: { lineage, evaluatedOn: new Date(`${tokyoDateKey(now)}T00:00:00.000Z`), methodVersion: ESTIMATE_METHOD_VERSION, ...metrics.after.full, skipped: metrics.skipped, inputHash: hash, paramApprovalId: approval.id },
    })
  })
  log.info("estimator settings approved for a lineage", { lineage, proposalId, actorId, methodVersion: ESTIMATE_METHOD_VERSION })
}

/** Reject a pending proposal (kept as history). */
export async function rejectParams(lineage: string, proposalId: string, actorId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await lineageLock(tx, lineage)
    const { count } = await tx.planEstimateParamProposal.updateMany({ where: { id: proposalId, lineage, outcome: "propose", decision: null }, data: { decision: "rejected", decidedAt: new Date(), decidedById: actorId } })
    if (count === 0) {
      const exists = await tx.planEstimateParamProposal.findFirst({ where: { id: proposalId, lineage }, select: { id: true } })
      if (!exists) throw new NotFoundError("この系統のパラメータの提案がありません", { lineage }, "PLAN_ESTIMATE_PARAMS_NOT_FOUND")
      throw new ConflictError("この提案はもう決まっています", { lineage }, "PLAN_ESTIMATE_PARAMS_DECIDED")
    }
  })
  log.info("estimator settings proposal rejected for a lineage", { lineage, proposalId, actorId })
}

/**
 * Return the lineage to the default settings (the approval is kept as history; a lineage without one is not an error).
 * The latest backtest was computed with the ended settings, so the gate treats it as outdated until the queued
 * recompute with the defaults is recorded.
 */
export async function revertParams(lineage: string, actorId: string): Promise<void> {
  const ended = await withTransaction(async (tx) => {
    await lineageLock(tx, lineage)
    const active = await tx.planEstimateParamApproval.findFirst({ where: { lineage, endedAt: null }, select: { id: true, approvedAt: true } })
    if (!active) return 0
    const now = new Date()
    await tx.planEstimateParamApproval.update({ where: { id: active.id }, data: { endedAt: new Date(Math.max(now.getTime(), active.approvedAt.getTime() + 1)), endedById: actorId, endReason: "withdrawn" } })
    return 1
  })
  log.info("estimator settings returned to the defaults for a lineage", { lineage, actorId, ended })
  if (ended > 0) enqueueLineageRecompute(lineage)
}

/** The settings a run of the lineage uses (null = the defaults). */
export async function paramsFor(lineage: string, db: Db = defaultDb): Promise<TunedParams | null> {
  return currentParams(await activeParamApproval(lineage, db))?.params ?? null
}
