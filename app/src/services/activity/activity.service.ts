import { labelOf, type ActivityDiff } from "@/services/_shared/activity"
import { toPage, type Page } from "@/services/_shared/cursor"
import { defaultDb } from "@/services/_shared/db"
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

export async function listProjectActivity(projectId: string, query: ProjectActivityQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findProjectActivity(defaultDb, projectId, query)
  const page = toPage(rows, query.limit, toActivityDto)
  return { ...page, items: await withMemberNames(await withEntityLabels(projectId, page.items)) }
}

export async function listEntityActivity(projectId: string, ref: EntityRef, query: PageQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findEntityActivity(defaultDb, projectId, ref.entityType, ref.entityId, query)
  return toPage(rows, query.limit, toActivityDto)
}

export async function listUserActivity(userId: string, query: PageQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findUserActivity(defaultDb, userId, query)
  return toPage(rows, query.limit, toActivityDto)
}
