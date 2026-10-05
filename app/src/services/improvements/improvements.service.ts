import { deleteUploadedFile } from "@/lib/upload/stored-files"
import type { KaizenStage } from "@/lib/improvement/constants"
import { summarizeImprovements } from "@/lib/improvement/metrics"
import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logUpdate } from "@/services/_shared/activity"
import { optionalDate } from "@/services/_shared/dates"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { attachI18n, enqueueIn, getI18nFor, prepareText } from "@/services/_shared/translations"
import { deleteReleaseItem } from "@/services/releases/releases.service"
import { scheduleAutoChecks } from "./improvements.checks"
import * as repo from "./improvements.repository"
import type { UpdateImprovementInput } from "./improvements.schemas"
import { assertStageAllowed, assertTargetDirection } from "./improvements.stage"

/**
 * 改善成果ボード of a process_improvement project: the project's release
 * items read as improvements (effect Before → After, standardisation,
 * 横展開, 定着確認, photos). Writes go to the same ReleaseBacklogItem rows the
 * old release screen used, so imported items and existing fields carry over.
 */

type BoardRow = Awaited<ReturnType<typeof repo.findBoardItems>>[number]

const notFound = () => new NotFoundError("Not found")

/** Rows → DTOs: release-item and PBI translations attached, a trashed source PBI hidden. */
async function toDtos(rows: readonly BoardRow[]) {
  const [withI18n, pbI18n] = await Promise.all([
    attachI18n("release_item", [...rows]),
    getI18nFor("backlog_item", rows.map((r) => r.pbItem?.id ?? "").filter(Boolean)),
  ])
  return withI18n.map((r) => ({
    ...r,
    pbItem: r.pbItem && !r.pbItem.deletedAt ? { ...r.pbItem, i18n: pbI18n.get(r.pbItem.id) ?? {} } : null,
  }))
}

export type ImprovementDto = Awaited<ReturnType<typeof toDtos>>[number]

/** Board payload: items, summary strip numbers and 横展開先 name suggestions. */
export async function getBoard(projectId: string) {
  const [rows, rolloutNames] = await Promise.all([repo.findBoardItems(defaultDb, projectId), repo.findRolloutNames(defaultDb, projectId)])
  const items = await toDtos(rows)
  return { items, summary: summarizeImprovements(items), rolloutNames }
}

export async function getSummary(projectId: string) {
  return summarizeImprovements(await repo.findBoardItems(defaultDb, projectId))
}

export async function getImprovement(projectId: string, id: string): Promise<ImprovementDto> {
  const row = await repo.findBoardItem(defaultDb, projectId, id)
  if (!row) throw notFound()
  const [dto] = await toDtos([row])
  return dto
}

type ItemState = NonNullable<Awaited<ReturnType<typeof repo.findItemState>>>

/** Guard the effect values and the stage against the merged (stored + incoming) state. */
async function validateUpdate(tx: Db, state: ItemState, input: UpdateImprovementInput): Promise<void> {
  if (input.direction !== undefined || input.baselineValue !== undefined || input.targetValue !== undefined) {
    assertTargetDirection(
      input.direction ?? state.direction,
      input.baselineValue !== undefined ? input.baselineValue : state.baselineValue,
      input.targetValue !== undefined ? input.targetValue : state.targetValue
    )
  }
  if (input.kaizenStage === undefined || input.kaizenStage === state.kaizenStage) return
  assertStageAllowed(input.kaizenStage as KaizenStage, {
    manualLink: input.manualLink !== undefined ? input.manualLink : state.manualLink,
    sustainedChecks: input.kaizenStage === "sustained" ? await repo.countSustainedChecks(tx, state.id) : 0,
  })
}

/** Date columns from "YYYY-MM-DD"; 標準化日 defaults to today when the item becomes 標準化済み. */
function dateColumns(state: ItemState, input: UpdateImprovementInput, now: Date) {
  const standardizedAt = optionalDate(input.standardizedAt)
  const becomesStandardized = input.kaizenStage === "standardized" && state.kaizenStage !== "standardized"
  const needsDefault = becomesStandardized && !standardizedAt && !state.standardizedAt
  return {
    releaseDate: optionalDate(input.releaseDate),
    standardizedAt: needsDefault ? new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) : standardizedAt,
  }
}

/** The input without the two "YYYY-MM-DD" fields (converted by dateColumns). */
function omitDateFields(input: UpdateImprovementInput): Omit<UpdateImprovementInput, "releaseDate" | "standardizedAt"> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== "releaseDate" && key !== "standardizedAt"))
}

function releaseDateChanged(state: ItemState, next: Date | null | undefined): next is Date {
  return next instanceof Date && !isNaN(next.getTime()) && next.getTime() !== state.releaseDate?.getTime()
}

/** Update effect / standardisation / stage fields; a new 展開日 schedules the 定着確認. */
export async function updateImprovement(projectId: string, id: string, input: UpdateImprovementInput, actor: Actor, now: Date = new Date()) {
  const data = await prepareText(input, actor.userId)
  const rest = omitDateFields(data)
  await withTransaction(async (tx) => {
    const state = await repo.findItemState(tx, projectId, id)
    if (!state) throw notFound()
    await validateUpdate(tx, state, input)
    const dates = dateColumns(state, input, now)
    const before = await loadSnapshot(tx, "release", id)
    const updated = await repo.updateItem(tx, projectId, id, {
      ...rest,
      ...(dates.releaseDate !== undefined ? { releaseDate: dates.releaseDate } : {}),
      ...(dates.standardizedAt !== undefined ? { standardizedAt: dates.standardizedAt } : {}),
    })
    if (releaseDateChanged(state, dates.releaseDate)) await scheduleAutoChecks(tx, id, dates.releaseDate)
    await enqueueIn(tx, "release_item", id, data)
    await logUpdate(tx, { projectId, entityType: "release", entityId: id, actor, before, after: updated })
  })
  return getImprovement(projectId, id)
}

/** Delete the item (release service: activity + translations), then its stored photo files. */
export async function deleteImprovement(projectId: string, id: string, actor: Actor | null = null): Promise<void> {
  if (!(await repo.findItemState(defaultDb, projectId, id))) throw notFound()
  const photos = await repo.findPhotoFileNames(defaultDb, id)
  await deleteReleaseItem(projectId, id, actor)
  await Promise.all(photos.map((p) => deleteUploadedFile(projectId, p.fileName)))
}
