import { checklistKey, stageConditions } from "@/lib/milestones/checklist"
import { summarizeBoard } from "@/lib/milestones/summary"
import { toDateKeyOrNull, tokyoDateKey } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { attachI18n } from "@/services/_shared/translations"
import * as parts from "./milestones.parts.repository"
import * as repo from "./milestones.repository"
import type { TickConditionInput, UpdateSettingsInput } from "./milestones.schemas"
import { ensureSeeded } from "./milestones.seed"
import { logBoard, notFound } from "./milestones.shared"
import { buildStages, type PlanRow } from "./milestones.stages"

/**
 * マイルストーン・検収ボード of a general project (/releases): one read model
 * — stages straight from 全体計画, チェック項目, 残課題, 引き渡し資料, 予算 and
 * 推移 plus the summary strip — and the settings / 完了条件 writes. The other
 * parts have their own modules (checks / punch / documents / budget / metrics).
 */

type Parts = Awaited<ReturnType<typeof repo.findBoardParts>>

const day = (d: Date | null) => toDateKeyOrNull(d)

/** Date columns as "YYYY-MM-DD" keys (calendar days, UTC midnight in the DB). */
function partsDto([checks, punch, documents, budgetLines, metrics]: Parts) {
  return {
    checks: checks.map((c) => ({ ...c, checkedAt: day(c.checkedAt) })),
    punchItems: punch.map((p) => ({ ...p, dueDate: day(p.dueDate) })),
    documents,
    budgetLines,
    metrics,
  }
}

export type BoardPartsDto = ReturnType<typeof partsDto>

/** Unique template names in load order (the page header). */
function templateNames(apps: ReadonlyArray<{ templateName: string }>): string[] {
  return [...new Set(apps.map((a) => a.templateName))]
}

/** GET /milestones: seeds pending template loads first, then reads everything. */
export async function getBoard(projectId: string, now: Date = new Date()) {
  const apps = await repo.findApplications(defaultDb, projectId)
  await ensureSeeded(projectId, apps)
  const [rows, rawParts, settings, members] = await Promise.all([
    repo.findPlanRows(defaultDb, projectId),
    repo.findBoardParts(defaultDb, projectId),
    repo.findSettings(defaultDb, projectId),
    repo.findMembers(defaultDb, projectId),
  ])
  const todayKey = tokyoDateKey(now)
  const stages = buildStages((await attachI18n("plan_item", [...rows])) as PlanRow[], todayKey)
  const boardParts = partsDto(rawParts)
  const budgetEnabled = settings?.budgetEnabled ?? false
  return {
    todayKey,
    settings: { checkLabel: settings?.checkLabel ?? null, budgetEnabled, trendEnabled: settings?.trendEnabled ?? false },
    templates: templateNames(apps),
    members: members.map((m) => m.user),
    stages,
    ...boardParts,
    summary: summarizeBoard({ stages, checks: boardParts.checks, punchItems: boardParts.punchItems, documents: boardParts.documents, budgetEnabled, budgetLines: boardParts.budgetLines }, todayKey),
  }
}

export type MilestoneBoardDto = Awaited<ReturnType<typeof getBoard>>

/** PATCH /milestones/settings: check 呼び名, 予算 / 推移 on-off (plan.write). */
export async function updateSettings(projectId: string, input: UpdateSettingsInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const before = await repo.findSettings(tx, projectId)
    const data = { ...input, ...(input.checkLabel !== undefined ? { checkLabel: input.checkLabel || null } : {}) }
    const after = await repo.upsertSettings(tx, projectId, data)
    for (const key of ["checkLabel", "budgetEnabled", "trendEnabled"] as const) {
      const from = before?.[key] ?? null
      if (data[key] !== undefined && from !== after[key]) await logBoard(tx, projectId, actor, `milestone_${key}`, { from, to: after[key] })
    }
    return { checkLabel: after.checkLabel, budgetEnabled: after.budgetEnabled, trendEnabled: after.trendEnabled }
  })
}

/**
 * PUT /milestones/stages/[planItemId]/checklist: tick / untick one 完了条件
 * of a live plan item (any member). The label must be one of the item's
 * current conditions (404 otherwise).
 */
export async function tickCondition(projectId: string, planItemId: string, input: TickConditionInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const item = await repo.findLivePlanItem(tx, projectId, planItemId)
    if (!item) throw notFound()
    const label = checklistKey(input.label)
    if (!stageConditions(item.notes).some((c) => checklistKey(c) === label)) throw new NotFoundError("完了条件が見つかりません")
    if (input.checked) await parts.tickCondition(tx, planItemId, label, actor)
    else await parts.untickCondition(tx, planItemId, label)
    await logBoard(tx, projectId, actor, "milestoneCondition", { from: input.checked ? null : label, to: input.checked ? label : null }, { planItemId, stage: item.name })
    return { planItemId, label, checked: input.checked }
  })
}
