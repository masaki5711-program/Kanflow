/**
 * Notifications — the one seam services and worker jobs use to notify users.
 *
 * `notify(db, input)` fans a notification out to recipients through the
 * configured channels (in-app only for now; an email channel is added later
 * behind the same `NotificationChannel` interface — see docs/roadmap.md).
 *
 * Rules applied here (not by callers):
 * - the acting user never notifies themself (`actorId`)
 * - recipients must be active users
 * - a user with a disabled NotificationPreference for the type is skipped
 * - `dedupeKey` makes repeats a no-op: rows are inserted with skipDuplicates
 *   against the unique (recipientId, dedupeKey) index
 *
 * Like activity logging, notifying is best effort: it runs inside the
 * caller's transaction but NEVER throws into it.
 */
import { resolveAssignees } from "@/lib/assignees"
import { logger } from "@/lib/logger"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import type { Db } from "./db"

const log = logger.child({ module: "notifications" })

export const NOTIFICATION_TYPES = [
  "assigned",
  "mentioned",
  "comment",
  "due_soon",
  "overdue",
  "sprint_start",
  "sprint_end",
  "surveillance_critical",
  /** A background AI report the user requested is ready (payload: reportId, title, kind). */
  "ai_report_ready",
  /** A background AI report the user requested failed (payload: kind, error). */
  "ai_report_failed",
  /** A 定着確認 of the 改善成果ボード is due (to the project's POs; payload: entityLabel, dueDate, kind). */
  "improvement_check_due",
  /** A merge request of a PBI the user works on has a failed pipeline (payload: entityLabel, mr). */
  "git_pipeline_failed",
  /**
   * Someone else ended the user's work claim (作業の宣言, dev:write): a new claim superseded
   * the stale claim (reason "stale") or a PO / SM / admin released it (reason "moderator").
   * Payload: entityLabel, actorName, reason.
   */
  "work_claim_ended",
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** Upper bound of recipients of one notify() call (a project's members). */
const MAX_RECIPIENTS = 1000

export interface NotifyInput {
  recipientIds: readonly string[]
  type: NotificationType
  /** The user causing the notification; never notified. null / omitted = system. */
  actorId?: string | null
  projectId?: string | null
  entityType?: string | null
  entityId?: string | null
  /** Rendered client-side; stored as JSON text. */
  payload?: Readonly<Record<string, unknown>>
  dedupeKey?: string | null
}

/** One notification row as handed to channels. */
export interface NotificationRow {
  recipientId: string
  type: NotificationType
  projectId: string | null
  entityType: string | null
  entityId: string | null
  payload: string | null
  dedupeKey: string | null
}

export interface NotificationChannel {
  readonly name: string
  /** Deliver the rows; returns how many were delivered (duplicates excluded). */
  deliver(db: Db, rows: readonly NotificationRow[]): Promise<number>
}

/** In-app (bell) channel: rows in the Notification table. */
export const inAppChannel: NotificationChannel = {
  name: "in_app",
  async deliver(db, rows) {
    if (rows.length === 0) return 0
    const { count } = await db.notification.createMany({ data: [...rows], skipDuplicates: true })
    return count
  },
}

const DEFAULT_CHANNELS: readonly NotificationChannel[] = [inAppChannel]

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Distinct candidate ids minus the actor (pure). */
export function candidateRecipients(recipientIds: readonly string[], actorId?: string | null): string[] {
  return [...new Set(recipientIds.filter((id) => id && id !== actorId))].slice(0, MAX_RECIPIENTS)
}

/** Active users among `ids` that have not disabled `type`. */
async function eligibleRecipients(db: Db, ids: readonly string[], type: NotificationType): Promise<string[]> {
  const users = await db.user.findMany({
    where: { id: { in: [...ids] }, isActive: true },
    select: { id: true, notificationPrefs: { where: { type }, select: { enabled: true } } },
  })
  const allowed = new Set(users.filter((u) => !u.notificationPrefs.some((p) => !p.enabled)).map((u) => u.id))
  return ids.filter((id) => allowed.has(id))
}

/**
 * Notify recipients through every channel. Returns the number of in-app rows
 * created (0 on failure / nobody eligible / all duplicates). Never throws.
 */
export async function notify(
  db: Db,
  input: NotifyInput,
  channels: readonly NotificationChannel[] = DEFAULT_CHANNELS
): Promise<number> {
  const candidates = candidateRecipients(input.recipientIds, input.actorId)
  if (candidates.length === 0) return 0
  let recipients: string[]
  try {
    recipients = await eligibleRecipients(db, candidates, input.type)
  } catch (err) {
    log.warn("notification recipient lookup failed", { type: input.type, error: errorMessage(err) })
    return 0
  }
  const payload = input.payload ? JSON.stringify(input.payload) : null
  const rows: NotificationRow[] = recipients.map((recipientId) => ({
    recipientId,
    type: input.type,
    projectId: input.projectId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    payload,
    dedupeKey: input.dedupeKey ?? null,
  }))
  let delivered = 0
  for (const channel of channels) {
    try {
      const n = await channel.deliver(db, rows)
      if (channel === inAppChannel) delivered = n
    } catch (err) {
      log.warn("notification delivery failed", { channel: channel.name, type: input.type, error: errorMessage(err) })
    }
  }
  // The recipients' bells and badges refresh live (after the commit; ids only).
  if (delivered > 0) {
    publishAfterCommit({
      type: "notification",
      userIds: recipients,
      projectId: input.projectId ?? undefined,
      entityType: input.entityType ?? undefined,
      entityId: input.entityId ?? undefined,
      action: input.type,
      actorId: input.actorId ?? undefined,
    })
  }
  return delivered
}

/**
 * User ids of a project's members, optionally only the given project roles
 * (e.g. ["po", "sm"]). Never throws ([] on failure).
 */
export async function projectMemberIds(db: Db, projectId: string, roles?: readonly string[]): Promise<string[]> {
  try {
    const rows = await db.projectMember.findMany({
      where: { projectId, ...(roles ? { role: { in: [...roles] } } : {}) },
      select: { userId: true },
      take: MAX_RECIPIENTS,
    })
    return rows.map((r) => r.userId)
  } catch (err) {
    log.warn("project member lookup failed", { projectId, error: errorMessage(err) })
    return []
  }
}

/**
 * Resolve a legacy assignee string (display names) to user ids of the
 * project's members (`resolveAssignees`; ambiguous / unknown names are
 * dropped). Never throws ([] on failure).
 */
export async function resolveAssigneeUserIds(db: Db, projectId: string, raw: string | null | undefined): Promise<string[]> {
  if (!raw?.trim()) return []
  try {
    const members = await db.projectMember.findMany({
      where: { projectId },
      select: { userId: true, user: { select: { name: true } } },
      take: MAX_RECIPIENTS,
    })
    const scope = members.map((m) => ({ id: m.userId, name: m.user.name }))
    return resolveAssignees(raw, scope).userIds
  } catch (err) {
    log.warn("assignee resolution failed", { projectId, error: errorMessage(err) })
    return []
  }
}

/**
 * Users newly assigned by a change of a legacy assignee string (in `after`
 * but not in `before`), resolved against the project's members.
 */
export async function newlyAssignedUserIds(
  db: Db,
  projectId: string,
  before: string | null | undefined,
  after: string | null | undefined
): Promise<string[]> {
  if (!after?.trim() || (before ?? null) === after) return []
  const [prev, next] = await Promise.all([
    resolveAssigneeUserIds(db, projectId, before),
    resolveAssigneeUserIds(db, projectId, after),
  ])
  return next.filter((id) => !prev.includes(id))
}
