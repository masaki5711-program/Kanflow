/**
 * 実績を確定 (plan 12 §2.2, E1): preview, finalize (append-only snapshots), the learning switch, and the admin
 * pseudonymisation. Authorization is decided in the routes (`plan.actualsFinalize` per project,
 * `canPseudonymizeActuals` for admins); every project route stays inside its project.
 *
 * Owners never leave this service toward a project screen: the DTOs carry the role, not the owner id, and no
 * concurrency numbers (those are for m_u learning only).
 *
 * The audit rows of finalize / the learning switch / pseudonymisation are written in the SAME transaction with the
 * transaction's client (not the best-effort activity seam): if the audit row cannot be written, the action rolls back.
 */
import { randomUUID } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { logger } from "@/lib/logger"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import { enqueueRuleDrafts } from "@/services/plan-llm/rule-drafts.queue"
import { ACTUALS_METHOD_VERSION, collectActuals, type CollectIssue } from "./actuals.collect"

const log = logger.child({ module: "plan-actuals" })

/** Snapshots listed per project (newest first). */
const SNAPSHOTS_LIST_MAX = 50
/** Rows per createMany (well under PostgreSQL's 32,767 bind parameters). */
const INSERT_CHUNK = 1_000
/** Finalizing writes up to ~2,000 leaves with their PBI / repository rows in one transaction. */
const FINALIZE_TIMEOUT_MS = 60_000

/** An audit row that must exist when the action commits (rolled back with it otherwise). */
async function auditStrict(tx: Db, projectId: string, actor: Actor, diff: Record<string, unknown>): Promise<void> {
  await tx.activityLog.create({
    data: { projectId, entityType: "project", entityId: projectId, action: "update", actorId: actor.userId, actorName: actor.userName, diff: JSON.stringify(diff) },
  })
}

/** An issue as the screen shows it: the leaf's name next to the kind (repository issues carry their path). */
export type PreviewIssue = CollectIssue & { name?: string }

export interface ActualsPreview {
  leafCount: number
  completeCount: number
  repoCount: number
  issues: PreviewIssue[]
}

export async function previewActuals(projectId: string, db: Db = defaultDb): Promise<ActualsPreview> {
  const c = await collectActuals(db, projectId)
  const names = new Map(c.items.map((i) => [i.leaf.planItemId, i.leaf.name]))
  const issues = c.issues.map((i) => ("planItemId" in i ? { ...i, name: names.get(i.planItemId) ?? "" } : i))
  return { leafCount: c.items.length, completeCount: c.items.filter((i) => i.actuals.complete).length, repoCount: c.repoCount, issues }
}

export interface SnapshotItemDto {
  id: string
  name: string
  templateKey: string | null
  role: string | null
  isMilestone: boolean
  templateDays: number | null
  plannedDays: number | null
  actualDays: number | null
  complete: boolean
  startSlipDays: number | null
  endSlipDays: number | null
  waitGapDays: number | null
  onHoldDays: number | null
}

export interface SnapshotDto {
  id: string
  lineage: string
  skipWeekends: boolean
  closedAt: string
  firstFinalizedAt: string
  finalizedAt: string
  repoCount: number
  issueCount: number
  includeInLearning: boolean
  current: boolean
  version: number
  methodVersion: string
  leafCount: number
  completeCount: number
}

type SnapshotRow = Prisma.PlanActualsSnapshotGetPayload<Record<string, never>>

function toSnapshotDto(row: SnapshotRow, leafCount: number, completeCount: number): SnapshotDto {
  return {
    id: row.id,
    lineage: row.lineage,
    skipWeekends: row.skipWeekends,
    closedAt: row.closedAt.toISOString().slice(0, 10),
    firstFinalizedAt: row.firstFinalizedAt.toISOString(),
    finalizedAt: row.finalizedAt.toISOString(),
    repoCount: row.repoCount,
    issueCount: row.issueCount,
    includeInLearning: row.includeInLearning,
    current: row.supersededAt === null,
    version: row.version,
    methodVersion: row.methodVersion,
    leafCount,
    completeCount,
  }
}

async function counts(db: Db, snapshotIds: readonly string[]): Promise<{ leaves: Map<string, number>; complete: Map<string, number> }> {
  if (snapshotIds.length === 0) return { leaves: new Map(), complete: new Map() }
  const [all, complete] = await Promise.all([
    db.planActualsItem.groupBy({ by: ["snapshotId"], where: { snapshotId: { in: [...snapshotIds] } }, _count: { _all: true } }),
    db.planActualsItem.groupBy({ by: ["snapshotId"], where: { snapshotId: { in: [...snapshotIds] }, complete: true }, _count: { _all: true } }),
  ])
  return { leaves: new Map(all.map((c) => [c.snapshotId, c._count._all])), complete: new Map(complete.map((c) => [c.snapshotId, c._count._all])) }
}

export async function listSnapshots(projectId: string, db: Db = defaultDb): Promise<SnapshotDto[]> {
  const rows = await db.planActualsSnapshot.findMany({ where: { projectId }, orderBy: [{ finalizedAt: "desc" }, { id: "desc" }], take: SNAPSHOTS_LIST_MAX })
  const c = await counts(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => toSnapshotDto(r, c.leaves.get(r.id) ?? 0, c.complete.get(r.id) ?? 0))
}

/** A snapshot's leaves (no owner ids, no concurrency: plan 12 §4). */
export async function snapshotItems(projectId: string, snapshotId: string, db: Db = defaultDb): Promise<SnapshotItemDto[]> {
  const snap = await db.planActualsSnapshot.findFirst({ where: { id: snapshotId, projectId }, select: { id: true } })
  if (!snap) throw new NotFoundError("実績のスナップショットが見つかりません", {}, "PLAN_ACTUALS_NOT_FOUND")
  return db.planActualsItem.findMany({
    where: { snapshotId },
    orderBy: { id: "asc" },
    select: { id: true, name: true, templateKey: true, role: true, isMilestone: true, templateDays: true, plannedDays: true, actualDays: true, complete: true, startSlipDays: true, endSlipDays: true, waitGapDays: true, onHoldDays: true },
  })
}

export interface FinalizeInput {
  /** How many items to check the finalizer saw (and finalizes anyway); must match what is found now. */
  acknowledgedIssueCount?: number
  /** 確定の時のメモ (plain text, up to 2000 chars): kept with the snapshot, read by the E6 rule drafts. */
  note?: string | null
}

/**
 * Freeze the project's actuals. Re-finalizing adds a NEW snapshot and marks the previous one superseded (rows are
 * never rewritten). Finalizations of one project serialize on a transaction-scoped advisory lock (plan edits are not
 * blocked); the table's UNIQUE NULLS NOT DISTINCT (projectId, supersededAt) keeps exactly one current snapshot even
 * for a writer that skips the lock.
 *
 * Known limit: the reads run under READ COMMITTED, so a plan edit committed DURING the few seconds of a finalize can
 * be half-seen. Finalizing is done when the work is over (edits then are rare), and re-finalizing replaces the record.
 * Pseudonymisation does not take this lock either: a finalize that commits during a pseudonymisation of a retired
 * user keeps that owner — run it again afterwards (it is idempotent).
 *
 * After the commit, the backtest of the lineage (and of the replaced snapshot's lineage, when a re-finalize moved the
 * project to another one) is queued (plan 12 §5 "継続"); the response does not wait for it.
 */
export async function finalizeActuals(projectId: string, input: FinalizeInput, actor: Actor): Promise<SnapshotDto> {
  const { dto, lineages } = await finalizeInTransaction(projectId, input, actor)
  for (const lineage of lineages) await queueBacktest(projectId, lineage, actor)
  return dto
}

/**
 * Queue the lineage's backtest (services/plan-estimate-eval, loaded lazily: it reads the estimate engine). Never fails
 * the change that already committed: until the backtest is recorded the gate treats the lineage as outdated.
 */
async function queueBacktest(projectId: string, lineage: string, actor: Actor): Promise<void> {
  try {
    const { enqueueAfterActualsChange } = await import("@/services/plan-estimate-eval/eval.service")
    enqueueAfterActualsChange(projectId, lineage, actor.userId)
  } catch (err) {
    log.error("backtest after an actuals change could not be queued; the lineage stays outdated until an admin recomputes", { projectId, lineage, error: err instanceof Error ? (err.stack ?? err.message).slice(0, 1000) : String(err).slice(0, 300) })
  }
}

function finalizeInTransaction(projectId: string, input: FinalizeInput, actor: Actor): Promise<{ dto: SnapshotDto; lineages: string[] }> {
  return withTransaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan_actuals:${projectId}`}))`
      // The time is taken AFTER the lock and is later than every earlier supersede of the project, so two
      // finalizations that started in the same millisecond still get distinct (projectId, supersededAt) keys.
      const latest = await tx.planActualsSnapshot.aggregate({ where: { projectId }, _max: { supersededAt: true, finalizedAt: true } })
      const floor = Math.max(latest._max.supersededAt?.getTime() ?? 0, latest._max.finalizedAt?.getTime() ?? 0) + 1
      const now = new Date(Math.max(Date.now(), floor))
      const c = await collectActuals(tx, projectId)
      if (c.items.length === 0) throw new ValidationError("全体計画に確定できる項目がありません", { issues: [] }, "PLAN_ACTUALS_INCOMPLETE")
      if (c.closedAt === null) throw new ValidationError("実績の終了日がある項目がありません", { issues: c.issues }, "PLAN_ACTUALS_INCOMPLETE")
      // The finalizer acknowledges exactly what they were shown: issues that appeared since then are shown first.
      if (c.issues.length > 0 && input.acknowledgedIssueCount !== c.issues.length) {
        throw new ValidationError("実績に確かめてほしい項目があります", { issues: c.issues }, "PLAN_ACTUALS_INCOMPLETE")
      }

      const previous = await tx.planActualsSnapshot.findFirst({ where: { projectId, supersededAt: null }, select: { id: true, firstFinalizedAt: true, lineage: true } })
      if (previous) await tx.planActualsSnapshot.update({ where: { id: previous.id }, data: { supersededAt: now } })

      const snapshot = await tx.planActualsSnapshot.create({
        data: {
          projectId,
          projectType: c.projectType,
          lineage: c.lineage,
          scheduleLoadId: c.scheduleLoadId,
          scheduleHash: c.scheduleHash,
          skipWeekends: c.skipWeekends,
          closedAt: new Date(`${c.closedAt}T00:00:00.000Z`),
          firstFinalizedAt: previous?.firstFinalizedAt ?? now,
          finalizedAt: now,
          finalizedById: actor.userId,
          repoCount: c.repoCount,
          issueCount: c.issues.length,
          methodVersion: ACTUALS_METHOD_VERSION,
          finalizeNote: input.note ?? null,
        },
      })

      // Three bulk inserts (ids generated here) instead of one round trip per row.
      const itemRows: Prisma.PlanActualsItemCreateManyInput[] = []
      const pbiRows: Prisma.PlanActualsItemPbiCreateManyInput[] = []
      const repoRows: Prisma.PlanActualsItemRepoCreateManyInput[] = []
      for (const it of c.items) {
        const a = it.actuals
        const id = randomUUID()
        itemRows.push({
          id,
          snapshotId: snapshot.id,
          planItemId: it.leaf.planItemId,
          templateKey: it.leaf.templateKey,
          name: it.leaf.name,
          parentKey: it.leaf.parentKey,
          isMilestone: it.leaf.isMilestone,
          role: it.leaf.role,
          templateDays: it.leaf.templateDays,
          plannedDays: a.plannedDays,
          actualDays: a.actualDays,
          complete: a.complete,
          startSlipDays: a.startSlipDays,
          endSlipDays: a.endSlipDays,
          waitGapDays: a.waitGapDays,
          onHoldDays: a.onHoldDays,
          ownerId: it.leaf.ownerId,
          ownerConcurrentAvg: a.ownerConcurrentAvg,
          ownerConcurrentPeak: a.ownerConcurrentPeak,
        })
        for (const p of it.pbis) {
          pbiRows.push({ snapshotItemId: id, backlogItemId: p.backlogItemId, effortHours: p.effortHours, estimatedHours: p.estimatedHours, reworkCount: p.reworkCount, mrSetLeadTimeHours: p.mr.mrSetLeadTimeHours, mrCount: p.mr.mrCount })
          for (const r of p.mr.repos) {
            repoRows.push({
              snapshotItemId: id,
              backlogItemId: p.backlogItemId,
              repositoryId: r.repositoryId,
              repositoryRef: r.repositoryRef,
              mrCount: r.mrCount,
              leadTimeP50Hours: r.leadTimeP50Hours,
              additions: r.additions,
              deletions: r.deletions,
              versionCount: r.versionCount,
            })
          }
        }
      }
      for (let i = 0; i < itemRows.length; i += INSERT_CHUNK) await tx.planActualsItem.createMany({ data: itemRows.slice(i, i + INSERT_CHUNK) })
      for (let i = 0; i < pbiRows.length; i += INSERT_CHUNK) await tx.planActualsItemPbi.createMany({ data: pbiRows.slice(i, i + INSERT_CHUNK) })
      for (let i = 0; i < repoRows.length; i += INSERT_CHUNK) await tx.planActualsItemRepo.createMany({ data: repoRows.slice(i, i + INSERT_CHUNK) })

      const completeCount = c.items.filter((i) => i.actuals.complete).length
      // E6: ask for LLM rule drafts from the retrospectives, the lessons and the note — by the night batch, at
      // background priority. Drafts change nothing until a PO / SM confirms them one at a time.
      await enqueueRuleDrafts(tx, projectId, snapshot.id)
      await auditStrict(tx, projectId, actor, {
        changes: { planActuals: { from: null, to: "finalize" } },
        meta: { snapshotId: snapshot.id, supersedes: previous?.id ?? null, leaves: c.items.length, complete: completeCount, issues: c.issues.length },
      })
      return { dto: toSnapshotDto(snapshot, c.items.length, completeCount), lineages: [...new Set([c.lineage, ...(previous ? [previous.lineage] : [])])] }
    },
    { timeout: FINALIZE_TIMEOUT_MS },
  )
}

export interface LearningSwitchInput {
  includeInLearning: boolean
  reason: string
  version: number
}

/** PO / SM switch the CURRENT snapshot in or out of learning (with a reason, audited). Version-guarded. */
export async function setIncludeInLearning(projectId: string, snapshotId: string, input: LearningSwitchInput, actor: Actor): Promise<SnapshotDto> {
  const dto = await switchInTransaction(projectId, snapshotId, input, actor)
  await queueBacktest(projectId, dto.lineage, actor)
  return dto
}

function switchInTransaction(projectId: string, snapshotId: string, input: LearningSwitchInput, actor: Actor): Promise<SnapshotDto> {
  return withTransaction(async (tx) => {
    const row = await tx.planActualsSnapshot.findFirst({ where: { id: snapshotId, projectId } })
    if (!row) throw new NotFoundError("実績のスナップショットが見つかりません", {}, "PLAN_ACTUALS_NOT_FOUND")
    // Only the current snapshot is ever learned from; switching an old one would only confuse the history.
    if (row.supersededAt !== null) throw new ConflictError("前の記録は切り替えられません", {}, "PLAN_ACTUALS_CHANGED")
    const res = await tx.planActualsSnapshot.updateMany({ where: { id: snapshotId, projectId, version: input.version, supersededAt: null }, data: { includeInLearning: input.includeInLearning, version: { increment: 1 } } })
    if (res.count !== 1) throw new ConflictError("実績のスナップショットが変更されています", {}, "PLAN_ACTUALS_CHANGED")
    await auditStrict(tx, projectId, actor, { changes: { planActualsLearning: { from: row.includeInLearning, to: input.includeInLearning } }, meta: { snapshotId, reason: input.reason } })
    const next = await tx.planActualsSnapshot.findUniqueOrThrow({ where: { id: snapshotId } })
    const c = await counts(tx, [snapshotId])
    return toSnapshotDto(next, c.leaves.get(snapshotId) ?? 0, c.complete.get(snapshotId) ?? 0)
  })
}

export type PseudonymizeInput = ({ userId: string } | { snapshotId: string }) & { reason: string }

/**
 * Admin only (`canPseudonymizeActuals`, plan 12 §4 / Q8). The one audited exception to "snapshots are never
 * rewritten": the owner of each matching row becomes its role name ("role:<name>", or "role:unknown"), and the row's
 * link to the live plan row (planItemId) is cut so the owner cannot be re-joined from the plan. Numbers never change.
 * - By user: only a user who exists and is no longer active (retired).
 * - By snapshot: only a superseded snapshot (an old record past its use), never the current one.
 */
export async function pseudonymizeActuals(input: PseudonymizeInput, actor: Actor): Promise<{ updated: number }> {
  return withTransaction(async (tx) => {
    let where: Prisma.PlanActualsItemWhereInput
    if ("userId" in input) {
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { isActive: true } })
      if (!user) throw new NotFoundError("利用者が見つかりません", {}, "PLAN_ACTUALS_NOT_FOUND")
      if (user.isActive) throw new ConflictError("在籍中の利用者は仮名化できません", {}, "PLAN_ACTUALS_USER_ACTIVE")
      where = { ownerId: input.userId }
    } else {
      const snap = await tx.planActualsSnapshot.findUnique({ where: { id: input.snapshotId }, select: { supersededAt: true } })
      if (!snap) throw new NotFoundError("実績のスナップショットが見つかりません", {}, "PLAN_ACTUALS_NOT_FOUND")
      if (snap.supersededAt === null) throw new ConflictError("最新の記録は記録ごとには仮名化できません（退職者ごとに行います）", {}, "PLAN_ACTUALS_CURRENT")
      where = { snapshotId: input.snapshotId, ownerId: { not: null }, NOT: { ownerId: { startsWith: "role:" } } }
    }
    const affected = await tx.planActualsItem.groupBy({ by: ["role"], where, _count: { _all: true } })
    const perProject = await tx.planActualsItem.findMany({ where, distinct: ["snapshotId"], select: { snapshotId: true, snapshot: { select: { projectId: true } } } })
    let updated = 0
    for (const g of affected) {
      const res = await tx.planActualsItem.updateMany({ where: { ...where, role: g.role }, data: { ownerId: `role:${g.role ?? "unknown"}`, planItemId: "" } })
      updated += res.count
    }
    if ("userId" in input) await tx.planActualsSnapshot.updateMany({ where: { finalizedById: input.userId }, data: { finalizedById: null } })
    const target = "userId" in input ? { mode: "retired_user", userId: input.userId } : { mode: "snapshot", snapshotId: input.snapshotId }
    const projects = [...new Set(perProject.map((p) => p.snapshot.projectId))]
    for (const projectId of projects) await auditStrict(tx, projectId, actor, { changes: { planActualsPseudonymize: { changed: true } }, meta: { ...target, reason: input.reason, rows: updated } })
    // Nothing matched: no project to attach an audit row to — still leave a trace.
    if (projects.length === 0) log.info("actuals pseudonymisation matched no rows", { ...target, actorId: actor.userId })
    return { updated }
  })
}
