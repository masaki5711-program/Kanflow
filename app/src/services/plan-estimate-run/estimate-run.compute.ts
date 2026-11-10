/**
 * The computation of one estimate run (plan 12 §3.1–§3.6, E5), shared by creating a run and by the approval
 * recompute (`/plan/load` with estimateRunId). Reads only; the caller writes.
 *
 * template → confirmed lesson rules (E3) → durations from actuals (E2, only when the lineage's default is on, §5) →
 * levelling (E4, without automatic splits: what is written is what was levelled) → the levelled starts written as
 * `notBeforeOffsetDays`, so loading recomputes the dates on the server instead of trusting them (§3.6).
 *
 * Confidentiality is checked at use time: actuals come only through `learnableItemFacts`, whose owner fields never
 * leave this file (they feed m_u only). The creator's visible projects and the hidden-source state are inputs, so the
 * approval recompute can use the very same ones (another run publishing hidden state is not a change of THIS run).
 */
import { createHash } from "node:crypto"
import { dateFromKey } from "@/lib/plan-progress"
import { applyLessonRules, type LessonRuleResult } from "@/lib/plan-lesson-rules/apply"
import { estimatePlan, learnParallelCap, listStageCandidates, referenceDateOf, ESTIMATE_METHOD_VERSION, type HiddenState, type LeafCandidates, type LeafEstimate, type Observation, type ParallelPeak, type PlanEstimate } from "@/lib/plan-estimate"
import { countBand } from "@/lib/plan-estimate"
import { planBaseSchedule, PlanScheduleError, type BaseSchedule, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { canonicalJson, defaultLineage } from "@/lib/plan-schedule/schedule-source"
import { parseTemplateContent } from "@/lib/plan-templates/schema"
import { scheduleFromTemplate } from "@/lib/plan-estimate-run/from-template"
import { defaultDb, type Db } from "@/services/_shared/db"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import { accessibleProjectWhere } from "@/services/search/search.query"
import { learnableItemFacts, learnableItemIds, type LearnableFact } from "@/services/plan-actuals/actuals.learnable"
import { effectiveLessonRules } from "@/services/plan-lesson-rules/lesson-rules.service"
import { levelSchedule, type LevelResponse } from "@/services/plan-leveling/load.service"
import * as templateRepo from "@/services/plan-templates/plan-templates.repository"
import { logger } from "@/lib/logger"
import { gateWithParams, type Gate } from "./gate"

const log = logger.child({ module: "plan-estimate-run" })

/** A run lives 24 h (plan 12 §3.6 item 2). */
export const RUN_LIFETIME_MS = 24 * 3_600_000
/** Retention of a run and its feedback (plan 12 §9 item 8). */
export const RUN_RETENTION_MS = 366 * 24 * 3_600_000
/** Leaves listed on the card (the largest changes); the card stays small whatever the plan's size. */
export const CARD_CHANGES_MAX = 20
/** Hidden-source states read per run (one row per aggregation unit; far above a real portfolio). */
const HIDDEN_STATES_MAX = 50_000
/** Owner leaves read for m_u. */
const OWNER_FACTS_MAX = 20_000

export type RunSource = { kind: "template"; templateId: string } | { kind: "schedule"; schedule: BaseSchedule; sourceRef?: string; lineage?: string }

export interface RunInput {
  startDate: string
  skipWeekends: boolean
  roleAssignments: Record<string, string[]>
  source: RunSource
}

export interface RunCreator {
  userId: string
  userName: string | null
  systemRole: string
}

/** Inputs that make the approval recompute see what the creator saw. */
export interface FixedInputs {
  visibleProjectIds: readonly string[]
  /** Hidden state per unit key as read when the run was made (null = none yet). */
  previousHidden: Readonly<Record<string, HiddenState | null>>
  /** R of the run: the approval within its 24 h compares with the same month, even across a month boundary. */
  referenceDate: string
  /**
   * E6: the visible stage-3 / 4 candidates the LLM rejected, per leaf key, as decided when the run was made (the
   * approval replays them; it never asks the LLM again). Absent on runs made before E6 = none.
   */
  rejectedCandidates?: Record<string, string[]>
  candidateAssist?: CandidateAssist
}

/** What the candidate review (E6) did for a run. Not a success unless "applied" or "no_candidates". */
export type CandidateAssistState = "off" | "no_candidates" | "applied" | "timeout" | "unavailable" | "http" | "invalid" | "aborted" | "error"

export interface CandidateAssist {
  state: CandidateAssistState
  /** Candidates rejected (0 unless applied). */
  rejected: number
  /** Source project ids whose item names were given to the LLM (recorded on the run: llmSourceIds). */
  sourceIds: string[]
  model: string | null
}

/**
 * Asks the LLM which visible stage-3 / 4 candidates to keep. Must never throw for an LLM failure (the run then uses the
 * formula alone); `rejectedCandidates` lists snapshot item ids per leaf key.
 */
export type CandidateReviewer = (leaves: readonly LeafCandidates[], visibleProjectIds: ReadonlySet<string>) => Promise<CandidateAssist & { rejectedCandidates: Record<string, string[]> }>

/** Per-leaf evidence as stored (internal: exact n, hidden project ids). Read only through readRun. */
export interface StoredEvidenceLeaf {
  key: string
  name: string
  role: string | null
  /** The lesson rule that added the item, if one did. */
  addedByRule: string | null
  /** Product of the applied scale factors (null = none). */
  scaleFactor: number | null
  /** The template's days (null = the item is not in the template: a lesson rule added it). */
  templateDays: number | null
  estimate: LeafEstimate | null
}

export interface RunSummary {
  methodVersion: string
  gateOn: boolean
  gateReason: string | null
  templateEnd: string
  /** End with the estimated durations (before levelling). */
  p50End: string
  p80End: string
  bufferDays: number
  /** End of the levelled plan: what loading writes. */
  plannedEnd: string
  leafCount: number
  rulesApplied: number
  rulesRejected: number
  /** How much data the estimate used: projects with matching actuals, as a band. */
  matchedProjects: "~3" | "4-9" | "10+" | null
  /** The largest changes against the template (at most CARD_CHANGES_MAX; templateDays null = added by a rule). */
  changes: { key: string; name: string; templateDays: number | null; days: number }[]
  /** How many items changed in all (changes lists only the largest). */
  changesTotal: number
  /** E6 candidate review: what the LLM did (absent on runs made before E6). Not shown per source. */
  assist?: { candidates: CandidateAssistState; rejected: number }
}

export interface OwnerPlan {
  owners: Record<string, string | null>
  /** Item names of this plan, by key (the owners list shows them). */
  names: Record<string, string>
  before: LevelResponse["before"]
  after: LevelResponse["after"]
  moves: LevelResponse["moves"]
}

export interface EngineInput {
  input: RunInput
  creator: RunCreator
  fixed: FixedInputs
  usedSnapshotItemIds: string[]
  ruleIds: string[]
}

export interface ComputedRun {
  lineage: string
  projectType: string
  sourceRef: string | null
  templateHash: string
  referenceDate: string
  gate: Gate
  inputHash: string
  schedule: BaseSchedule
  summary: RunSummary
  evidence: { leaves: StoredEvidenceLeaf[]; ruleIds: string[] }
  ownerPlan: OwnerPlan
  engineInput: EngineInput
  /** Hidden-source states this run produced (published when the run is created; never on the recompute). */
  hiddenStates: ReadonlyMap<string, HiddenState>
}

/** A read-only map whose lookups go through a callback (the engine only calls get). */
class RecordingMap extends Map<string, HiddenState> {
  constructor(private readonly lookup: (key: string) => HiddenState | undefined) {
    super()
  }
  override get(key: string): HiddenState | undefined {
    return this.lookup(key)
  }
  override has(key: string): boolean {
    return this.lookup(key) !== undefined
  }
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

function leavesOf(items: readonly BaseScheduleItem[]): BaseScheduleItem[] {
  return items.flatMap((i) => ((i.children ?? []).length > 0 ? leavesOf(i.children ?? []) : [i]))
}

/** Map every leaf (a new tree; the input is not changed). */
function mapLeaves(items: readonly BaseScheduleItem[], fn: (leaf: BaseScheduleItem) => BaseScheduleItem): BaseScheduleItem[] {
  return items.map((i) => ((i.children ?? []).length > 0 ? { ...i, children: mapLeaves(i.children ?? [], fn) } : fn(i)))
}

/** Role of every leaf: its own or the nearest ancestor's. */
function rolesOf(items: readonly BaseScheduleItem[], inherited: string | null = null, out = new Map<string, string | null>()): Map<string, string | null> {
  for (const i of items) {
    const role = i.role ?? inherited
    if ((i.children ?? []).length > 0) rolesOf(i.children ?? [], role, out)
    else out.set(i.key, role)
  }
  return out
}

/** The observation part of a fact: the owner fields stay behind. */
export function observationOf(f: LearnableFact): Observation {
  return {
    snapshotItemId: f.snapshotItemId,
    sourceProjectId: f.sourceProjectId,
    lineage: f.lineage,
    projectType: f.projectType,
    templateKey: f.templateKey,
    name: f.name,
    attributes: f.attributes,
    plannedDays: f.plannedDays,
    actualDays: f.actualDays,
    closedAt: f.closedAt,
    finalizedAt: f.finalizedAt,
    waitGapDays: f.waitGapDays ?? null,
    loadObserved: f.loadObserved ?? null,
    repoTouched: f.repoTouched ?? null,
    mrSetLeadTimeHours: f.mrSetLeadTimeHours ?? null,
  }
}

async function resolveTemplate(source: RunSource, db: Db): Promise<{ schedule: BaseSchedule; sourceRef: string | null; lineage: string | null }> {
  if (source.kind === "schedule") return { schedule: source.schedule, sourceRef: source.sourceRef ?? null, lineage: source.lineage ?? null }
  const row = await templateRepo.findTemplate(db, source.templateId)
  if (!row || row.deletedAt) throw new NotFoundError("テンプレートが見つかりません", {}, "PLAN_TEMPLATE_NOT_FOUND")
  return { schedule: scheduleFromTemplate(parseTemplateContent(row.content)), sourceRef: `template:${row.id}@v${row.version}`, lineage: `template:${row.id}` }
}

/**
 * Source projects treated as visible: those the creator AND every PO / SM of the target project can view (plan 12 §4,
 * E5 security review H1). Everyone who can read the run then sees the sources its days came from; a source only some
 * of them can view is a hidden source for the run (bands, rounded ratios, never a name).
 */
export async function visibleProjectsOf(projectId: string, creator: RunCreator, ids: readonly string[], db: Db): Promise<string[]> {
  if (ids.length === 0) return []
  const holders = await db.projectMember.findMany({ where: { projectId, role: { in: ["po", "sm"] } }, select: { user: { select: { id: true, role: true } } } })
  const viewers = new Map<string, string>([[creator.userId, creator.systemRole], ...holders.map((h): [string, string] => [h.user.id, h.user.role])])
  let visible = new Set(ids)
  for (const [userId, systemRole] of viewers) {
    if (visible.size === 0) break
    const rows = await db.project.findMany({ where: { id: { in: [...visible] }, ...accessibleProjectWhere({ userId, systemRole }) }, select: { id: true } })
    visible = new Set(rows.map((r) => r.id))
  }
  return [...visible].sort()
}

/** JSON prefix of every unit key starting with these parts (hiddenUnitKey is JSON.stringify([kind, ...parts])). */
const unitPrefix = (...parts: string[]) => JSON.stringify(parts).slice(0, -1) + ","

/**
 * The hidden-source states this run can read: leaf units of the lineage, the project-type unit, and the m_u units of
 * the assigned people — never the whole store (its size must not decide whether anyone can plan).
 */
async function hiddenStatesFor(lineage: string, projectType: string, userIds: readonly string[], db: Db): Promise<Map<string, HiddenState>> {
  const prefixes = [
    ...(["ratio", "lag", "load"] as const).map((k) => unitPrefix(k, lineage)),
    unitPrefix("type", projectType),
    ...userIds.map((u) => unitPrefix("parallel", u)),
  ]
  const rows = await db.planEstimateHiddenState.findMany({ where: { OR: prefixes.map((p) => ({ unitKey: { startsWith: p } })) }, select: { unitKey: true, state: true }, take: HIDDEN_STATES_MAX + 1 })
  if (rows.length > HIDDEN_STATES_MAX) throw new Error(`more than ${HIDDEN_STATES_MAX} hidden-source states for one lineage; refusing to estimate with a partial set`)
  return new Map(rows.map((r) => [r.unitKey, r.state as unknown as HiddenState]))
}

/** Owner leaves of the assigned people (m_u), through the use-time confidentiality check. */
async function ownerFacts(userIds: readonly string[], db: Db): Promise<LearnableFact[]> {
  if (userIds.length === 0) return []
  const rows = await db.planActualsItem.findMany({
    where: { ownerId: { in: [...userIds] }, complete: true, ownerConcurrentPeak: { not: null }, snapshot: { supersededAt: null, includeInLearning: true } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: OWNER_FACTS_MAX + 1,
  })
  if (rows.length > OWNER_FACTS_MAX) throw new Error(`more than ${OWNER_FACTS_MAX} owner leaves for m_u; refusing to learn from a subset`)
  return learnableItemFacts(rows.map((r) => r.id), db)
}

/** The person's peak per finished project (the max over their leaves there). */
function peaksOf(facts: readonly LearnableFact[], userId: string): ParallelPeak[] {
  const byProject = new Map<string, ParallelPeak>()
  for (const f of facts) {
    if (f.ownerId !== userId || f.ownerConcurrentPeak === null) continue
    const cur = byProject.get(f.sourceProjectId)
    if (!cur) byProject.set(f.sourceProjectId, { projectId: f.sourceProjectId, finalizedAt: f.finalizedAt, closedAt: f.closedAt, peak: f.ownerConcurrentPeak })
    else byProject.set(f.sourceProjectId, { ...cur, peak: Math.max(cur.peak, f.ownerConcurrentPeak), closedAt: cur.closedAt > f.closedAt ? cur.closedAt : f.closedAt })
  }
  return [...byProject.values()].sort((a, b) => (a.projectId < b.projectId ? -1 : 1))
}

/** The capacity rows of the assigned people that levelling reads (ids, versions and values; no names). */
async function capacityDigest(projectId: string, userIds: readonly string[], db: Db): Promise<unknown[]> {
  if (userIds.length === 0) return []
  const rows = await db.memberCapacity.findMany({
    where: { userId: { in: [...userIds] }, OR: [{ projectId: null }, { projectId }] },
    select: { id: true, userId: true, projectId: true, from: true, to: true, fte: true, version: true },
    orderBy: { id: "asc" },
  })
  return rows.map((r) => [r.id, r.userId, r.projectId, r.from.toISOString().slice(0, 10), r.to ? r.to.toISOString().slice(0, 10) : null, r.fte, r.version])
}

const sortedAssignments = (a: Readonly<Record<string, readonly string[]>>): Record<string, string[]> =>
  Object.fromEntries(Object.keys(a).sort().map((role) => [role, [...new Set(a[role])].sort()]))

export interface ComputeOptions {
  projectId: string
  creator: RunCreator
  /** "YYYY-MM-DD" (Asia/Tokyo) of the day the computation runs: R = the first of its month. */
  todayKey: string
  /** Approval recompute: the creator's visible projects and hidden state as stored. */
  fixed?: FixedInputs
  /** E6: ask the LLM about visible stage-3 / 4 candidates (only when no decision is given by `fixed` / `reuse`). */
  reviewCandidates?: CandidateReviewer
  /** E6: a decision already made for this run (the recompute under the hidden-state lock reuses the first one). */
  reuse?: Pick<FixedInputs, "rejectedCandidates" | "candidateAssist">
}

const NO_ASSIST: CandidateAssist = { state: "off", rejected: 0, sourceIds: [], model: null }

/** Keep only rejections of candidates that were listed (a reviewer can never touch anything else). */
function listedRejections(rejected: Readonly<Record<string, readonly string[]>>, listed: readonly LeafCandidates[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const leaf of listed) {
    if (!Object.hasOwn(rejected, leaf.key)) continue
    const ids = new Set(leaf.candidates.map((c) => c.snapshotItemId))
    const kept = [...new Set(rejected[leaf.key])].filter((id) => ids.has(id)).sort()
    if (kept.length > 0) out[leaf.key] = kept
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
}

/**
 * The candidate decision of this computation: replayed from `fixed` / `reuse` when the run already made one, else asked
 * once (gate on, a reviewer given, at least one visible stage-3 / 4 candidate), else none.
 */
async function decideCandidates(opts: ComputeOptions, gateOn: boolean, list: () => LeafCandidates[], visible: ReadonlySet<string>): Promise<{ rejected: Record<string, string[]>; assist: CandidateAssist }> {
  const given = opts.fixed ?? opts.reuse
  if (given?.rejectedCandidates !== undefined) return { rejected: given.rejectedCandidates, assist: given.candidateAssist ?? NO_ASSIST }
  if (opts.fixed || !gateOn || !opts.reviewCandidates) return { rejected: {}, assist: NO_ASSIST }
  const listed = list()
  if (listed.length === 0) return { rejected: {}, assist: { ...NO_ASSIST, state: "no_candidates" } }
  let r: Awaited<ReturnType<CandidateReviewer>>
  try {
    r = await opts.reviewCandidates(listed, visible)
  } catch (err) {
    // A defect in the review must not cost the proposal: the formula alone, recorded as an error.
    log.error("candidate review failed unexpectedly; the formula decides", { projectId: opts.projectId, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) })
    return { rejected: {}, assist: { ...NO_ASSIST, state: "error" } }
  }
  const rejected = r.state === "applied" ? listedRejections(r.rejectedCandidates, listed) : {}
  const count = Object.values(rejected).reduce((s, ids) => s + ids.length, 0)
  return { rejected, assist: { state: r.state, rejected: count, sourceIds: [...new Set(r.sourceIds)].sort(), model: r.model } }
}

export async function computeRun(input: RunInput, opts: ComputeOptions, db: Db = defaultDb): Promise<ComputedRun> {
  if (!dateFromKey(input.startDate)) throw new ValidationError("日付が不正です", {}, "INVALID_DATE")
  const project = await db.project.findUnique({ where: { id: opts.projectId }, select: { projectType: true } })
  if (!project) throw new NotFoundError("プロジェクトが見つかりません", {}, "NOT_FOUND")
  const tpl = await resolveTemplate(input.source, db)
  const { skipWeekends: _given, ...rest } = tpl.schedule
  void _given
  // Start constraints are what levelling writes; one supplied with the input is dropped (levelling decides them).
  const unconstrained = { ...rest, items: mapLeaves(rest.items, (leaf) => {
    const copy = { ...leaf }
    delete copy.notBeforeOffsetDays
    return copy
  }) }
  const template: BaseSchedule = input.skipWeekends ? { ...unconstrained, skipWeekends: true } : unconstrained
  // The template must be a valid schedule before anything else happens (the same rules as /plan/load).
  try {
    planBaseSchedule(template, input.startDate)
  } catch (error) {
    if (error instanceof PlanScheduleError) throw new ValidationError(error.message, {}, error.code)
    throw error
  }
  const templateHash = sha256(canonicalJson(template))
  const derived = defaultLineage({ sourceRef: tpl.sourceRef, scheduleHash: templateHash })
  if (input.source.kind === "schedule" && tpl.lineage && tpl.lineage !== derived) {
    // A free lineage would read another family's actuals and gate: allowed only when the project already loaded it.
    const used = await db.planScheduleLoad.findFirst({ where: { projectId: opts.projectId, lineage: tpl.lineage }, select: { id: true } })
    if (!used) throw new ValidationError("この系統の名前は、このスケジュールの出典とも、このプロジェクトが読み込んだ計画とも合いません", { lineage: tpl.lineage }, "PLAN_LINEAGE_NOT_ALLOWED")
  }
  const lineage = tpl.lineage ?? derived
  const projectType = project.projectType
  const referenceDate = opts.fixed ? opts.fixed.referenceDate : referenceDateOf(opts.todayKey)
  const roleAssignments = sortedAssignments(input.roleAssignments)
  const assigned = [...new Set(Object.values(roleAssignments).flat())].sort()

  // 1. Confirmed lesson rules (E3): re-checked for confidentiality at this moment.
  const effective = await effectiveLessonRules({ projectId: opts.projectId, lineage, projectType }, db)
  const rules: LessonRuleResult = applyLessonRules(template, effective.rules, { startDate: input.startDate })
  const ruled = rules.schedule

  // 2. Actuals (E1) for the lineage and the project type, through the use-time check.
  // The lineage's approved estimator settings (an administrator approved a proposal of the parameter search) apply only
  // when durations from actuals are on; otherwise the defaults.
  const { gate, params: approvedParams } = await gateWithParams(lineage, db)
  const settings = gate.on && approvedParams ? { ...approvedParams.params } : null
  const factIds = gate.on ? [...new Set([...(await learnableItemIds({ lineage }, db)), ...(await learnableItemIds({ projectType }, db))])] : []
  const facts = gate.on ? await learnableItemFacts(factIds, db) : []
  const owners = await ownerFacts(assigned, db)
  const sourceProjectIds = [...new Set([...facts, ...owners].map((f) => f.sourceProjectId))]
  const visibleProjectIds = opts.fixed ? [...opts.fixed.visibleProjectIds] : await visibleProjectsOf(opts.projectId, opts.creator, sourceProjectIds, db)
  const globalHidden = opts.fixed ? null : await hiddenStatesFor(lineage, projectType, assigned, db)
  const readHidden = new Map<string, HiddenState | null>()
  const attributes = (await db.projectAttribute.findMany({ where: { projectId: opts.projectId }, select: { kind: true, ref: true } })).map((a) => `${a.kind}:${a.ref}`).sort()
  const ctxBase = {
    ...(settings ? { config: settings } : {}),
    lineage,
    projectType,
    attributes,
    referenceDate,
    visibleProjectIds: new Set(visibleProjectIds),
    // Every lookup is recorded, so the approval can replay exactly the states this run read.
    previousHidden: new RecordingMap((key) => {
      const value = opts.fixed ? (Object.hasOwn(opts.fixed.previousHidden, key) ? opts.fixed.previousHidden[key] : null) : (globalHidden?.get(key) ?? null)
      readHidden.set(key, value)
      return value ?? undefined
    }),
  }

  // 3. Durations: the estimate when the lineage's default is on, the template (with the rules) otherwise. Before it, the
  // E6 candidate review: the LLM may drop visible stage-3 / 4 candidates (names of visible sources only; the formula
  // keeps deciding hidden ones, similarity and weights).
  const observations = gate.on ? facts.map(observationOf) : []
  const candidates = await decideCandidates(opts, gate.on, () => listStageCandidates(ruled, observations, ctxBase), ctxBase.visibleProjectIds)
  const rejectedMap = new Map(Object.entries(candidates.rejected).map(([k, ids]): [string, ReadonlySet<string>] => [k, new Set(ids)]))
  let estimate: PlanEstimate | null = null
  if (gate.on) estimate = estimatePlan(ruled, observations, { ...ctxBase, rejectedCandidates: rejectedMap }, input.startDate)
  const sink = new Map<string, HiddenState>(estimate?.hiddenStates ?? [])
  const byKey = new Map((estimate?.leaves ?? []).map((l) => [l.key, l]))
  const durationed = estimate ? estimate.schedule : ruled
  const withLoad: BaseSchedule = { ...durationed, items: mapLeaves(durationed.items, (leaf) => {
    const l = byKey.get(leaf.key)
    return l && leaf.load !== l.load && !(leaf.load === undefined && l.load === 1) ? { ...leaf, load: l.load } : leaf
  }) }

  // 4. m_u per person: the engine's (hidden-source aware) value, capped by a cap_parallel rule of their roles.
  const parallelCap = new Map<string, number>()
  for (const u of assigned) {
    const learned = learnParallelCap(u, peaksOf(owners, u), ctxBase, sink).cap
    const capped = Object.entries(roleAssignments)
      .filter(([, users]) => users.includes(u))
      .flatMap(([role]) => (Object.hasOwn(rules.constraints.capParallel, role) ? [rules.constraints.capParallel[role]] : []))
    parallelCap.set(u, Math.min(learned, ...capped))
  }

  // 5. Levelling (E4) without automatic splits, then the starts as constraints.
  const lagDays = new Map((estimate?.leaves ?? []).filter((l) => l.lagDays > 0).map((l) => [l.key, l.lagDays]))
  const levelled = await levelSchedule(opts.projectId, withLoad, { startDate: input.startDate, skipWeekends: input.skipWeekends, roleAssignments, split: false, lagDays, parallelCap }, db)
  // Every leaf gets its levelled start, 0 included: a leaf without one would follow the sequential order on load and
  // serialise what levelling ran in parallel.
  const schedule: BaseSchedule = { ...withLoad, items: mapLeaves(withLoad.items, (leaf) => {
    const start = levelled.startIndex.get(leaf.key)
    if (start === undefined) throw new Error(`levelling placed no start for leaf ${leaf.key}`)
    return { ...leaf, notBeforeOffsetDays: start }
  }) }
  let placed: ReturnType<typeof planBaseSchedule>
  try {
    placed = planBaseSchedule(schedule, input.startDate)
  } catch (error) {
    if (error instanceof PlanScheduleError) throw new ValidationError(error.message, {}, error.code)
    throw error
  }

  // 6. Evidence (internal), the card, the per-person part.
  const templateDays = new Map(leavesOf(template.items).map((l) => [l.key, l.durationDays ?? 1]))
  const roles = rolesOf(ruled.items)
  const leaves = leavesOf(ruled.items)
  const evidence: StoredEvidenceLeaf[] = leaves.map((leaf) => ({
    key: leaf.key,
    name: leaf.name,
    role: roles.get(leaf.key) ?? null,
    addedByRule: Object.hasOwn(rules.addedBy, leaf.key) ? rules.addedBy[leaf.key] : null,
    scaleFactor: Object.hasOwn(rules.scaleFactors, leaf.key) ? rules.scaleFactors[leaf.key] : null,
    templateDays: templateDays.get(leaf.key) ?? null,
    estimate: byKey.get(leaf.key) ?? null,
  }))
  const allChanges = leavesOf(schedule.items)
    .map((l) => ({ key: l.key, name: l.name, templateDays: templateDays.get(l.key) ?? null, days: l.durationDays ?? 1 }))
    .filter((c) => c.templateDays !== c.days)
  // An added item counts as a change of its whole length.
  const size = (c: (typeof allChanges)[number]) => Math.abs(c.days - (c.templateDays ?? 0))
  const changes = [...allChanges].sort((a, b) => size(b) - size(a) || (a.key < b.key ? -1 : 1)).slice(0, CARD_CHANGES_MAX)
  const matched = new Set(facts.map((f) => f.sourceProjectId)).size
  const templatePlan = planBaseSchedule(template, input.startDate)
  const summary: RunSummary = {
    methodVersion: ESTIMATE_METHOD_VERSION,
    gateOn: gate.on,
    gateReason: gate.reason,
    templateEnd: templatePlan.plannedEnd,
    p50End: estimate?.p50End ?? planBaseSchedule(ruled, input.startDate).plannedEnd,
    p80End: estimate?.p80End ?? planBaseSchedule(ruled, input.startDate).plannedEnd,
    bufferDays: estimate?.bufferDays ?? 0,
    plannedEnd: placed.plannedEnd,
    leafCount: leaves.length,
    rulesApplied: rules.applied.length,
    rulesRejected: rules.rejected.length,
    matchedProjects: matched > 0 ? countBand(matched) : null,
    changes,
    changesTotal: allChanges.length,
    assist: { candidates: candidates.assist.state, rejected: candidates.assist.rejected },
  }
  const ownedKeys = [...levelled.owners].filter(([, u]) => u !== null).map(([k]) => k)
  const leafName = new Map(leaves.map((l) => [l.key, l.name]))
  const ownerPlan: OwnerPlan = {
    owners: Object.fromEntries([...levelled.owners].sort(([a], [b]) => (a < b ? -1 : 1))),
    names: Object.fromEntries(ownedKeys.sort().map((k) => [k, leafName.get(k) ?? k])),
    before: levelled.response.before,
    after: levelled.response.after,
    moves: levelled.response.moves,
  }

  // A leaf a PO / SM treats as waiting is learned with other numbers: it enters the hash marked (only then, so the hash
  // of runs without such a leaf is unchanged). An excluded leaf is simply not used.
  const usedSnapshotItemIds = [...new Set([...facts, ...owners].map((f) => f.snapshotItemId))].sort()
  const hashedSnapshotItemIds = [...new Set([...facts, ...owners].map((f) => (f.learningUse === "waiting" ? `${f.snapshotItemId}:waiting` : f.snapshotItemId)))].sort()
  const ruleIds = effective.rules.map((r) => r.id).sort()
  const inputHash = sha256(
    canonicalJson({
      method: ESTIMATE_METHOD_VERSION,
      rules: [...effective.rules].sort((a, b) => (a.id < b.id ? -1 : 1)),
      snapshotItemIds: hashedSnapshotItemIds,
      templateHash,
      referenceDate,
      capacity: await capacityDigest(opts.projectId, assigned, db),
      roleAssignments,
      gateOn: gate.on,
      startDate: input.startDate,
      skipWeekends: input.skipWeekends,
      // Only when the LLM rejected something: runs without a rejection keep the hash they had before E6.
      ...(Object.keys(candidates.rejected).length > 0 ? { rejectedCandidates: candidates.rejected } : {}),
      // Only with approved settings: runs on the defaults keep the hash they had before the parameter search.
      ...(settings ? { settings } : {}),
    })
  )
  const fixed: FixedInputs = {
    visibleProjectIds,
    previousHidden: Object.fromEntries([...readHidden].sort(([a], [b]) => (a < b ? -1 : 1))),
    referenceDate,
    rejectedCandidates: candidates.rejected,
    candidateAssist: candidates.assist,
  }
  return {
    lineage,
    projectType,
    sourceRef: tpl.sourceRef,
    templateHash,
    referenceDate,
    gate,
    inputHash,
    schedule,
    summary,
    evidence: { leaves: evidence, ruleIds },
    ownerPlan,
    engineInput: { input: { ...input, roleAssignments }, creator: opts.creator, fixed, usedSnapshotItemIds, ruleIds },
    hiddenStates: sink,
  }
}
