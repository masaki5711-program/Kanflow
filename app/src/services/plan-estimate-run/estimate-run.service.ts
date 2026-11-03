/**
 * 計画を作る (plan 12 §3.6 / §4, E5): estimate runs — create, read (filtered for the reader every time), feedback, and
 * the approval check used by /plan/load.
 *
 * - Creating a run computes it (estimate-run.compute.ts) inside one transaction that holds the global hidden-state
 *   lock, so two runs never publish the "hold one change" state at the same time.
 * - A run is read only inside its project: another project's run id answers exactly like a missing one
 *   (404 PLAN_ESTIMATE_RUN_NOT_FOUND). The route checks plan.estimate; the per-person part needs plan.viewMemberLoad.
 * - Evidence is stored by id and resolved for the READER at read time: the confidentiality check runs again, sources
 *   of projects the reader cannot view fold into "other projects (band)", and no owner id is ever returned.
 */
import type { Prisma } from "@/generated/prisma/client"
import { countBand, displayLeaf, type DisplayLeaf } from "@/lib/plan-estimate"
import { tokyoDateKey } from "@/lib/plan-progress"
import { canonicalJson } from "@/lib/plan-schedule/schedule-source"
import { logger } from "@/lib/logger"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, isServiceError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import { accessibleProjectWhere } from "@/services/search/search.query"
import { learnableItemFacts } from "@/services/plan-actuals/actuals.learnable"
import type { Actor } from "@/services/_shared/actor"
import { writeBaseSchedule, type LoadBaseScheduleResult } from "@/services/plan/plan.base-schedule"
import type { BaseSchedule } from "@/lib/plan-schedule/base-schedule"
import { computeRun, RUN_LIFETIME_MS, RUN_RETENTION_MS, type ComputedRun, type EngineInput, type OwnerPlan, type RunCreator, type RunInput, type RunSummary, type StoredEvidenceLeaf } from "./estimate-run.compute"

const log = logger.child({ module: "plan-estimate-run" })

/** Evidence leaves per page. */
export const EVIDENCE_PAGE = 50
/** A reader who sees fewer than this many sources of a leaf with other projects' actuals gets no ratio (rule 1 + 1). */
const READER_MIN_VISIBLE_SOURCES = 4

const notFound = () => new NotFoundError("この計画の案が見つかりません", {}, "PLAN_ESTIMATE_RUN_NOT_FOUND")
export const staleError = (reason: StaleReason) => new ConflictError("この案を作った後に入力が変わりました。作り直してください", { reason }, "PLAN_ESTIMATE_STALE")

export type StaleReason = "expired" | "input_changed" | "plan_changed" | "source_changed" | "template_gone" | "member_left" | "approver_limited"

export interface Reader {
  userId: string
  systemRole: string
  canViewMemberLoad: boolean
}

// ---------------------------------------------------------------- create -----------------------------------------------

export interface CreatedRun {
  runId: string
  expiresAt: string
  summary: RunSummary
}

/** Hidden-source states that changed since `read` was taken (by another run publishing meanwhile). */
async function hiddenChangedSince(read: Readonly<Record<string, unknown>>, db: Db): Promise<boolean> {
  const keys = Object.keys(read)
  if (keys.length === 0) return false
  const rows = await db.planEstimateHiddenState.findMany({ where: { unitKey: { in: keys } }, select: { unitKey: true, state: true } })
  const now = new Map(rows.map((r) => [r.unitKey, r.state]))
  return keys.some((k) => canonicalJson(now.get(k) ?? null) !== canonicalJson(read[k] ?? null))
}

export async function createRun(projectId: string, input: RunInput, creator: RunCreator, now: Date = new Date()): Promise<CreatedRun> {
  const todayKey = tokyoDateKey(now)
  // The heavy part runs without the global lock; most runs read and publish no hidden state at all.
  const first = await computeRun(input, { projectId, creator, todayKey })
  const usesHidden = first.hiddenStates.size > 0 || Object.keys(first.engineInput.fixed.previousHidden).length > 0
  return withTransaction(
    async (tx) => {
      let run = first
      if (usesHidden) {
        // One run at a time publishes hidden-source state (plan 12 §3.2 rule 2: a change moves two at a time). If
        // another run published a state this one read, compute again under the lock so the rule holds.
        await tx.$executeRaw`SET LOCAL lock_timeout = '10s'`
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plan_estimate_hidden'))`
        if (await hiddenChangedSince(first.engineInput.fixed.previousHidden, tx)) run = await computeRun(input, { projectId, creator, todayKey }, tx)
      }
      for (const [unitKey, state] of run.hiddenStates) {
        const value = state as unknown as Prisma.InputJsonValue
        await tx.planEstimateHiddenState.upsert({ where: { unitKey }, create: { unitKey, state: value }, update: { state: value } })
      }
      const created = await tx.planEstimateRun.create({
        data: {
          projectId,
          createdById: creator.userId || null,
          createdAt: now,
          expiresAt: new Date(now.getTime() + RUN_LIFETIME_MS),
          purgeAfter: new Date(now.getTime() + RUN_RETENTION_MS),
          referenceDate: new Date(`${run.referenceDate}T00:00:00.000Z`),
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          skipWeekends: input.skipWeekends,
          lineage: run.lineage,
          projectType: run.projectType,
          sourceRef: run.sourceRef,
          templateHash: run.templateHash,
          inputHash: run.inputHash,
          methodVersion: run.summary.methodVersion,
          gateOn: run.gate.on,
          gateReason: run.gate.reason,
          llmSourceIds: [],
          schedule: run.schedule as unknown as Prisma.InputJsonValue,
          summary: run.summary as unknown as Prisma.InputJsonValue,
          evidence: run.evidence as unknown as Prisma.InputJsonValue,
          ownerPlan: run.ownerPlan as unknown as Prisma.InputJsonValue,
          engineInput: run.engineInput as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, expiresAt: true },
      })
      log.info("estimate run created", { projectId, runId: created.id, inputHash: run.inputHash, methodVersion: run.summary.methodVersion, gateOn: run.gate.on })
      return { runId: created.id, expiresAt: created.expiresAt.toISOString(), summary: run.summary }
    },
    { timeout: 60_000 }
  )
}

// ---------------------------------------------------------------- read -------------------------------------------------

interface StoredRun {
  id: string
  projectId: string
  expiresAt: Date
  createdAt: Date
  inputHash: string
  schedule: unknown
  summary: unknown
  evidence: unknown
  ownerPlan: unknown
  engineInput: unknown
  llmSourceIds: string[]
}

/** The run of THIS project, or 404 (the same answer for a missing run and another project's run). */
export async function findRun(projectId: string, runId: string, db: Db = defaultDb): Promise<StoredRun> {
  const row = await db.planEstimateRun.findUnique({
    where: { id: runId },
    select: { id: true, projectId: true, expiresAt: true, createdAt: true, inputHash: true, schedule: true, summary: true, evidence: true, ownerPlan: true, engineInput: true, llmSourceIds: true },
  })
  if (!row || row.projectId !== projectId) throw notFound()
  return row
}

const evidenceOf = (run: StoredRun) => run.evidence as { leaves: StoredEvidenceLeaf[]; ruleIds: string[] }
const engineOf = (run: StoredRun) => run.engineInput as EngineInput

async function viewableOf(reader: Pick<Reader, "userId" | "systemRole">, ids: readonly string[], db: Db): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db.project.findMany({ where: { id: { in: [...ids] }, ...accessibleProjectWhere(reader) }, select: { id: true, name: true } })
  return new Set(rows.map((r) => r.id))
}

/** Snapshot items the run used that are no longer learnable (confidential, trashed, superseded, gone) NOW. */
export async function vanishedSources(run: StoredRun, db: Db = defaultDb): Promise<Set<string>> {
  const used = engineOf(run).usedSnapshotItemIds
  const alive = new Set((await learnableItemFacts(used, db)).map((f) => f.snapshotItemId))
  return new Set(used.filter((id) => !alive.has(id)))
}

export interface RunCard {
  runId: string
  summary: RunSummary
  createdAt: string
  expiresAt: string
  expired: boolean
  /** A source the run used is no longer usable (e.g. became confidential): approving will be refused. */
  stale: boolean
  /** Owners per item, moves and before / after utilization: only with plan.viewMemberLoad. */
  ownerPlan?: OwnerPlan
  /** Changed items left out of summary.changes for THIS reader (a source they cannot view, or one no longer usable). */
  changesWithheld: number
}

/** Leaves whose numbers this reader may not see: a source became unusable, or a source the reader cannot view. */
async function restrictedLeaves(run: StoredRun, leaves: readonly StoredEvidenceLeaf[], reader: Reader, db: Db) {
  const vanished = await vanishedSources(run, db)
  const vanishedProjects = new Set<string>()
  if (vanished.size > 0) {
    const rows = await db.planActualsItem.findMany({ where: { id: { in: [...vanished] } }, select: { snapshot: { select: { projectId: true } } } })
    for (const r of rows) vanishedProjects.add(r.snapshot.projectId)
  }
  const sourcesOf = (l: StoredEvidenceLeaf) => [...(l.estimate?.kept ?? []), ...(l.estimate?.dropped ?? [])]
  const viewable = await viewableOf(reader, [...new Set(leaves.flatMap((l) => sourcesOf(l).map((x) => x.sourceProjectId)))], db)
  const reduced = new Set<string>()
  const narrower = new Set<string>()
  for (const l of leaves) {
    if (!l.estimate) continue
    if (sourcesOf(l).some((x) => vanished.has(x.snapshotItemId)) || l.estimate.hiddenSourceProjectIds.some((p) => vanishedProjects.has(p))) reduced.add(l.key)
    // A source the run counted as visible (every PO / SM could view it when it was made) that THIS reader cannot view:
    // its days would give the ratio back (E5 security review H1), so the leaf's numbers are not shown to them.
    else if (sourcesOf(l).some((x) => !viewable.has(x.sourceProjectId))) narrower.add(l.key)
  }
  return { vanished, viewable, reduced, narrower }
}

export async function readRunCard(projectId: string, runId: string, reader: Reader, now: Date = new Date(), db: Db = defaultDb): Promise<RunCard> {
  const run = await findRun(projectId, runId, db)
  const access = await restrictedLeaves(run, evidenceOf(run).leaves, reader, db)
  const vanished = access.vanished
  const summary = run.summary as RunSummary
  const shownChanges = summary.changes.filter((c) => !access.reduced.has(c.key) && !access.narrower.has(c.key))
  return {
    runId: run.id,
    summary: { ...summary, changes: shownChanges },
    changesWithheld: summary.changes.length - shownChanges.length,
    createdAt: run.createdAt.toISOString(),
    expiresAt: run.expiresAt.toISOString(),
    expired: run.expiresAt.getTime() <= now.getTime(),
    stale: vanished.size > 0,
    ...(reader.canViewMemberLoad ? { ownerPlan: run.ownerPlan as OwnerPlan } : {}),
  }
}

export interface EvidenceSource {
  /** The source project's name, only when the reader can view it. */
  projectName: string
  stage: 1 | 2 | 3 | 4
  ratio: number
}

export interface EvidenceLeaf {
  key: string
  name: string
  role: string | null
  addedByRule: string | null
  scaleFactor: number | null
  /** Null: the item is not in the template (a lesson rule added it). */
  templateDays: number | null
  /** Null when the estimate did not run (the lineage's default is off), the leaf lost a source, or it is limited. */
  estimate: null | {
    d50: number
    d80: number
    /** Null when other projects' actuals are part of it and the reader sees fewer than 4 sources. */
    r50: number | null
    r80: number | null
    observations: DisplayLeaf["observations"]
    typePriorOnly: boolean
    /** "Includes other projects' actuals" (band) — hidden for the creator or not viewable for this reader. */
    otherProjects: DisplayLeaf["otherProjects"]
    sources: EvidenceSource[]
    droppedCount: number
    lagDays: number
    load: number
    mrSet: DisplayLeaf["mrSet"]
  }
  /** A source of this leaf is no longer usable: its numbers are not shown (plan 12 §3.2 rule 5). */
  reduced: boolean
  /** A source is in a project this reader cannot view: the leaf's numbers are not shown to them. */
  limited: boolean
}

export interface EvidencePage {
  leaves: EvidenceLeaf[]
  total: number
  offset: number
  stale: boolean
  /** Repository breakdowns are shown only where GitStation confirms the reader may read the repository (G1). */
  repoNames: "hidden"
}

/**
 * Evidence for the reader, one page. Every call re-runs the confidentiality check over the stored sources and
 * resolves project names with the READER's permissions.
 */
export async function readRunEvidence(projectId: string, runId: string, reader: Reader, offset = 0, db: Db = defaultDb): Promise<EvidencePage> {
  if (!Number.isInteger(offset) || offset < 0) throw new ValidationError("offset が不正です", {}, "VALIDATION")
  const run = await findRun(projectId, runId, db)
  const all = evidenceOf(run).leaves
  const page = all.slice(offset, offset + EVIDENCE_PAGE)
  const access = await restrictedLeaves(run, page, reader, db)
  const { vanished, viewable } = access
  const names = new Map((await db.project.findMany({ where: { id: { in: [...viewable] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]))
  const leaves = page.map((l): EvidenceLeaf => {
    const base = { key: l.key, name: l.name, role: l.role, addedByRule: l.addedByRule, scaleFactor: l.scaleFactor, templateDays: l.templateDays }
    const est = l.estimate
    if (!est) return { ...base, estimate: null, reduced: false, limited: false }
    if (access.reduced.has(l.key)) return { ...base, estimate: null, reduced: true, limited: false }
    if (access.narrower.has(l.key)) return { ...base, estimate: null, reduced: false, limited: true }
    const shown = displayLeaf(est)
    const mine = shown.sources
    const other = est.hiddenSourceProjectIds.length > 0 ? countBand(est.hiddenSourceProjectIds.length) : null
    // Hidden sources took effect and few sources are shown: the ratio is not shown (rules 1 + 4).
    const ratioHidden = other !== null && mine.length < READER_MIN_VISIBLE_SOURCES
    return {
      ...base,
      estimate: {
        d50: shown.d50,
        d80: shown.d80,
        r50: ratioHidden ? null : shown.r50,
        r80: ratioHidden ? null : shown.r80,
        observations: shown.observations,
        typePriorOnly: shown.typePriorOnly,
        otherProjects: other,
        sources: mine.map((s) => ({ projectName: names.get(s.sourceProjectId) ?? "", stage: s.stage, ratio: s.ratio })),
        droppedCount: other !== null ? 0 : shown.droppedCount,
        lagDays: shown.lagDays,
        load: shown.load,
        mrSet: shown.mrSet,
      },
      reduced: false,
      limited: false,
    }
  })
  return { leaves, total: all.length, offset, stale: vanished.size > 0, repoNames: "hidden" }
}

// ---------------------------------------------------------------- feedback -----------------------------------------------

export type FeedbackKind = "too_high" | "too_low" | "rule_not_applicable" | "other"

export async function recordFeedback(projectId: string, runId: string, input: { key: string; kind: FeedbackKind; note?: string | null }, userId: string, db: Db = defaultDb): Promise<{ id: string }> {
  const run = await findRun(projectId, runId, db)
  if (!evidenceOf(run).leaves.some((l) => l.key === input.key)) throw new ValidationError("この案に無い項目です", {}, "VALIDATION")
  const note = input.note?.trim() ? input.note.trim() : null
  const row = await db.planEstimateFeedback.upsert({
    where: { runId_key_userId_kind: { runId, key: input.key, userId, kind: input.kind } },
    create: { runId, key: input.key, kind: input.kind, note, userId },
    // A repeat click without a note keeps the note given before.
    update: input.note === undefined ? {} : { note },
    select: { id: true },
  })
  return row
}

// ---------------------------------------------------------------- approval ----------------------------------------------

export interface ApprovedRun {
  run: StoredRun
  schedule: unknown
  owners: Record<string, string | null>
  startDate: string
  lineage: string
  sourceRef: string | null
}

/**
 * The approval check (plan 12 §3.6): the run is this project's, not expired, its inputs are unchanged (the whole run
 * recomputed with the creator's stored visibility and hidden state), the recomputed plan has the same end date and
 * owners, and no source became unusable. Any difference → 409 PLAN_ESTIMATE_STALE; nothing is written.
 */
/** Errors of the recompute that mean "the inputs of the run are gone": the run cannot be loaded as made. */
const INPUT_GONE: Readonly<Record<string, StaleReason>> = {
  PLAN_TEMPLATE_NOT_FOUND: "template_gone",
  PLAN_ROLE_ASSIGNMENT_INVALID: "member_left",
}

export async function checkRunForApproval(projectId: string, runId: string, now: Date, db: Db): Promise<ApprovedRun> {
  const run = await findRun(projectId, runId, db)
  const refuse = (reason: StaleReason, detail: Record<string, unknown> = {}) => {
    log.warn("estimate run refused on approval", { projectId, runId, reason, ...detail })
    return staleError(reason)
  }
  if (run.expiresAt.getTime() <= now.getTime()) throw refuse("expired")
  if ((await vanishedSources(run, db)).size > 0) throw refuse("source_changed")
  const engine = engineOf(run)
  let again: ComputedRun
  try {
    again = await computeRun(engine.input, { projectId, creator: engine.creator, todayKey: tokyoDateKey(now), fixed: engine.fixed }, db)
  } catch (error) {
    // Only a vanished input is "stale"; anything else (a defect, a permission problem) surfaces as itself.
    if (isServiceError(error) && Object.hasOwn(INPUT_GONE, error.code)) throw refuse(INPUT_GONE[error.code], { code: error.code, message: error.message })
    throw error
  }
  if (again.inputHash !== run.inputHash) throw refuse("input_changed")
  const stored = run.ownerPlan as OwnerPlan
  // jsonb reorders object keys: compare canonical forms. The schedule itself is compared too: a PBI that became
  // confidential keeps its snapshot item (the ids and the hash stay) but changes the learned days (D-5, use time).
  if (canonicalJson(again.schedule) !== canonicalJson(run.schedule)) throw refuse("plan_changed", { part: "schedule" })
  if (again.summary.plannedEnd !== (run.summary as RunSummary).plannedEnd) throw refuse("plan_changed", { part: "end" })
  if (canonicalJson(again.ownerPlan.owners) !== canonicalJson(stored.owners)) throw refuse("plan_changed", { part: "owners" })
  return { run, schedule: run.schedule, owners: stored.owners, startDate: engine.input.startDate, lineage: again.lineage, sourceRef: again.sourceRef }
}

/** Removing an owner is the only change an approver may make (plan 12 §3.6: never add or swap). */
export const REMOVED_OWNER_KEYS_MAX = 500

/**
 * Approve a run: /plan/load with estimateRunId. The check and the writes are one transaction; the schedule, dates and
 * owners come from the run (never from the request), minus the owners the approver removed. A run loads once
 * (proposalId est_<runId>: 409 PLAN_ALREADY_LOADED the second time).
 */
export async function loadEstimateRun(
  projectId: string,
  runId: string,
  removedOwnerKeys: readonly string[],
  actor: Actor,
  options: { canViewMemberLoad: boolean },
  now: Date = new Date()
): Promise<LoadBaseScheduleResult> {
  if (removedOwnerKeys.length > REMOVED_OWNER_KEYS_MAX) throw new ValidationError("外す担当が多すぎます", {}, "VALIDATION")
  return withTransaction(
    async (tx) => {
      const approved = await checkRunForApproval(projectId, runId, now, tx)
      // An approver who cannot view a source the run counted as visible would write days that give its ratio back
      // (E5 re-review M1): refuse; a run they make themselves uses their visibility too.
      const access = await restrictedLeaves(approved.run, evidenceOf(approved.run).leaves, { userId: actor.userId, systemRole: actor.systemRole, canViewMemberLoad: options.canViewMemberLoad }, tx)
      if (access.narrower.size > 0) {
        log.warn("estimate run refused on approval", { projectId, runId, reason: "approver_limited", items: access.narrower.size })
        throw staleError("approver_limited")
      }
      const unknown = removedOwnerKeys.filter((k) => !Object.hasOwn(approved.owners, k))
      if (unknown.length > 0) throw new ValidationError("この案に無い項目の担当は外せません", { keys: unknown.slice(0, 10) }, "VALIDATION")
      const removed = new Set(removedOwnerKeys)
      // The card shows owners only with plan.viewMemberLoad: an approver who did not see them loads none (unassigned).
      const owners = Object.fromEntries(Object.entries(approved.owners).map(([k, u]) => [k, !options.canViewMemberLoad || removed.has(k) ? null : u]))
      const result = await writeBaseSchedule(
        tx,
        projectId,
        { startDate: approved.startDate, schedule: approved.schedule as BaseSchedule, proposalId: `est_${runId}`, lineage: approved.lineage, ...(approved.sourceRef ? { sourceRef: approved.sourceRef } : {}) },
        actor,
        { estimateRunId: runId, owners }
      )
      log.info("estimate run loaded", { projectId, runId, removedOwners: removed.size, ownersWritten: options.canViewMemberLoad })
      return result
    },
    { timeout: 60_000 }
  )
}
