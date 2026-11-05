/**
 * 反省点の規則 — storage and lifecycle (plan 12 §2.3 / §3.4 / §4, E3 second half).
 *
 *   draft ──confirm (PO / SM, one at a time, kind + numbers repeated)──▶ confirmed ──retire──▶ retired
 *     └──────────────────────────────retire──────────────────────────────────────────────▲
 *   confirmed `project` rule ──request promotion (PO)──▶ admin confirms (quote removed, scope → shared) / rejects
 *
 * Authorization is decided in the routes (`plan.write` / `plan.lessonRule.confirm` /
 * `plan.lessonRule.requestPromotion` for the project, `canConfirmLineageRule` = admin for shared rules); the service
 * keeps every project route inside its project (a rule of another project, or a shared rule, is "not found" there).
 *
 * Confidentiality is NEVER stored: the cited lesson / PBIs are re-read on every use, every listing and every
 * promotion step (`sourceConfidentiality`). A cited source that is gone, trashed or moved counts as confidential.
 * Only `confirmed` rules ever reach a plan (`effectiveLessonRules` → `applyLessonRules`).
 */
import type { Prisma } from "@/generated/prisma/client"
import { logger } from "@/lib/logger"
import { parseLessonRule, PlanRuleError, type LessonRule } from "@/lib/plan-lesson-rules/rules"
import { decideRuleUse, promotionBlock, sameRuleContent, type LessonRuleScope, type RuleSkipReason, type RuleTarget } from "@/lib/plan-lesson-rules/scope"
import type { LessonRuleState } from "@/lib/plan-lesson-rules/rules"
import { logActivity } from "@/services/_shared/activity"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import { projectScope } from "@/services/feedback/feedback.access"
import type { ConfirmRuleInput, CreateRuleInput, PromotionDecisionInput, PromotionRequestInput, UpdateDraftInput } from "./lesson-rules.schemas"

const log = logger.child({ module: "plan-lesson-rules" })

/** Ceiling of confirmed rules that may apply to one plan (far above any real count; reaching it is a defect). */
export const EFFECTIVE_RULES_MAX = 1000
/** Rows per list screen (newest first). */
const LIST_MAX = 500

type RuleRow = Prisma.PlanLessonRuleGetPayload<Record<string, never>>

export interface LessonRuleDto {
  id: string
  kind: string
  params: unknown
  scope: LessonRuleScope
  lineage: string | null
  projectType: string | null
  state: LessonRuleState
  quote: string | null
  sourceLessonId: string | null
  sourceBacklogItemIds: string[]
  sourceSprintId: string | null
  fromRetrospective: boolean
  createdByKind: string
  createdById: string | null
  confirmedById: string | null
  confirmedAt: string | null
  promotionRequest: { lineage: string | null; projectType: string | null; requestedById: string | null; requestedAt: string | null } | null
  promotedAt: string | null
  retiredAt: string | null
  version: number
  /** A cited source is confidential (or gone) NOW. */
  sourceConfidential: boolean
  /** Shared rule stopped outside its source project because a source became confidential (出典が機密になったため停止中). */
  suspended: boolean
  createdAt: string
  updatedAt: string
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

function toDto(row: RuleRow, sourceConfidential: boolean): LessonRuleDto {
  return {
    id: row.id,
    kind: row.kind,
    params: row.params,
    scope: row.scope as LessonRuleScope,
    lineage: row.lineage,
    projectType: row.projectType,
    state: row.state as LessonRuleState,
    quote: row.quote,
    sourceLessonId: row.sourceLessonId,
    sourceBacklogItemIds: row.sourceBacklogItemIds ?? [],
    sourceSprintId: row.sourceSprintId,
    fromRetrospective: row.sourceSprintId !== null,
    createdByKind: row.createdByKind,
    createdById: row.createdById,
    confirmedById: row.confirmedById,
    confirmedAt: iso(row.confirmedAt),
    promotionRequest: row.promotionRequestedAt
      ? { lineage: row.promotionLineage, projectType: row.promotionProjectType, requestedById: row.promotionRequestedById, requestedAt: iso(row.promotionRequestedAt) }
      : null,
    promotedAt: iso(row.promotedAt),
    retiredAt: iso(row.retiredAt),
    version: row.version,
    sourceConfidential,
    suspended: row.scope === "shared" && row.state === "confirmed" && sourceConfidential,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function scopeFacts(row: RuleRow) {
  return {
    state: row.state as LessonRuleState,
    scope: row.scope as LessonRuleScope,
    sourceProjectId: row.sourceProjectId,
    lineage: row.lineage,
    projectType: row.projectType,
    fromRetrospective: row.sourceSprintId !== null,
  }
}

/** Validate kind + params with the one rule schema; PLAN_RULE_INVALID (400) otherwise. */
function validateContent(kind: string, params: unknown, state: LessonRuleState = "draft"): LessonRule {
  try {
    return parseLessonRule({ id: "candidate", state, kind, params })
  } catch (err) {
    if (err instanceof PlanRuleError) throw new ValidationError(err.message, {}, "PLAN_RULE_INVALID")
    throw err
  }
}

const invalidSource = (message: string) => new ValidationError(message, {}, "PLAN_RULE_INVALID")
const notFound = () => new NotFoundError("反省点の規則が見つかりません", {}, "PLAN_RULE_NOT_FOUND")

/** W11 lesson scopes a rule of `projectId` may cite: global, a technology, or that project's own. */
function lessonScopeAllowed(scope: string, projectId: string): boolean {
  return scope === "global" || scope.startsWith("tech:") || scope === projectScope(projectId)
}

/**
 * Per rule: is any cited source confidential NOW? A PBI that is gone, trashed or no longer in the source project, and
 * a lesson that is gone, count as confidential (fail closed). Two queries for any number of rules.
 */
export async function sourceConfidentiality(db: Db, rows: readonly RuleRow[]): Promise<Map<string, boolean>> {
  const pbiIds = [...new Set(rows.flatMap((r) => r.sourceBacklogItemIds ?? []))]
  const lessonIds = [...new Set(rows.map((r) => r.sourceLessonId).filter((x): x is string => x !== null))]
  const [pbis, lessons] = await Promise.all([
    pbiIds.length ? db.productBacklogItem.findMany({ where: { id: { in: pbiIds } }, select: { id: true, projectId: true, confidential: true, deletedAt: true } }) : [],
    lessonIds.length ? db.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, confidential: true, scope: true } }) : [],
  ])
  const pbiById = new Map(pbis.map((p) => [p.id, p]))
  const lessonById = new Map(lessons.map((l) => [l.id, l]))
  const out = new Map<string, boolean>()
  for (const r of rows) {
    const pbiTainted = (r.sourceBacklogItemIds ?? []).some((id) => {
      const p = pbiById.get(id)
      return !p || p.confidential || p.deletedAt !== null || p.projectId !== r.sourceProjectId
    })
    const lesson = r.sourceLessonId ? lessonById.get(r.sourceLessonId) : undefined
    // A lesson whose scope moved away from the source project (or global / tech) counts as gone.
    const lessonTainted = r.sourceLessonId !== null && (!lesson || lesson.confidential || !lessonScopeAllowed(lesson.scope, r.sourceProjectId))
    out.set(r.id, pbiTainted || lessonTainted)
  }
  return out
}

async function withConfidentiality(db: Db, rows: RuleRow[]): Promise<LessonRuleDto[]> {
  const taint = await sourceConfidentiality(db, rows)
  return rows.map((r) => toDto(r, taint.get(r.id) ?? true))
}

/** The project's own rules (every state), newest first. Shared rules widened from this project are included. */
export async function listProjectRules(projectId: string, db: Db = defaultDb): Promise<LessonRuleDto[]> {
  // Live rules (drafts / confirmed) are read on their own, so retired ones piling up never push a live rule out.
  const order = [{ createdAt: "desc" as const }, { id: "asc" as const }]
  const [live, retired] = await Promise.all([
    db.planLessonRule.findMany({ where: { sourceProjectId: projectId, state: { in: ["draft", "confirmed"] } }, orderBy: order, take: LIST_MAX }),
    db.planLessonRule.findMany({ where: { sourceProjectId: projectId, state: "retired" }, orderBy: order, take: 100 }),
  ])
  return withConfidentiality(db, [...live, ...retired])
}

export interface LessonRulePageContext {
  projectType: string
  /** Template lineages this project's plans were loaded from (choices for a promotion request). */
  lineages: string[]
  /** Recent sprints (a rule drafted from a retrospective names one). */
  sprints: { id: string; name: string }[]
}

export async function lessonRulePageContext(projectId: string, db: Db = defaultDb): Promise<LessonRulePageContext> {
  const [project, loads, sprints] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { projectType: true } }),
    db.planScheduleLoad.findMany({ where: { projectId }, select: { lineage: true }, distinct: ["lineage"], orderBy: { lineage: "asc" }, take: 50 }),
    db.sprint.findMany({ where: { projectId }, select: { id: true, sprintName: true }, orderBy: { startDate: "desc" }, take: 50 }),
  ])
  return {
    projectType: project?.projectType ?? "software",
    lineages: loads.map((l) => l.lineage),
    sprints: sprints.map((s) => ({ id: s.id, name: s.sprintName })),
  }
}

async function checkSources(db: Db, projectId: string, input: CreateRuleInput): Promise<void> {
  const pbiIds = [...new Set(input.sourceBacklogItemIds ?? [])]
  if (pbiIds.length > 0) {
    const found = await db.productBacklogItem.count({ where: { id: { in: pbiIds }, projectId, deletedAt: null } })
    if (found !== pbiIds.length) throw invalidSource("出典の PBI がこのプロジェクトにありません")
  }
  if (input.sourceSprintId) {
    const sprint = await db.sprint.findFirst({ where: { id: input.sourceSprintId, projectId }, select: { id: true } })
    if (!sprint) throw invalidSource("出典のスプリントがこのプロジェクトにありません")
  }
  if (input.sourceLessonId) {
    // A lesson of this project, or a global / technology lesson (W11 scopes). Never another project's lesson.
    // Only a confirmed, non-confidential lesson in reach may be cited (plan 12 §4: confidential lessons never go into a
    // rule draft). Every refusal is the same "not found", so the check is no oracle for lessons the caller cannot see.
    const lesson = await db.lesson.findUnique({ where: { id: input.sourceLessonId }, select: { scope: true, state: true, confidential: true } })
    const usable = lesson !== null && (lesson.state === "confirmed" || lesson.state === "systemized")
    if (!lesson || !usable || lesson.confidential || !lessonScopeAllowed(lesson.scope, projectId)) throw invalidSource("出典の教訓が見つかりません")
  }
}

function auditRule(tx: Db, projectId: string, ruleId: string, actor: Actor, op: string, meta: Record<string, unknown> = {}) {
  return logActivity(tx, {
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "update",
    actor,
    diff: { changes: { planLessonRule: { from: null, to: op } }, meta: { lessonRuleId: ruleId, ...meta } },
  })
}

/** A new draft of the `project` scope. Drafts never change a plan. */
export async function createDraft(projectId: string, input: CreateRuleInput, actor: Actor): Promise<LessonRuleDto> {
  // Store the parsed params (e.g. the NFKC-normalised name), so what is confirmed is what the schema accepted.
  const parsed = validateContent(input.kind, input.params)
  return withTransaction(async (tx) => {
    // Bounded so the list screen always shows every live rule (and none can be buried under a flood of drafts).
    const live = await tx.planLessonRule.count({ where: { sourceProjectId: projectId, state: { in: ["draft", "confirmed"] } } })
    if (live >= LIST_MAX) throw new ValidationError(`有効な反省点の規則は 1 プロジェクト ${LIST_MAX} 件までです`, {}, "PLAN_RULE_LIMIT")
    await checkSources(tx, projectId, input)
    const row = await tx.planLessonRule.create({
      data: {
        kind: parsed.kind,
        params: parsed.params as Prisma.InputJsonValue,
        sourceProjectId: projectId,
        quote: input.quote ?? null,
        sourceLessonId: input.sourceLessonId ?? null,
        sourceBacklogItemIds: [...new Set(input.sourceBacklogItemIds ?? [])],
        sourceSprintId: input.sourceSprintId ?? null,
        createdByKind: "human",
        createdById: actor.userId,
      },
    })
    await auditRule(tx, projectId, row.id, actor, "draft", { kind: row.kind })
    return (await withConfidentiality(tx, [row]))[0]
  })
}

/** One LLM draft to store (already validated by src/lib/plan-llm/parse.ts). */
export interface LlmDraftInput {
  rule: LessonRule
  quote: string
  sourceLessonId: string | null
  sourceSprintId: string | null
}

/** The author of LLM drafts in the activity log (no user row). */
const LLM_ACTOR: Actor = { userId: "", userName: "AI", systemRole: "system" }

/**
 * Store LLM drafts (E6, plan 12 §3.4): always `draft`, always `project` scope, createdByKind = llm, no author. The
 * cited lesson / sprint is checked again NOW (a lesson that became confidential since the prompt was built is refused
 * like any other source). A draft that fails is skipped and counted, never stored half; the live-rule bound of the
 * project is kept. Returns the ids stored and how many were skipped.
 */
export async function createLlmDrafts(projectId: string, drafts: readonly LlmDraftInput[], db?: Db): Promise<{ created: string[]; skipped: number }> {
  const run = async (tx: Db) => {
    const created: string[] = []
    let skipped = 0
    let live = await tx.planLessonRule.count({ where: { sourceProjectId: projectId, state: { in: ["draft", "confirmed"] } } })
    for (const d of drafts) {
      if (live >= LIST_MAX) {
        skipped++
        continue
      }
      let parsed: LessonRule
      try {
        parsed = validateContent(d.rule.kind, d.rule.params)
        await checkSources(tx, projectId, { kind: parsed.kind, params: parsed.params as Record<string, unknown>, sourceLessonId: d.sourceLessonId, sourceSprintId: d.sourceSprintId })
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err
        log.warn("llm draft refused at write time", { projectId, kind: d.rule.kind, code: err.code })
        skipped++
        continue
      }
      const row = await tx.planLessonRule.create({
        data: {
          kind: parsed.kind,
          params: parsed.params as Prisma.InputJsonValue,
          sourceProjectId: projectId,
          scope: "project",
          state: "draft",
          quote: d.quote,
          sourceLessonId: d.sourceLessonId,
          sourceSprintId: d.sourceSprintId,
          createdByKind: "llm",
          createdById: null,
        },
        select: { id: true, kind: true },
      })
      await auditRule(tx, projectId, row.id, LLM_ACTOR, "draft", { kind: row.kind, createdByKind: "llm" })
      created.push(row.id)
      live++
    }
    return { created, skipped }
  }
  return db ? run(db) : withTransaction(run)
}

/** Load a rule of this project for a project route (shared rules belong to the admin routes). */
async function loadOwn(tx: Db, projectId: string, ruleId: string): Promise<RuleRow> {
  const row = await tx.planLessonRule.findFirst({ where: { id: ruleId, sourceProjectId: projectId, scope: "project" } })
  if (!row) throw notFound()
  return row
}

function assertVersion(row: RuleRow, version: number): void {
  if (row.version !== version) throw new ConflictError("反省点の規則が変更されています", {}, "PLAN_RULE_CHANGED")
}

function assertState(row: RuleRow, ...states: LessonRuleState[]): void {
  if (!states.includes(row.state as LessonRuleState)) throw new ConflictError("反省点の規則の状態が変わっています", {}, "PLAN_RULE_STATE")
}

/**
 * Conditional write: applies only while the row still has the version (and state) it was read with, so two
 * concurrent confirms / edits cannot both win. A lost race is PLAN_RULE_CHANGED.
 */
async function guardedUpdate(tx: Db, row: RuleRow, data: Prisma.PlanLessonRuleUpdateManyMutationInput): Promise<RuleRow> {
  const res = await tx.planLessonRule.updateMany({ where: { id: row.id, version: row.version, state: row.state, scope: row.scope }, data: { ...data, version: { increment: 1 } } })
  if (res.count !== 1) throw new ConflictError("反省点の規則が変更されています", {}, "PLAN_RULE_CHANGED")
  return tx.planLessonRule.findUniqueOrThrow({ where: { id: row.id } })
}

export async function updateDraft(projectId: string, ruleId: string, input: UpdateDraftInput, actor: Actor): Promise<LessonRuleDto> {
  const parsed = validateContent(input.kind, input.params)
  return withTransaction(async (tx) => {
    const row = await loadOwn(tx, projectId, ruleId)
    assertState(row, "draft")
    assertVersion(row, input.version)
    const next = await guardedUpdate(tx, row, {
      kind: parsed.kind,
      params: parsed.params as Prisma.InputJsonValue,
      ...(input.quote !== undefined ? { quote: input.quote } : {}),
    })
    await auditRule(tx, projectId, row.id, actor, "edit", { kind: next.kind })
    return (await withConfidentiality(tx, [next]))[0]
  })
}

/**
 * Confirm ONE draft of this project. The request repeats the kind and numbers shown; a draft edited in between (other
 * numbers, other version) is refused with PLAN_RULE_CHANGED rather than confirming something nobody saw.
 */
export async function confirmRule(projectId: string, ruleId: string, input: ConfirmRuleInput, actor: Actor): Promise<LessonRuleDto> {
  return withTransaction(async (tx) => {
    const row = await loadOwn(tx, projectId, ruleId)
    assertState(row, "draft")
    assertVersion(row, input.version)
    if (!sameRuleContent(row, input)) throw new ConflictError("確定しようとした種類と数字が保存されている規則と違います", {}, "PLAN_RULE_CHANGED")
    validateContent(row.kind, row.params, "confirmed")
    const next = await guardedUpdate(tx, row, { state: "confirmed", confirmedById: actor.userId, confirmedAt: new Date() })
    await auditRule(tx, projectId, row.id, actor, "confirm", { kind: row.kind, params: row.params })
    return (await withConfidentiality(tx, [next]))[0]
  })
}

/** Retire a draft or confirmed rule of this project (it stops changing plans; the row is kept for the audit). */
export async function retireRule(projectId: string, ruleId: string, version: number, actor: Actor): Promise<LessonRuleDto> {
  return withTransaction(async (tx) => {
    const row = await loadOwn(tx, projectId, ruleId)
    assertState(row, "draft", "confirmed")
    assertVersion(row, version)
    const next = await guardedUpdate(tx, row, {
      state: "retired",
      retiredById: actor.userId,
      retiredAt: new Date(),
      promotionLineage: null,
      promotionProjectType: null,
      promotionRequestedById: null,
      promotionRequestedAt: null,
    })
    await auditRule(tx, projectId, row.id, actor, "retire")
    return (await withConfidentiality(tx, [next]))[0]
  })
}

function promotionRefusal(reason: string): ValidationError | ConflictError {
  if (reason === "not_confirmed" || reason === "already_shared") return new ConflictError("反省点の規則の状態が変わっています", { reason }, "PLAN_RULE_STATE")
  return new ValidationError("この規則は他のプロジェクトへ広げられません", { reason }, "PLAN_RULE_PROMOTION_BLOCKED")
}

/** The source project's PO asks an admin to widen a confirmed project rule to a lineage and / or project type. */
export async function requestPromotion(projectId: string, ruleId: string, input: PromotionRequestInput, actor: Actor): Promise<LessonRuleDto> {
  return withTransaction(async (tx) => {
    const row = await loadOwn(tx, projectId, ruleId)
    assertVersion(row, input.version)
    // One open request at a time: an admin deciding it must not see its filters change underneath.
    if (row.promotionRequestedAt !== null) throw new ConflictError("すでに共有を申請しています", {}, "PLAN_RULE_STATE")
    // The PO may widen only toward what the project itself is: one of its own plan lineages and / or its own type.
    // (A wider reach — another department's template family — is not the PO's to ask for.)
    const context = await lessonRulePageContext(projectId, tx)
    if (input.lineage && !context.lineages.includes(input.lineage)) throw invalidSource("共有先の系統は、このプロジェクトが読み込んだ計画の系統から選んでください")
    if (input.projectType && input.projectType !== context.projectType) throw invalidSource("共有先の種類は、このプロジェクトの種類だけです")
    const taint = (await sourceConfidentiality(tx, [row])).get(row.id) ?? true
    const block = promotionBlock(scopeFacts(row), taint)
    if (block) throw promotionRefusal(block)
    const next = await guardedUpdate(tx, row, {
      promotionLineage: input.lineage ?? null,
      promotionProjectType: input.projectType ?? null,
      promotionRequestedById: actor.userId,
      promotionRequestedAt: new Date(),
    })
    await auditRule(tx, projectId, row.id, actor, "request_promotion", { lineage: next.promotionLineage, projectType: next.promotionProjectType })
    return toDto(next, taint)
  })
}

// ---------------------------------------------------------------- admin (canConfirmLineageRule) -----------------

export interface AdminLessonRuleDto extends LessonRuleDto {
  sourceProjectId: string
  sourceProjectName: string
}

/** Shared rules and pending promotion requests across projects, for the admin screen. */
export async function listSharedAndRequested(db: Db = defaultDb): Promise<AdminLessonRuleDto[]> {
  // Pending requests are read on their own, so a long list of shared rules can never push one out of view.
  const include = { sourceProject: { select: { name: true } } } as const
  const [pending, shared] = await Promise.all([
    db.planLessonRule.findMany({ where: { scope: "project", state: "confirmed", promotionRequestedAt: { not: null } }, orderBy: [{ promotionRequestedAt: "asc" }, { id: "asc" }], take: LIST_MAX, include }),
    db.planLessonRule.findMany({ where: { scope: "shared" }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: LIST_MAX, include }),
  ])
  const rows = [...pending, ...shared]
  const dtos = await withConfidentiality(db, rows)
  return dtos.map((d, i) => ({ ...d, sourceProjectId: rows[i].sourceProjectId, sourceProjectName: rows[i].sourceProject.name }))
}

/**
 * Admin decision on a promotion request. Confirm re-checks the sources NOW (a source that became confidential since
 * the request blocks it), repeats the kind and numbers, widens the scope and REMOVES the quote (plan 12 §2.3).
 */
export async function decidePromotion(ruleId: string, input: PromotionDecisionInput, actor: Actor): Promise<LessonRuleDto> {
  return withTransaction(async (tx) => {
    const row = await tx.planLessonRule.findUnique({ where: { id: ruleId } })
    if (!row || row.scope !== "project" || row.promotionRequestedAt === null) throw notFound()
    assertVersion(row, input.version)
    const clearRequest = { promotionLineage: null, promotionProjectType: null, promotionRequestedById: null, promotionRequestedAt: null }
    if (input.decision === "reject") {
      const next = await guardedUpdate(tx, row, clearRequest)
      await auditRule(tx, row.sourceProjectId, row.id, actor, "reject_promotion")
      return (await withConfidentiality(tx, [next]))[0]
    }
    // The admin repeats the numbers AND the requested reach they saw; anything else than the stored request is refused.
    const sameReach = (input.lineage ?? null) === row.promotionLineage && (input.projectType ?? null) === row.promotionProjectType
    if (!sameRuleContent(row, input) || !sameReach) throw new ConflictError("確定しようとした内容が保存されている申請と違います", {}, "PLAN_RULE_CHANGED")
    const taint = (await sourceConfidentiality(tx, [row])).get(row.id) ?? true
    const block = promotionBlock(scopeFacts(row), taint)
    if (block) throw promotionRefusal(block)
    const next = await guardedUpdate(tx, row, {
      scope: "shared",
      lineage: row.promotionLineage,
      projectType: row.promotionProjectType,
      quote: null,
      promotedById: actor.userId,
      promotedAt: new Date(),
      ...clearRequest,
    })
    await auditRule(tx, row.sourceProjectId, row.id, actor, "promote", { lineage: next.lineage, projectType: next.projectType })
    return toDto(next, taint)
  })
}

/** Admin retires a shared rule. */
export async function retireSharedRule(ruleId: string, version: number, actor: Actor): Promise<LessonRuleDto> {
  return withTransaction(async (tx) => {
    const row = await tx.planLessonRule.findUnique({ where: { id: ruleId } })
    if (!row || row.scope !== "shared") throw notFound()
    assertState(row, "confirmed")
    assertVersion(row, version)
    const next = await guardedUpdate(tx, row, { state: "retired", retiredById: actor.userId, retiredAt: new Date() })
    await auditRule(tx, row.sourceProjectId, row.id, actor, "retire")
    return (await withConfidentiality(tx, [next]))[0]
  })
}

// ---------------------------------------------------------------- use ---------------------------------------------

export interface EffectiveRules {
  /** Confirmed rules that apply to the target, ready for `applyLessonRules`. */
  rules: LessonRule[]
  /** Candidates that did not apply, by id (no other detail: a shared rule's source is not the reader's business). */
  skipped: { id: string; reason: RuleSkipReason | "invalid_stored" }[]
}

/**
 * The confirmed rules that may change the plan of `target` right now: the project's own confirmed rules plus shared
 * rules whose filters match, with the cited sources re-checked for confidentiality at this moment.
 */
export async function effectiveLessonRules(target: RuleTarget, db: Db = defaultDb): Promise<EffectiveRules> {
  const rows = await db.planLessonRule.findMany({
    where: {
      state: "confirmed",
      OR: [
        // The project's own rules, shared ones included (sharing never takes a rule from its source project).
        { sourceProjectId: target.projectId },
        {
          scope: "shared",
          AND: [
            { OR: [{ lineage: null }, ...(target.lineage !== null ? [{ lineage: target.lineage }] : [])] },
            { OR: [{ projectType: null }, ...(target.projectType !== null ? [{ projectType: target.projectType }] : [])] },
          ],
        },
      ],
    },
    orderBy: { id: "asc" },
    take: EFFECTIVE_RULES_MAX + 1,
  })
  if (rows.length > EFFECTIVE_RULES_MAX) {
    // Never silently plan with a cut list: the ceiling is far above any real count, so reaching it is a defect.
    log.error("too many lesson rules apply to one plan; refusing to choose a subset", { projectId: target.projectId, ceiling: EFFECTIVE_RULES_MAX })
    throw new Error(`more than ${EFFECTIVE_RULES_MAX} lesson rules apply to project ${target.projectId}`)
  }
  const taint = await sourceConfidentiality(db, rows)
  const rules: LessonRule[] = []
  const skipped: EffectiveRules["skipped"] = []
  for (const row of rows) {
    const use = decideRuleUse(scopeFacts(row), target, taint.get(row.id) ?? true)
    if (!use.use) {
      skipped.push({ id: row.id, reason: use.reason })
      continue
    }
    try {
      rules.push(parseLessonRule({ id: row.id, state: "confirmed", kind: row.kind, params: row.params }))
    } catch (err) {
      // A stored rule that no longer validates (schema tightened later) must not change a plan, and must not vanish
      // silently either.
      log.warn("stored lesson rule no longer validates; skipped", { ruleId: row.id, error: err instanceof Error ? err.message : String(err) })
      skipped.push({ id: row.id, reason: "invalid_stored" })
    }
  }
  return { rules, skipped }
}
