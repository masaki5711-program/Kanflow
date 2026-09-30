import { toPage, type Page } from "@/services/_shared/cursor"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { NOTIFICATION_TYPES, type NotificationType } from "@/services/_shared/notifications"
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
  project: { id: string; name: string } | null
  entityType: string | null
  entityId: string | null
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
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
): Promise<Page<NotificationDto> & { unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    repo.findNotifications(defaultDb, userId, query),
    repo.countUnread(defaultDb, userId),
  ])
  return { ...toPage(rows, query.limit, toNotificationDto), unreadCount }
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
