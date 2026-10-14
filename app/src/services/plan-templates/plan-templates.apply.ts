/**
 * Project side of plan templates: load a template into 全体計画 (undated
 * stages), list the loads, save the current plan as a template, and
 * 「日程を仮置き」 (fill undated items from a start date with their 目安期間).
 *
 * A load records a PlanTemplateApplication (content snapshot + created root
 * ids) and stamps every created PlanItem with its templateApplicationId, so
 * later template edits never change the plan and the 検収 board can find the
 * stages and the checks / documents they came from.
 */
import type { TemplateLink } from "@/lib/plan-templates/links"
import { buildApplyRows } from "@/lib/plan-templates/tree"
import { planToStages } from "@/lib/plan-templates/from-plan"
import { scheduleFrom, type ScheduledDates } from "@/lib/plan-templates/schedule"
import { parseTemplateContent, type PlanTemplateContent } from "@/lib/plan-templates/schema"
import { dateFromKey, recalcPlanProgress, toDateKeyOrNull } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { logActivity, logCreate } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import { enqueueIn } from "@/services/_shared/translations"
import { BUMP_VERSION } from "@/services/_shared/versioning"
import * as planRepo from "@/services/plan/plan.repository"
import { PARENT_MISSING } from "@/services/plan/plan.rules"
import { toTemplateDto, type PlanTemplateDto } from "./plan-templates.dto"
import * as repo from "./plan-templates.repository"
import type { ApplyTemplateInput, SavePlanAsTemplateInput, ScheduleFromInput } from "./plan-templates.schemas"
import { contentJson, insertUserTemplate, loadVisibleTemplate } from "./plan-templates.service"

export interface ApplyResult {
  applicationId: string
  createdRootIds: string[]
  createdCount: number
  /** The template had been loaded into this project before (the UI warned; inserted again anyway). */
  alreadyApplied: boolean
  /** Some created stage has a 目安期間 and was left undated (the UI then offers 「日程を仮置き」). */
  hasDurations: boolean
  /** Stages dated at load time (a start date was given); 0 = all left 日程未定. */
  scheduled: number
}

/**
 * Date the undated leaves under `rootIds` (whole plan when null) from `startDate`
 * inside the caller's transaction; returns the placed items. Parents' spans are
 * derived by the progress recalc the caller runs.
 */
async function placeDates(tx: Db, projectId: string, rootIds: string[] | null, startDate: string, skipWeekends: boolean): Promise<ScheduledDates[]> {
  const rows = await planRepo.findPlanItems(tx, projectId)
  const nodes = rows.map((r) => ({ ...r, plannedStart: toDateKeyOrNull(r.plannedStart), plannedEnd: toDateKeyOrNull(r.plannedEnd) }))
  const dependencies = await planRepo.findDependencies(tx, projectId)
  const placed = scheduleFrom(nodes, rootIds, startDate, { skipWeekends, dependencies })
  for (const p of placed) {
    await planRepo.updatePlanItem(tx, p.id, { plannedStart: dateFromKey(p.plannedStart), plannedEnd: dateFromKey(p.plannedEnd), ...BUMP_VERSION })
  }
  return placed
}

/** Top-level stages that get their own "create" activity row per load. */
const CREATE_LOG_CAP = 20

const emptyError = () => new ValidationError("読み込む工程がありません", {}, "PLAN_TEMPLATE_EMPTY")

/** Insert the rows (parents first) and return the created ids by stage path. */
async function insertStages(
  tx: Db,
  projectId: string,
  rows: ReturnType<typeof buildApplyRows>,
  parentId: string | null,
  applicationId: string,
  actor: Actor,
): Promise<Map<string, string>> {
  const baseSort = await planRepo.nextPlanSortOrder(tx, projectId, parentId)
  const ids = new Map<string, string>()
  for (const r of rows) {
    const item = await planRepo.insertPlanItem(tx, {
      projectId,
      parentId: r.parentPath === null ? parentId : (ids.get(r.parentPath) ?? null),
      name: r.name,
      description: r.description,
      notes: r.notes,
      plannedStart: null,
      plannedEnd: null,
      isMilestone: r.isMilestone,
      status: "not_started",
      progressPct: 0,
      progressMode: "manual",
      durationDays: r.durationDays,
      templateApplicationId: applicationId,
      sortOrder: r.parentPath === null ? baseSort + r.siblingIndex : r.siblingIndex + 1,
    })
    ids.set(r.path, item.id)
    await enqueueIn(tx, "plan_item", item.id, item)
    // Item history: a "create" per top-level stage (capped so a huge load cannot flood the feed).
    if (r.parentPath === null && r.siblingIndex < CREATE_LOG_CAP) await logCreate(tx, { projectId, entityType: "plan_item", entityId: item.id, actor, row: item })
  }
  return ids
}

/**
 * The template's dependencies as plan dependencies between the created stages.
 * A link whose end was excluded from this load is skipped; the template's own
 * validation already ruled out cycles and ancestor links. Returns the count.
 */
async function insertLinks(tx: Db, projectId: string, links: readonly TemplateLink[], rows: ReturnType<typeof buildApplyRows>, ids: Map<string, string>): Promise<number> {
  const idByKey = new Map(rows.flatMap((r) => (r.key && ids.has(r.path) ? [[r.key, ids.get(r.path) as string] as const] : [])))
  let count = 0
  for (const l of links) {
    const predecessorId = idByKey.get(l.from)
    const successorId = idByKey.get(l.to)
    if (!predecessorId || !successorId) continue
    await planRepo.insertDependency(tx, { projectId, predecessorId, successorId })
    count += 1
  }
  return count
}

/**
 * POST /plan/templates/apply: the template's stages (minus `excludePaths`)
 * as undated plan items under `parentId` (top level when null), after the
 * existing siblings, in one transaction.
 */
export async function applyTemplate(projectId: string, input: ApplyTemplateInput, actor: Actor): Promise<ApplyResult> {
  const template = await loadVisibleTemplate(defaultDb, input.templateId, actor)
  const content = parseTemplateContent(template.content)
  const rows = buildApplyRows(content.stages, input.excludePaths ?? [])
  if (rows.length === 0) throw emptyError()
  const parentId = input.parentId ?? null
  const startDate = input.startDate ?? null
  if (startDate && !dateFromKey(startDate)) throw new ValidationError("日付が不正です", {}, "INVALID_DATE")
  return withTransaction(async (tx) => {
    if (parentId && !(await planRepo.findPlanItem(tx, projectId, parentId))) throw new ValidationError(PARENT_MISSING, {}, "PLAN_PARENT_NOT_FOUND")
    const alreadyApplied = (await repo.countApplications(tx, projectId, template.id)) > 0
    const app = await repo.insertApplication(tx, {
      projectId,
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.version,
      content: template.content,
      createdRootIds: "[]",
      appliedById: actor.userId,
      appliedByName: actor.userName,
    })
    const ids = await insertStages(tx, projectId, rows, parentId, app.id, actor)
    const createdRootIds = rows.filter((r) => r.parentPath === null).map((r) => ids.get(r.path) as string)
    await repo.setApplicationRoots(tx, app.id, createdRootIds)
    const linked = await insertLinks(tx, projectId, content.links ?? [], rows, ids)
    // A start date dates the new stages right away (before the recalc derives the parents' spans).
    const placed = startDate ? await placeDates(tx, projectId, createdRootIds, startDate, input.skipWeekends === true) : []
    await recalcPlanProgress(projectId, [...ids.values(), parentId], tx)
    await logActivity(tx, {
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "update",
      actor,
      diff: { changes: { planTemplate: { from: null, to: template.name } }, meta: { planTemplateId: template.id, applicationId: app.id, count: rows.length, dependencies: linked } },
    })
    return {
      applicationId: app.id,
      createdRootIds,
      createdCount: rows.length,
      alreadyApplied,
      // Dated at load time: nothing left to pencil in afterwards.
      hasDurations: !startDate && rows.some((r) => r.durationDays !== null),
      scheduled: placed.length,
    }
  })
}

export interface ApplicationDto {
  id: string
  templateId: string
  templateName: string
  templateVersion: number
  createdRootIds: string[]
  appliedBy: { id: string; name: string | null } | null
  appliedAt: string
}

function parseIds(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

/** GET /plan/templates/applications: the project's loads, newest first. */
export async function listApplications(projectId: string): Promise<ApplicationDto[]> {
  return (await repo.findApplications(defaultDb, projectId)).map((a) => ({
    id: a.id,
    templateId: a.templateId,
    templateName: a.templateName,
    templateVersion: a.templateVersion,
    createdRootIds: parseIds(a.createdRootIds),
    appliedBy: a.appliedById ? { id: a.appliedById, name: a.appliedByName } : null,
    appliedAt: a.appliedAt.toISOString(),
  }))
}

/** The content snapshot of one load (checks / documents / budget as loaded), or null. */
export async function getApplicationContent(projectId: string, applicationId: string, db: Db = defaultDb): Promise<PlanTemplateContent | null> {
  const app = await repo.findApplication(db, projectId, applicationId)
  return app ? parseTemplateContent(app.content) : null
}

/** POST /plan/templates/save: the live plan tree as a new template owned by the actor. */
export async function savePlanAsTemplate(projectId: string, input: SavePlanAsTemplateInput, actor: Actor): Promise<PlanTemplateDto> {
  const items = await planRepo.findPlanItems(defaultDb, projectId)
  const result = planToStages(
    items.map((i) => ({ ...i, plannedStart: toDateKeyOrNull(i.plannedStart), plannedEnd: toDateKeyOrNull(i.plannedEnd) })),
    await planRepo.findDependencies(defaultDb, projectId),
  )
  if (!result.ok && result.reason === "empty") throw new ValidationError("保存する計画がありません", {}, "PLAN_TEMPLATE_EMPTY")
  if (!result.ok) throw new ValidationError("計画が大きすぎます", {}, "PLAN_TEMPLATE_TOO_LARGE")
  const content: PlanTemplateContent = { stages: result.stages, ...(result.links.length > 0 && { links: result.links }) }
  contentJson(content)
  const row = await withTransaction((tx) =>
    insertUserTemplate(tx, { name: input.name, description: input.description ?? null, visibility: input.visibility, content }, actor, "create"),
  )
  return toTemplateDto(row, actor)
}

/** POST /plan/schedule-from: dates for the undated leaves under `rootIds` (whole plan when omitted). */
export async function scheduleFromStart(projectId: string, input: ScheduleFromInput, actor: Actor): Promise<{ updated: number; items: ScheduledDates[] }> {
  if (!dateFromKey(input.startDate)) throw new ValidationError("日付が不正です", {}, "INVALID_DATE")
  return withTransaction(async (tx) => {
    const placed = await placeDates(tx, projectId, input.rootIds ?? null, input.startDate, input.skipWeekends === true)
    if (placed.length > 0) {
      await recalcPlanProgress(projectId, placed.map((p) => p.id), tx)
      await logActivity(tx, {
        projectId,
        entityType: "project",
        entityId: projectId,
        action: "update",
        actor,
        diff: { changes: { planSchedule: { changed: true } }, meta: { count: placed.length, startDate: input.startDate, skipWeekends: input.skipWeekends === true } },
      })
    }
    return { updated: placed.length, items: placed }
  })
}
