import type { Translations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { localeOf } from "@/components/comments/relative-time"

/** GET /api/notifications item (see services/notifications NotificationDto). */
export interface NotificationItem {
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

export interface NotificationPage {
  items: NotificationItem[]
  nextCursor: string | null
  unreadCount: number
}

export interface DescribedNotification {
  /** Localized one-sentence summary. */
  text: string
  /** Project the notification belongs to (for the meta line), if any. */
  projectName: string | null
  /** Deep link, or null when there is nowhere to go. */
  href: string | null
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key]
  return typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null
}

function firstLine(text: string | null): string | null {
  const line = text?.split(/\r?\n/, 1)[0]?.trim()
  return line ? line : null
}

/** "2026-10-03" (local calendar day) or an ISO instant → short localized date. */
export function formatShortDate(value: string | null, language: string): string {
  if (!value) return ""
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toLocaleDateString(localeOf(language), { month: "short", day: "numeric" })
}

/** Deep link of a PBI / sprint task / Icebox item inside a project. */
function entityHref(projectId: string, entityType: string | null, entityId: string | null): string {
  const base = `/projects/${encodeURIComponent(projectId)}`
  if (!entityId) return base
  const id = encodeURIComponent(entityId)
  switch (entityType) {
    case "pbi":
      return `${base}/backlog?pbi=${id}`
    case "sprint_task":
      return `${base}/sprints?task=${id}`
    case "icebox":
      return `${base}/icebox?item=${id}`
    case "sprint":
      return `${base}/sprints?sprint=${id}`
    case "plan_item":
      return `${base}/plan`
    default:
      return base
  }
}

/** Where clicking the notification goes (null without a project). */
export function notificationHref(n: NotificationItem): string | null {
  if (!n.projectId) return null
  if (n.type === "mentioned" || n.type === "comment") {
    return entityHref(n.projectId, str(n.payload, "entityType") ?? n.entityType, str(n.payload, "entityId") ?? n.entityId)
  }
  if (n.type === "surveillance_critical") return `/projects/${encodeURIComponent(n.projectId)}`
  return entityHref(n.projectId, n.entityType, n.entityId)
}

/** Localized sentence + project + link for one notification (pure). */
export function describeNotification(n: NotificationItem, t: Translations, language: string): DescribedNotification {
  const p = n.payload
  const actor = str(p, "actorName") ?? t.notifSomeone
  const label = firstLine(str(p, "entityLabel")) ?? t.notifUntitled
  const sprint = str(p, "sprintName") ?? t.notifUntitled
  const date = formatShortDate(str(p, "dueDate"), language)
  let text: string
  switch (n.type) {
    case "assigned":
      text = fillTemplate(t.notifAssigned, { actor, label })
      break
    case "sprint_start":
      text = fillTemplate(t.notifSprintStart, {
        sprint,
        start: formatShortDate(str(p, "startDate"), language),
        end: formatShortDate(str(p, "endDate"), language),
      })
      break
    case "sprint_end":
      text = fillTemplate(t.notifSprintEnd, { sprint })
      break
    case "due_soon":
      text = fillTemplate(t.notifDueSoon, { label, date })
      break
    case "overdue":
      text = fillTemplate(t.notifOverdue, { label, date })
      break
    case "surveillance_critical":
      text = fillTemplate(t.notifSurveillance, { title: str(p, "title") ?? t.notifUntitled, count: str(p, "criticalCount") ?? "?" })
      break
    case "mentioned":
      text = fillTemplate(t.notifMentioned, { actor, label })
      break
    case "comment":
      text = fillTemplate(t.notifComment, { actor, label })
      break
    default:
      text = t.notifUnknown
  }
  return { text, projectName: n.project?.name ?? str(p, "projectName"), href: notificationHref(n) }
}

/** Badge text: 1..99, then "99+". */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count)
}
