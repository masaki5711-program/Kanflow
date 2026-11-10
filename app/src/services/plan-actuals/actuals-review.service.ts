/**
 * The PO / SM side of the AI review of finalized actuals (handoff 2026-11-05 "次の案" 1): list the proposals of the
 * project's CURRENT snapshot and accept / reject one at a time (`plan.actualsReview`, decided in the routes).
 *
 * The AI never changes a number or learning: a proposal is a row. Accepting sets the leaf's `learningUse` (excluded |
 * waiting); rejecting leaves it — or, after an accept, puts it back — as recorded. The recorded numbers are never
 * rewritten. A decision that changes learningUse bumps the snapshot's version (the lineage's input hash: the backtest
 * becomes outdated, as after finalize) and queues the lineage's backtest after the commit. Every decision is audited in
 * the same transaction (ActivityLog: who, when, from → to).
 *
 * D-5 at display (use time): while a leaf cites a PBI that is confidential, trashed or gone NOW, its proposal is listed
 * as a placeholder — no leaf name, no days, no quote, no leaf id — and it can only be rejected (an accept would be a
 * blind change of learning on a leaf nobody may read: PLAN_ACTUALS_REVIEW_HIDDEN).
 */
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import { leavesCitingConfidentialPbis } from "./actuals.learnable"
import { auditStrict, queueBacktest } from "./actuals.service"

/** Proposals listed (a project holds at most 30 pending; decided ones of the current snapshot follow). */
const LIST_MAX = 200

export type ReviewProposalState = "pending" | "accepted" | "rejected"
export type ReviewJobState = "none" | "queued" | "running" | "done" | "failed" | "skipped"

export interface ReviewProposalDto {
  id: string
  /** true = the leaf cites a PBI that is confidential now: a placeholder (no id, name, days or quote; reject only). */
  hidden: boolean
  snapshotItemId: string | null
  itemName: string | null
  plannedDays: number | null
  actualDays: number | null
  kind: "exclude_from_learning" | "treat_as_waiting"
  quote: string | null
  /** item (the leaf's own text) | note (the finalize note); null when hidden. */
  quoteSource: "item" | "note" | null
  confidence: "low" | "medium" | "high"
  state: ReviewProposalState
  version: number
  decidedAt: string | null
  decidedByName: string | null
}

export interface ReviewListDto {
  snapshotId: string | null
  /** The AI review of the current snapshot: none (no request) | queued | running | done | failed | skipped. */
  job: ReviewJobState
  /** Why a review was skipped: no_items | prompt_budget | superseded | snapshot_gone (null otherwise). */
  jobReason: string | null
  /** Valid proposals of the review that were not written because the project held the most pending ones. */
  capped: number
  proposals: ReviewProposalDto[]
}

const learningUseOf = (kind: string): "excluded" | "waiting" => (kind === "treat_as_waiting" ? "waiting" : "excluded")

export async function listReviewProposals(projectId: string, db: Db = defaultDb): Promise<ReviewListDto> {
  const snapshot = await db.planActualsSnapshot.findFirst({ where: { projectId, supersededAt: null }, select: { id: true } })
  if (!snapshot) return { snapshotId: null, job: "none", jobReason: null, capped: 0, proposals: [] }
  const [job, rows] = await Promise.all([
    db.planActualsReviewJob.findUnique({ where: { snapshotId: snapshot.id }, select: { status: true, lastError: true, proposalsCapped: true } }),
    db.planActualsReviewProposal.findMany({
      where: { projectId, snapshotId: snapshot.id, state: { in: ["pending", "accepted", "rejected"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: LIST_MAX,
      select: {
        id: true,
        snapshotItemId: true,
        kind: true,
        quote: true,
        quoteSource: true,
        confidence: true,
        state: true,
        version: true,
        decidedAt: true,
        decidedBy: { select: { name: true } },
        item: { select: { name: true, plannedDays: true, actualDays: true } },
      },
    }),
  ])
  const confidential = await leavesCitingConfidentialPbis(
    rows.map((r) => r.snapshotItemId),
    db
  )
  return {
    snapshotId: snapshot.id,
    job: (job?.status ?? "none") as ReviewJobState,
    jobReason: job?.status === "skipped" ? (job.lastError ?? null) : null,
    capped: job?.proposalsCapped ?? 0,
    // Pending first (what needs a decision); the sort is stable, so the rest keep their order.
    proposals: [...rows]
      .sort((a, b) => Number(b.state === "pending") - Number(a.state === "pending"))
      .map((r): ReviewProposalDto => {
        const base = { id: r.id, kind: r.kind as ReviewProposalDto["kind"], confidence: r.confidence as ReviewProposalDto["confidence"], state: r.state as ReviewProposalState, version: r.version, decidedAt: r.decidedAt?.toISOString() ?? null, decidedByName: r.decidedBy?.name ?? null }
        if (confidential.has(r.snapshotItemId)) return { ...base, hidden: true, snapshotItemId: null, itemName: null, plannedDays: null, actualDays: null, quote: null, quoteSource: null }
        return { ...base, hidden: false, snapshotItemId: r.snapshotItemId, itemName: r.item.name, plannedDays: r.item.plannedDays, actualDays: r.item.actualDays, quote: r.quote, quoteSource: r.quoteSource as "item" | "note" }
      }),
  }
}

export interface ReviewDecisionInput {
  decision: "accept" | "reject"
  version: number
}

/**
 * Accept or reject one proposal of the CURRENT snapshot (deciding again is allowed: an accept can be taken back by a
 * reject, and the other way round). Serialized with finalize on the project's advisory lock, version-guarded.
 */
export async function decideReviewProposal(projectId: string, proposalId: string, input: ReviewDecisionInput, actor: Actor): Promise<ReviewProposalDto> {
  const { lineage, changed } = await withTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan_actuals:${projectId}`}))`
    const row = await tx.planActualsReviewProposal.findFirst({
      where: { id: proposalId, projectId },
      select: { id: true, state: true, version: true, kind: true, snapshotItemId: true, snapshot: { select: { id: true, supersededAt: true, lineage: true } }, item: { select: { learningUse: true } } },
    })
    if (!row) throw new NotFoundError("提案が見つかりません", {}, "PLAN_ACTUALS_NOT_FOUND")
    // Only the current snapshot is learned from: a proposal of a replaced one can no longer be decided.
    if (row.state === "superseded" || row.snapshot.supersededAt !== null) throw new ConflictError("前の記録の提案は決められません", {}, "PLAN_ACTUALS_CHANGED")
    if (row.version !== input.version) throw new ConflictError("提案が変更されています", {}, "PLAN_ACTUALS_CHANGED")
    // D-5: no blind accept on a leaf whose cited PBI is confidential now (rejecting stays possible).
    if (input.decision === "accept" && (await leavesCitingConfidentialPbis([row.snapshotItemId], tx)).size > 0) {
      throw new ConflictError("機密の PBI を含む項目の提案は採用できません", {}, "PLAN_ACTUALS_REVIEW_HIDDEN")
    }
    const state = input.decision === "accept" ? "accepted" : "rejected"
    const learningUse = state === "accepted" ? learningUseOf(row.kind) : null
    const changed = row.item.learningUse !== learningUse
    if (changed) {
      await tx.planActualsItem.update({ where: { id: row.snapshotItemId }, data: { learningUse } })
      // The lineage's input hash moves: the recorded backtest is outdated until it is computed again.
      await tx.planActualsSnapshot.update({ where: { id: row.snapshot.id }, data: { version: { increment: 1 } } })
    }
    const res = await tx.planActualsReviewProposal.updateMany({ where: { id: row.id, version: input.version }, data: { state, version: { increment: 1 }, decidedAt: new Date(), decidedById: actor.userId } })
    if (res.count !== 1) throw new ConflictError("提案が変更されています", {}, "PLAN_ACTUALS_CHANGED")
    await auditStrict(tx, projectId, actor, {
      changes: { planActualsReview: { from: row.state, to: state }, ...(changed ? { planActualsLearningUse: { from: row.item.learningUse, to: learningUse } } : {}) },
      meta: { proposalId: row.id, snapshotId: row.snapshot.id, snapshotItemId: row.snapshotItemId, kind: row.kind },
    })
    return { lineage: row.snapshot.lineage, changed }
  })
  if (changed) await queueBacktest(projectId, lineage, actor)
  const list = await listReviewProposals(projectId)
  const dto = list.proposals.find((p) => p.id === proposalId)
  if (!dto) throw new NotFoundError("提案が見つかりません", {}, "PLAN_ACTUALS_NOT_FOUND")
  return dto
}
