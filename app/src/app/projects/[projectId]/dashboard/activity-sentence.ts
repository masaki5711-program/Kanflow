/**
 * Pure: one activity entry → a localized sentence with a link target, e.g.
 * "Alice changed the status of task “Write docs” → Done".
 */
import type { Language, Translations } from "@/lib/i18n"
import type { ActivityEntry } from "@/components/activity/history-format"

export interface FeedEntry extends ActivityEntry {
  entityType: string
  entityId: string
}

export interface FeedSentence {
  /** Text before the entity (actor + verb, language dependent). */
  before: string
  /** The entity reference ("PBI “Login”"), rendered as a link when `href` is set. */
  entity: string
  after: string
  href: string | null
  /** Localized target status of a status change. */
  statusTo: string | null
}

const ACTION_KEY: Record<string, keyof Translations> = {
  create: "dashboardFeedCreate",
  update: "dashboardFeedUpdate",
  delete: "dashboardFeedDelete",
  status_change: "dashboardFeedStatusChange",
  assign: "dashboardFeedAssign",
  move: "dashboardFeedMove",
  restore: "dashboardFeedRestore",
  comment: "dashboardFeedComment",
}

const ENTITY_KEY: Record<string, keyof Translations> = {
  pbi: "dashboardFeedEntityPbi",
  sprint_task: "dashboardFeedEntitySprintTask",
  sprint: "dashboardFeedEntitySprint",
  icebox: "dashboardFeedEntityIcebox",
  goal: "dashboardFeedEntityGoal",
  release: "dashboardFeedEntityRelease",
  plan_item: "dashboardFeedEntityPlanItem",
  member: "dashboardFeedEntityMember",
  project: "dashboardFeedEntityProject",
}

/** Status code → label per entity type (unknown codes stay as they are). */
function statusLabel(entityType: string, value: string, t: Translations): string {
  const maps: Record<string, Record<string, string>> = {
    sprint_task: { todo: t.taskTodo, in_progress: t.taskInProgress, review: t.topTaskReview, done: t.taskDone },
    pbi: { ready: t.backlogStatusReady, not_ready: t.backlogStatusNotReady, completed: t.backlogStatusCompleted },
    sprint: { planning: t.sprintStatusPlanning, active: t.sprintStatusActive, review: t.sprintStatusReview, done: t.sprintStatusDone, archived: t.sprintStatusArchived },
  }
  return maps[entityType]?.[value] ?? value
}

/** Where an entity lives (null: deleted, or it is shown on the dashboard itself). */
export function entityHref(projectId: string, entry: Pick<FeedEntry, "entityType" | "entityId" | "action">): string | null {
  if (entry.action === "delete") return null
  const base = `/projects/${encodeURIComponent(projectId)}`
  const id = encodeURIComponent(entry.entityId)
  switch (entry.entityType) {
    case "pbi": return `${base}/backlog?pbi=${id}`
    case "sprint_task": return `${base}/sprints?task=${id}`
    case "sprint": return `${base}/sprints?sprint=${id}`
    case "icebox": return `${base}/icebox?item=${id}`
    case "release": return `${base}/releases`
    case "plan_item": return `${base}/plan`
    default: return null
  }
}

/** Fields that name an entity when the entry carries no label (first found wins). */
const NAME_FIELDS = ["initiative", "userStory", "taskName", "sprintName", "name", "title", "request"] as const

function nameFromChanges(changes: FeedEntry["changes"]): string | null {
  for (const field of NAME_FIELDS) {
    const change = changes?.[field]
    if (!change || !("to" in change)) continue
    const value = [change.to, change.from].find((v): v is string => typeof v === "string" && v.trim().length > 0)
    if (value) return value.trim().split(/\r?\n/)[0]
  }
  return null
}

function nameFromMeta(meta: FeedEntry["meta"]): string | null {
  const text = [meta?.label, meta?.entityLabel, meta?.name, meta?.title].find((v): v is string => typeof v === "string" && v.trim().length > 0)
  if (text) return text.trim()
  const displayId = meta?.displayId
  return typeof displayId === "number" || (typeof displayId === "string" && displayId) ? `#${displayId}` : null
}

/**
 * Readable name of the entry's entity: the logged label (the API fills it in
 * from the entity for entries logged without one), else a name in the diff or
 * meta ("#12" for a PBI). Member labels are user ids — never shown.
 */
export function entityLabel(entry: Pick<FeedEntry, "entityType" | "label" | "changes" | "meta">): string | null {
  if (entry.entityType === "member") return null
  if (entry.label?.trim()) return entry.label.trim()
  return nameFromChanges(entry.changes) ?? nameFromMeta(entry.meta)
}

function quote(label: string, language: Language): string {
  return language === "ja" ? `「${label}」` : ` “${label}”`
}

export function feedSentence(entry: FeedEntry, projectId: string, t: Translations, language: Language): FeedSentence {
  const actor = entry.actor?.name || t.historySystem
  const template = (t[ACTION_KEY[entry.action] ?? "dashboardFeedUpdate"] as string).replace("{actor}", actor)
  const [before, after = ""] = template.split("{entity}")
  const word = ENTITY_KEY[entry.entityType] ? (t[ENTITY_KEY[entry.entityType]] as string) : entry.entityType
  const label = entityLabel(entry)
  const change = entry.changes?.status
  const to = entry.action === "status_change" && change && "to" in change && change.to !== null ? String(change.to) : null
  return {
    before,
    entity: label ? `${word}${quote(label, language)}` : word,
    after,
    href: entityHref(projectId, entry),
    statusTo: to === null ? null : t.dashboardFeedStatusTo.replace("{status}", statusLabel(entry.entityType, to, t)),
  }
}
