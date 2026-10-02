/**
 * "What's new" per user and project: activity by other members since the
 * user last confirmed the project, plus the user's unread notifications
 * (mentions, assignments, comments) of that project. Shown on the project
 * dashboard, as badges on the top page and as a dot in the sidebar.
 */
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { toActivityDto, withEntityI18n, withEntityLabels, withMemberNames, type ActivityDto } from "@/services/activity/activity.service"
import { findNotifications } from "@/services/notifications/notifications.repository"
import { enrichNotifications, toNotificationDto, type NotificationDto } from "@/services/notifications/notifications.service"
import * as repo from "./updates.repository"

/** Never-confirmed projects count the last week as new (not their whole history). */
export const FIRST_VISIT_WINDOW_DAYS = 7
/** Entries the dashboard panel lists per side. */
export const UPDATES_LIST_LIMIT = 20

const DAY_MS = 24 * 60 * 60 * 1000

/** Pure: the moment after which activity is new for the user. */
export function baselineOf(lastSeenAt: Date | null | undefined, now: Date): Date {
  return lastSeenAt ?? new Date(now.getTime() - FIRST_VISIT_WINDOW_DAYS * DAY_MS)
}

export interface UpdateSummary {
  /** Activity entries by others since the baseline. */
  newActivity: number
  /** Unread notifications of the project (all personal / other types). */
  unread: number
  /** Unread "mentioned" notifications of the project. */
  mentions: number
}

export interface ProjectUpdatesDto extends UpdateSummary {
  /** ISO baseline: entries after it are new. */
  since: string
  /** True when the user never confirmed this project (baseline = last week). */
  firstVisit: boolean
  activity: ActivityDto[]
  notifications: NotificationDto[]
}

/** GET /api/projects/:id/updates?summary=1 — counts only (sidebar dot). */
export async function getProjectUpdateSummary(userId: string, projectId: string, now: Date = new Date()): Promise<UpdateSummary> {
  return (await getUpdateSummaries(userId, [projectId], now)).get(projectId) ?? { newActivity: 0, unread: 0, mentions: 0 }
}

/** GET /api/projects/:id/updates — the dashboard panel. */
export async function getProjectUpdates(userId: string, projectId: string, now: Date = new Date()): Promise<ProjectUpdatesDto> {
  const visit = await repo.findVisit(defaultDb, userId, projectId)
  const since = baselineOf(visit?.lastSeenAt, now)
  const [rows, newActivity, unreadRows, counts] = await Promise.all([
    repo.findNewActivity(defaultDb, userId, projectId, since, UPDATES_LIST_LIMIT),
    repo.countNewActivity(defaultDb, userId, projectId, since),
    findNotifications(defaultDb, userId, { limit: UPDATES_LIST_LIMIT, unreadOnly: true, projectId }),
    repo.countUnreadByProject(defaultDb, userId, [projectId]),
  ])
  const activity = await withEntityI18n(await withMemberNames(await withEntityLabels(projectId, rows.map(toActivityDto))))
  // findNotifications fetches one extra row for paging; the panel only needs the first page.
  const notifications = await enrichNotifications(unreadRows.slice(0, UPDATES_LIST_LIMIT).map(toNotificationDto))
  return {
    since: since.toISOString(),
    firstVisit: !visit,
    newActivity,
    unread: counts.all.get(projectId) ?? 0,
    mentions: counts.mentions.get(projectId) ?? 0,
    activity,
    notifications,
  }
}

/** Badges for many projects (top page): two grouped queries plus the visits. */
export async function getUpdateSummaries(userId: string, projectIds: readonly string[], now: Date = new Date()): Promise<Map<string, UpdateSummary>> {
  if (projectIds.length === 0) return new Map()
  const visits = await repo.findVisits(defaultDb, userId, projectIds)
  const seen = new Map(visits.map((v) => [v.projectId, v.lastSeenAt]))
  const baselines = new Map(projectIds.map((id) => [id, baselineOf(seen.get(id), now)]))
  const [activity, unread] = await Promise.all([
    repo.countNewActivityByProject(defaultDb, userId, baselines),
    repo.countUnreadByProject(defaultDb, userId, projectIds),
  ])
  return new Map(
    projectIds.map((id) => [id, { newActivity: activity.get(id) ?? 0, unread: unread.all.get(id) ?? 0, mentions: unread.mentions.get(id) ?? 0 }]),
  )
}

/**
 * POST /api/projects/:id/updates/seen ("すべて確認済みにする"): everything up
 * to now is no longer new and the project's unread notifications are read.
 */
export async function markProjectSeen(userId: string, projectId: string, now: Date = new Date()): Promise<{ seenAt: string }> {
  await withTransaction(async (tx) => {
    await repo.upsertVisit(tx, userId, projectId, now)
    await repo.markProjectNotificationsRead(tx, userId, projectId, now)
  })
  return { seenAt: now.toISOString() }
}
