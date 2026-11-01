import { LABEL_ENTITY } from "@/lib/translation/localize-label"
import type { EntityI18n, TranslatableEntity } from "@/lib/translation/types"
import { labelOf, type ActivityDiff } from "@/services/_shared/activity"
import { encodeCursor, toPage, type Page } from "@/services/_shared/cursor"
import { defaultDb } from "@/services/_shared/db"
import { getI18nFor } from "@/services/_shared/translations"
import * as repo from "./activity.repository"
import type { EntityRef, PageQuery, ProjectActivityQuery } from "./activity.schemas"

interface ActivityRow {
  id: string
  projectId: string
  entityType: string
  entityId: string
  action: string
  actorId: string | null
  actorName: string | null
  diff: string | null
  createdAt: Date
  actor: { id: string; name: string } | null
  project?: { id: string; name: string } | null
}

/** One activity entry as the API returns it. */
export interface ActivityDto {
  id: string
  projectId: string
  entityType: string
  entityId: string
  action: string
  /** Current user (name follows renames); falls back to the stored name when the user is gone. */
  actor: { id: string | null; name: string | null } | null
  changes: ActivityDiff["changes"] | null
  label: string | null
  meta: ActivityDiff["meta"] | null
  createdAt: string
  /** Only in the user feed. */
  project?: { id: string; name: string } | null
  /** Project feed: translations of the entity, so the label can follow the viewer's language. */
  entityI18n?: EntityI18n
}

/** Pure: parse the stored diff JSON; malformed text → empty diff. */
export function parseDiff(text: string | null): ActivityDiff {
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ActivityDiff) : {}
  } catch {
    return {}
  }
}

/** Pure: DB row → DTO. */
export function toActivityDto(row: ActivityRow): ActivityDto {
  const diff = parseDiff(row.diff)
  const actor = row.actor ?? (row.actorId || row.actorName ? { id: row.actorId, name: row.actorName } : null)
  return {
    id: row.id,
    projectId: row.projectId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    actor,
    changes: diff.changes ?? null,
    label: diff.label ?? null,
    meta: diff.meta ?? null,
    createdAt: row.createdAt.toISOString(),
    ...(row.project !== undefined ? { project: row.project } : {}),
  }
}

const LOOKUP_TYPES = ["pbi", "sprint_task", "sprint", "plan_item"] as const
type LookupType = (typeof LOOKUP_TYPES)[number]

function isLookupType(type: string): type is LookupType {
  return (LOOKUP_TYPES as readonly string[]).includes(type)
}

/**
 * Entries logged without a label (e.g. a PBI moved into a sprint) get the
 * entity's current name, or "#12" for a PBI without a title. One query per type.
 */
export async function withEntityLabels(projectId: string, items: readonly ActivityDto[]): Promise<ActivityDto[]> {
  const ids: Record<LookupType, string[]> = { pbi: [], sprint_task: [], sprint: [], plan_item: [] }
  for (const item of items) {
    if (!item.label && isLookupType(item.entityType) && !ids[item.entityType].includes(item.entityId)) ids[item.entityType].push(item.entityId)
  }
  if (LOOKUP_TYPES.every((type) => ids[type].length === 0)) return [...items]
  const rows = await repo.findEntityLabelRows(defaultDb, projectId, ids)
  const labels = new Map<string, string>()
  for (const p of rows.pbis) labels.set(`pbi:${p.id}`, labelOf("pbi", p) ?? `#${p.displayId}`)
  for (const task of rows.tasks) setLabel(labels, "sprint_task", task.id, labelOf("sprint_task", task))
  for (const s of rows.sprints) setLabel(labels, "sprint", s.id, labelOf("sprint", s))
  for (const p of rows.planItems) setLabel(labels, "plan_item", p.id, labelOf("plan_item", p))
  return items.map((item) => (item.label ? item : { ...item, label: labels.get(`${item.entityType}:${item.entityId}`) ?? null }))
}

function setLabel(labels: Map<string, string>, type: LookupType, id: string, label: string | undefined) {
  if (label) labels.set(`${type}:${id}`, label)
}

/** Pure: the user name a member entry already carries (meta.userName), or null. */
export function memberUserName(item: Pick<ActivityDto, "meta">): string | null {
  const name = item.meta?.userName
  return typeof name === "string" && name.trim() ? name.trim() : null
}

/**
 * Member entries name the user (S-12). Entries logged without `meta.userName`
 * (older rows) look it up by the user id stored as their label. One query.
 */
export async function withMemberNames(items: readonly ActivityDto[]): Promise<ActivityDto[]> {
  const needsName = (item: ActivityDto) => item.entityType === "member" && !memberUserName(item) && !!item.label
  const userIds = [...new Set(items.filter(needsName).map((item) => item.label as string))]
  if (userIds.length === 0) return [...items]
  const names = new Map((await repo.findUserNames(defaultDb, userIds)).map((u) => [u.id, u.name]))
  return items.map((item) => {
    const userName = needsName(item) ? names.get(item.label as string) : undefined
    return userName ? { ...item, meta: { ...(item.meta ?? {}), userName } } : item
  })
}

/** Attach the entities' translations (one lookup per translatable entity kind). */
export async function withEntityI18n(items: readonly ActivityDto[]): Promise<ActivityDto[]> {
  const idsByEntity = new Map<TranslatableEntity, string[]>()
  for (const item of items) {
    const entity = LABEL_ENTITY[item.entityType]
    if (entity && item.label) idsByEntity.set(entity, [...(idsByEntity.get(entity) ?? []), item.entityId])
  }
  if (idsByEntity.size === 0) return [...items]
  const maps = new Map(
    await Promise.all([...idsByEntity].map(async ([entity, ids]) => [entity, await getI18nFor(entity, [...new Set(ids)])] as const))
  )
  return items.map((item) => {
    const i18n = maps.get(LABEL_ENTITY[item.entityType])?.get(item.entityId)
    return i18n ? { ...item, entityI18n: i18n } : item
  })
}

/** Rows read per round while the token feed drops hidden ones, and the most rounds before it hands back a short page. */
const SCAN_BATCH = 100
const MAX_SCAN_ROUNDS = 20

/**
 * Token feeds (D-5), fail closed. A row about a PBI is kept only when that PBI still exists and is not
 * confidential. A sprint task / release row is kept only when its owning PBI is known (recorded in
 * `meta.pbItemId` when it was written, else read from the entity if it still exists) and passes the same
 * test; a task or release whose parent cannot be resolved (old row with no record and the entity deleted)
 * is dropped. A release item recorded as having no PBI is kept. Other entity types carry no PBI text.
 */
async function visibleToTokens(rows: readonly ActivityDto[]): Promise<ActivityDto[]> {
  const recorded = (row: ActivityDto): string | null | undefined => {
    const meta = row.meta
    return meta && "pbItemId" in meta ? ((meta.pbItemId as string | null | undefined) ?? null) : undefined
  }
  const lookup = { sprint_task: [] as string[], release: [] as string[] }
  for (const row of rows) {
    if ((row.entityType === "sprint_task" || row.entityType === "release") && recorded(row) === undefined) lookup[row.entityType].push(row.entityId)
  }
  const found = await repo.findParentPbiIds(defaultDb, lookup)
  const live = new Map<string, string | null>([...found.tasks, ...found.releases].map((r) => [`${r.id}`, r.pbItemId]))
  const parentOf = (row: ActivityDto): string | null | undefined => {
    if (row.entityType === "pbi") return row.entityId
    if (row.entityType !== "sprint_task" && row.entityType !== "release") return null
    const rec = recorded(row)
    return rec !== undefined ? rec : live.has(row.entityId) ? (live.get(row.entityId) ?? null) : undefined
  }
  const parents = rows.map(parentOf)
  const open = await repo.findOpenPbiIds(defaultDb, parents.filter((p): p is string => typeof p === "string"))
  return rows.filter((_, i) => {
    const parent = parents[i]
    if (parent === undefined) return false // unresolvable: hidden
    return parent === null || open.has(parent)
  })
}

export async function listProjectActivity(
  projectId: string,
  query: ProjectActivityQuery,
  options: { hideConfidential?: boolean } = {}
): Promise<Page<ActivityDto>> {
  if (!options.hideConfidential) {
    const rows = await repo.findProjectActivity(defaultDb, projectId, query)
    const page = toPage(rows, query.limit, toActivityDto)
    return { ...page, items: await withEntityI18n(await withMemberNames(await withEntityLabels(projectId, page.items))) }
  }
  // Token surfaces: scan newest-first, keep the visible rows until the page (and one more) is full.
  const visible: Array<{ row: Awaited<ReturnType<typeof repo.findProjectActivity>>[number]; dto: ActivityDto }> = []
  let cursor = query.cursor
  let exhausted = false
  let lastScanned: { id: string; createdAt: Date } | undefined
  for (let round = 0; round < MAX_SCAN_ROUNDS && visible.length <= query.limit; round++) {
    const rows = await repo.findProjectActivity(defaultDb, projectId, { ...query, cursor, limit: SCAN_BATCH })
    const batch = rows.slice(0, SCAN_BATCH)
    if (batch.length > 0) lastScanned = batch[batch.length - 1]
    const dtos = batch.map(toActivityDto)
    const keep = new Set((await visibleToTokens(dtos)).map((d) => d.id))
    batch.forEach((row, i) => {
      if (keep.has(row.id)) visible.push({ row, dto: dtos[i] as ActivityDto })
    })
    if (rows.length <= SCAN_BATCH) {
      exhausted = true
      break
    }
    cursor = lastScanned ? encodeCursor(lastScanned) : cursor
  }
  const full = visible.length > query.limit || exhausted
  const pageRows = visible.slice(0, query.limit)
  const nextCursor = full ? (visible.length > query.limit ? encodeCursor(pageRows[pageRows.length - 1]!.row) : null) : lastScanned ? encodeCursor(lastScanned) : null
  const items = await withEntityI18n(await withMemberNames(await withEntityLabels(projectId, pageRows.map((v) => v.dto))))
  return { items, nextCursor }
}

export async function listEntityActivity(projectId: string, ref: EntityRef, query: PageQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findEntityActivity(defaultDb, projectId, ref.entityType, ref.entityId, query)
  return toPage(rows, query.limit, toActivityDto)
}

export async function listUserActivity(userId: string, query: PageQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findUserActivity(defaultDb, userId, query)
  return toPage(rows, query.limit, toActivityDto)
}
