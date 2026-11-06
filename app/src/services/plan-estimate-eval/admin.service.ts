/**
 * The administrators' view of the backtest on real actuals (plan 12 §5 / §8 item 6): per lineage, the latest record
 * (exact numbers — administrators only), whether it passes, and the approval that turns "実績で調整" on. Approving is
 * allowed only for a passing record of the current method; withdrawing removes the approval.
 */
import { ESTIMATE_METHOD_VERSION } from "@/lib/plan-estimate"
import { logger } from "@/lib/logger"
import { defaultDb, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import { decideGate, latestEval, GATE_MAPE_RATIO, GATE_MIN_PROJECTS, GATE_P80_RANGE, type GateReason } from "@/services/plan-estimate-run/gate"
import { currentLineages, lineageNames } from "./eval.service"

const log = logger.child({ module: "plan-estimate-eval" })

export interface LineageEvalView {
  lineage: string
  /** The template's name for a template lineage (null otherwise or when it is gone). */
  name: string | null
  /** The latest record of the current method (null = never computed). */
  latest: {
    id: string
    evaluatedOn: string
    n: number
    mape: number
    mapeTemplate: number
    p80Hit: number
    endErrorDays: number
    endErrorTemplateDays: number
  } | null
  passes: boolean
  /** Why it does not pass (null when it passes). */
  reason: GateReason | null
  approval: { approvedAt: string; approvedByName: string | null } | null
  /** Approved and passing: runs of this lineage propose durations from actuals. */
  on: boolean
}

export interface EvalOverview {
  methodVersion: string
  /** The thresholds of the gate (shown with the numbers). */
  conditions: { minProjects: number; mapeRatio: number; p80Range: readonly [number, number] }
  lineages: LineageEvalView[]
}

/** Lineages with current actuals, plus any lineage that still carries an approval. */
export async function listLineageEvals(db: Db = defaultDb): Promise<EvalOverview> {
  const approvals = await db.planEstimateGateApproval.findMany({ select: { lineage: true, methodVersion: true, approvedAt: true, approvedById: true } })
  const lineages = [...new Set([...(await currentLineages(db)), ...approvals.map((a) => a.lineage)])].sort()
  const userIds = [...new Set(approvals.flatMap((a) => (a.approvedById ? [a.approvedById] : [])))]
  const [names, users, latest] = await Promise.all([
    lineageNames(lineages, db),
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    Promise.all(lineages.map((l) => latestEval(l, db))),
  ])
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const approvalBy = new Map(approvals.filter((a) => a.methodVersion === ESTIMATE_METHOD_VERSION).map((a) => [a.lineage, a]))
  return {
    methodVersion: ESTIMATE_METHOD_VERSION,
    conditions: { minProjects: GATE_MIN_PROJECTS, mapeRatio: GATE_MAPE_RATIO, p80Range: GATE_P80_RANGE },
    lineages: lineages.map((lineage, i) => {
      const rec = latest[i]
      const gate = decideGate(rec)
      const approval = approvalBy.get(lineage)
      return {
        lineage,
        name: names.get(lineage) ?? null,
        latest: rec
          ? { id: rec.id, evaluatedOn: rec.evaluatedOn.toISOString().slice(0, 10), n: rec.n, mape: rec.mape, mapeTemplate: rec.mapeTemplate, p80Hit: rec.p80Hit, endErrorDays: rec.endErrorDays, endErrorTemplateDays: rec.endErrorTemplateDays }
          : null,
        passes: gate.on,
        reason: gate.reason,
        approval: approval ? { approvedAt: approval.approvedAt.toISOString(), approvedByName: approval.approvedById ? (userName.get(approval.approvedById) ?? null) : null } : null,
        on: gate.on && approval !== undefined,
      }
    }),
  }
}

/**
 * Approve a lineage: only when its latest record of the current method passes, and only the record the administrator
 * saw (`evalId`) — a newer record since then must be looked at first.
 */
export async function approveLineage(lineage: string, evalId: string, actorId: string, db: Db = defaultDb): Promise<void> {
  const rec = await latestEval(lineage, db)
  if (!rec) throw new NotFoundError("この系統の検証の記録がありません", { lineage }, "PLAN_ESTIMATE_EVAL_NOT_FOUND")
  if (rec.id !== evalId) throw new ConflictError("検証の記録が新しくなっています。もう一度確かめてください", { lineage }, "PLAN_ESTIMATE_EVAL_CHANGED")
  if (!decideGate(rec).on) throw new ConflictError("この系統の検証は条件を満たしていません", { lineage }, "PLAN_ESTIMATE_EVAL_NOT_PASSING")
  await db.planEstimateGateApproval.upsert({
    where: { lineage },
    create: { lineage, methodVersion: ESTIMATE_METHOD_VERSION, evalId, approvedById: actorId },
    update: { methodVersion: ESTIMATE_METHOD_VERSION, evalId, approvedById: actorId, approvedAt: new Date() },
  })
  log.info("estimate from actuals approved for a lineage", { lineage, evalId, actorId, methodVersion: ESTIMATE_METHOD_VERSION })
}

/** Withdraw the approval (idempotent: withdrawing a lineage without one is not an error). */
export async function withdrawLineage(lineage: string, actorId: string, db: Db = defaultDb): Promise<void> {
  const { count } = await db.planEstimateGateApproval.deleteMany({ where: { lineage } })
  log.info("estimate from actuals withdrawn for a lineage", { lineage, actorId, removed: count })
}
