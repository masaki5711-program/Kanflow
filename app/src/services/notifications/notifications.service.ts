import { toPage, type Page } from "@/services/_shared/cursor"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { NOTIFICATION_TYPES, type NotificationType } from "@/services/_shared/notifications"
import { getI18nFor } from "@/services/_shared/translations"
import type { EntityI18n, TranslatableEntity } from "@/lib/translation/types"
import * as repo from "./notifications.repository"
import type { ListNotificationsQuery, UpdatePreferencesInput } from "./notifications.schemas"

interface NotificationRow {
  id: string
  type: string
  projectId: string | null
  entityType: string | null
  entityId: string | null
  payload: string | null
  readAt: Date | null
  createdAt: Date
  project: { id: string; name: string } | null
}

export interface NotificationDto {
  id: string
  type: string
  projectId: string | null
  /** `i18n` carries the translated project name (shown in the viewer's language). */
  project: { id: string; name: string; i18n?: EntityI18n } | null
  entityType: string | null
  entityId: string | null
  payload: Record<string, unknown>
  /** Translations of the notified entity (PBI / task / sprint / Icebox) so the sentence follows the UI language (A3-08). */
  entityI18n?: EntityI18n
  readAt: string | null
  createdAt: string
}

/** Unread counts per panel tab. */
export interface UnreadByGroup {
  all: number
  personal: number
  other: number
}

/** Notification entityType → translatable entity whose fields name it in the sentence. */
const ENTITY_TRANSLATION: Record<string, TranslatableEntity> = {
  pbi: "backlog_item",
  sprint_task: "sprint_task",
  sprint: "sprint",
  icebox: "icebox_item",
  plan_item: "plan_item",
}

export interface PreferenceDto {
  type: NotificationType
  enabled: boolean
}

/** Pure: stored payload JSON → object (malformed → {}). */
export function parsePayload(text: string | null): Record<string, unknown> {
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    projectId: row.projectId,
    project: row.project,
    entityType: row.entityType,
    entityId: row.entityId,
    payload: parsePayload(row.payload),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listMyNotifications(
  userId: string,
  query: ListNotificationsQuery
): Promise<Page<NotificationDto> & { unreadCount: number; unreadByGroup: UnreadByGroup }> {
  const [rows, unreadCount, unreadPersonal] = await Promise.all([
    repo.findNotifications(defaultDb, userId, query),
    repo.countUnread(defaultDb, userId),
    repo.countUnread(defaultDb, userId, "personal"),
  ])
  const page = toPage(rows, query.limit, toNotificationDto)
  const items = await enrichNotifications(page.items)
  const personal = Math.min(unreadPersonal, unreadCount)
  return { ...page, items, unreadCount, unreadByGroup: { all: unreadCount, personal, other: unreadCount - personal } }
}

/** Project-name and entity translations for rendering (shared with the project updates panel). */
export async function enrichNotifications(items: NotificationDto[]): Promise<NotificationDto[]> {
  return withEntityI18n(await withProjectI18n(items))
}

function entityRef(n: NotificationDto): { entity: TranslatableEntity; id: string } | null {
  const type = typeof n.payload.entityType === "string" ? n.payload.entityType : n.entityType
  const id = typeof n.payload.entityId === "string" ? n.payload.entityId : n.entityId
  const entity = type ? ENTITY_TRANSLATION[type] : undefined
  return entity && id ? { entity, id } : null
}

/** Attach the translations of the notified entities (one lookup per entity kind). */
async function withEntityI18n(items: NotificationDto[]): Promise<NotificationDto[]> {
  const idsByEntity = new Map<TranslatableEntity, string[]>()
  for (const ref of items.map(entityRef)) {
    if (ref) idsByEntity.set(ref.entity, [...(idsByEntity.get(ref.entity) ?? []), ref.id])
  }
  if (idsByEntity.size === 0) return items
  const maps = new Map(
    await Promise.all([...idsByEntity].map(async ([entity, ids]) => [entity, await getI18nFor(entity, [...new Set(ids)])] as const))
  )
  return items.map((n) => {
    const ref = entityRef(n)
    const i18n = ref ? maps.get(ref.entity)?.get(ref.id) : undefined
    return i18n ? { ...n, entityI18n: i18n } : n
  })
}

/** Attach the translations of the project names (so the panel can show them in the UI language). */
async function withProjectI18n(items: NotificationDto[]): Promise<NotificationDto[]> {
  const ids = items.map((i) => i.project?.id ?? "").filter(Boolean)
  if (ids.length === 0) return items
  const i18n = await getI18nFor("project", ids)
  return items.map((i) => (i.project ? { ...i, project: { ...i.project, i18n: i18n.get(i.project.id) ?? {} } } : i))
}

export async function getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
  return { unreadCount: await repo.countUnread(defaultDb, userId) }
}

/** Idempotent for the owner (already read = success); someone else's / unknown id = 404. */
export async function markNotificationRead(userId: string, id: string, now: Date = new Date()): Promise<void> {
  const { count } = await repo.markRead(defaultDb, userId, id, now)
  if (count > 0) return
  if (!(await repo.findOwnNotificationId(defaultDb, userId, id))) throw new NotFoundError()
}

export async function markAllNotificationsRead(userId: string, now: Date = new Date()): Promise<{ updated: number }> {
  const { count } = await repo.markAllRead(defaultDb, userId, now)
  return { updated: count }
}

/** Every known type with its effective setting (missing row = enabled). */
export async function getNotificationPreferences(userId: string): Promise<{ preferences: PreferenceDto[] }> {
  const rows = await repo.findPreferences(defaultDb, userId)
  const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.type))
  return { preferences: NOTIFICATION_TYPES.map((type) => ({ type, enabled: !disabled.has(type) })) }
}

export async function updateNotificationPreferences(userId: string, input: UpdatePreferencesInput) {
  await withTransaction(async (tx) => {
    for (const p of input.preferences) await repo.upsertPreference(tx, userId, p.type, p.enabled)
  })
  return getNotificationPreferences(userId)
}
