/**
 * Notification panel tabs (A3-08). Client-safe, shared with the service so
 * the server filter and the tab labels never drift.
 *
 * - `personal`: things addressed to me — @mentions, assignments, comments on
 *   items I own or follow.
 * - `other`: project-wide notices (sprint start/end, due dates, AI reports).
 */
export const NOTIFICATION_GROUPS = ["all", "personal", "other"] as const
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]

export const PERSONAL_NOTIFICATION_TYPES: readonly string[] = ["mentioned", "assigned", "comment"]

export function notificationGroupOf(type: string): Exclude<NotificationGroup, "all"> {
  return PERSONAL_NOTIFICATION_TYPES.includes(type) ? "personal" : "other"
}

/** Prisma `where` fragment for a tab (`all` → no filter). */
export function notificationGroupWhere(group: NotificationGroup): { type?: { in: string[] } | { notIn: string[] } } {
  if (group === "personal") return { type: { in: [...PERSONAL_NOTIFICATION_TYPES] } }
  if (group === "other") return { type: { notIn: [...PERSONAL_NOTIFICATION_TYPES] } }
  return {}
}

