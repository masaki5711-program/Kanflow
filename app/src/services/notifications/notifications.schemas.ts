import { z } from "zod"
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "@/services/_shared/cursor"
import { NOTIFICATION_TYPES } from "@/services/_shared/notifications"
import { NOTIFICATION_GROUPS, type NotificationGroup } from "@/lib/notification-groups"

/** GET /api/notifications?cursor&limit&unreadOnly=true&group=personal&state=unread */
export const listNotificationsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  unreadOnly: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Panel tab (A3-08): all / personal (mentions, assignments, comments) / other. */
  group: z.enum(NOTIFICATION_GROUPS).default("all"),
  /** Read state filter; the panel loads `unread` first, then `read`, so unread items lead each tab. */
  state: z.enum(["unread", "read"]).optional(),
})

export const notificationIdSchema = z.string().min(1).max(191)

/** PUT /api/notifications/preferences — only the listed types change. */
export const updatePreferencesSchema = z.object({
  preferences: z
    .array(z.object({ type: z.enum(NOTIFICATION_TYPES), enabled: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_TYPES.length),
})

/** `group` defaults to "all" (schema default; optional for in-process callers). */
export type ListNotificationsQuery = Omit<z.infer<typeof listNotificationsQuerySchema>, "group"> & { group?: NotificationGroup }
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>
