import type { Language, Translations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { formatShortDate as formatDay } from "@/lib/format-date"
import { COMMENTS_TAB, TAB_PARAM } from "@/components/comments/comments-deep-link"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"

/** GET /api/notifications item (see services/notifications NotificationDto). */
export interface NotificationItem {
  id: string
  type: string
  projectId: string | null
  /** `i18n`: the translated project name (shown in the viewer's language when available). */
  project: { id: string; name: string; i18n?: EntityI18n } | null
  entityType: string | null
  entityId: string | null
  payload: Record<string, unknown>
  /** Translations of the notified entity (A3-08); absent on older servers / untranslated kinds. */
  entityI18n?: EntityI18n
  readAt: string | null
  createdAt: string
}

export interface NotificationPage {
  items: NotificationItem[]
  nextCursor: string | null
  unreadCount: number
  unreadByGroup?: { all: number; personal: number; other: number }
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

/** "2026-10-03" (local calendar day) or an ISO instant → the app-wide short date (lib/format-date). */
export function formatShortDate(value: string | null, language: string): string {
  if (!value) return ""
  return formatDay(value, language as Language) || value
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

/** Localized name of a background AI job kind (lib/ai-jobs/config.ts). */
export function aiJobKindLabel(kind: string | null, t: Translations): string {
  if (kind === "progress_report") return t.aiJobKindProgressReport
  if (kind === "sprint_review") return t.aiJobKindSprintReview
  return kind ?? t.notifUntitled
}

/** Entities whose deep link can open straight on their comment thread (`&tab=comments`). */
const COMMENTABLE = new Set(["pbi", "sprint_task", "icebox"])

/** Where clicking the notification goes (null without a project). Comment / mention links open the comments. */
export function notificationHref(n: NotificationItem): string | null {
  if (!n.projectId) return null
  if (n.type === "mentioned" || n.type === "comment") {
    const entityType = str(n.payload, "entityType") ?? n.entityType
    const entityId = str(n.payload, "entityId") ?? n.entityId
    const href = entityHref(n.projectId, entityType, entityId)
    return entityId && entityType && COMMENTABLE.has(entityType) ? `${href}&${TAB_PARAM}=${COMMENTS_TAB}` : href
  }
  if (n.type === "surveillance_critical") return `/projects/${encodeURIComponent(n.projectId)}`
  if (n.type === "ai_report_ready" || n.type === "ai_report_failed") {
    // The dashboard's AI reports panel opens `?report=` (ai-reports-panel.tsx).
    const reportId = str(n.payload, "reportId") ?? (n.entityType === "ai_report" ? n.entityId : null)
    const base = `/projects/${encodeURIComponent(n.projectId)}`
    return reportId ? `${base}?report=${encodeURIComponent(reportId)}` : base
  }
  return entityHref(n.projectId, n.entityType, n.entityId)
}

/** Fields that name each notified entity (the stored label is one of them, first line). */
const TITLE_FIELDS: Record<string, readonly string[]> = {
  pbi: ["initiative", "userStory"],
  sprint_task: ["taskName"],
  sprint: ["sprintName"],
  icebox: ["request"],
  plan_item: ["name"],
}

/**
 * The stored title in the viewer's language (A3-08): the payload keeps the
 * text as written; when one of the entity's translated fields has that text
 * as its source, its translation is shown instead.
 */
export function localizedTitle(n: NotificationItem, title: string, language: string): string {
  const fields = TITLE_FIELDS[str(n.payload, "entityType") ?? n.entityType ?? ""] ?? []
  for (const field of fields) {
    const entry = n.entityI18n?.[field]
    const source = entry ? firstLine(entry.source === "ja" ? entry.ja : entry.id) : null
    if (!entry || source !== title) continue
    return firstLine(pickText(n.entityI18n, field, source, language).text) ?? title
  }
  return title
}

/**
 * The item's name in the sentence. PBIs are always "#displayId title" (older
 * assignment notifications stored the bare user story; the number is added).
 */
function entityLabelOf(n: NotificationItem, language: string): string | null {
  const raw = firstLine(str(n.payload, "entityLabel"))
  const numbered = raw ? /^#(\d+)\s+([\s\S]*)$/.exec(raw) : null
  const label = numbered ? `#${numbered[1]} ${localizedTitle(n, numbered[2], language)}` : raw && localizedTitle(n, raw, language)
  const isPbi = (str(n.payload, "entityType") ?? n.entityType) === "pbi"
  const displayId = str(n.payload, "displayId")
  if (!isPbi || !displayId || label?.startsWith("#")) return label
  return label ? `#${displayId} ${label}` : `#${displayId}`
}

/** Project name in the viewer's language (translation when available, else the original). */
function projectNameOf(n: NotificationItem, language: string): string | null {
  if (!n.project) return str(n.payload, "projectName")
  return pickText(n.project.i18n, "name", n.project.name, language).text || n.project.name
}

/** Localized sentence + project + link for one notification (pure). */
export function describeNotification(n: NotificationItem, t: Translations, language: string): DescribedNotification {
  const p = n.payload
  const actor = str(p, "actorName") ?? t.notifSomeone
  const label = entityLabelOf(n, language) ?? t.notifUntitled
  const sprintRaw = str(p, "sprintName")
  const sprint = sprintRaw ? localizedTitle(n, sprintRaw, language) : t.notifUntitled
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
    case "ai_report_ready":
      text = fillTemplate(t.notifAiReportReady, { title: str(p, "title") ?? t.notifUntitled })
      break
    case "ai_report_failed":
      text = fillTemplate(t.notifAiReportFailed, { kind: aiJobKindLabel(str(p, "kind"), t) })
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
  return { text, projectName: projectNameOf(n, language), href: notificationHref(n) }
}

/** Badge text: 1..99, then "99+". */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count)
}
