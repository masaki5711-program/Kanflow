/** Pure helpers of the entity history view (ActivityDto parsing + sentences). */
import type { Translations } from "@/lib/i18n"

type Value = string | number | boolean | null
export type FieldChange = { from: Value; to: Value } | { changed: true }

export interface ActivityEntry {
  id: string
  action: string
  actor: { id: string | null; name: string | null } | null
  changes: Record<string, FieldChange> | null
  label: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface ActivityPage {
  items: ActivityEntry[]
  nextCursor: string | null
}

function isEntry(value: unknown): value is ActivityEntry {
  const v = value as ActivityEntry | null
  return !!v && typeof v.id === "string" && typeof v.action === "string" && typeof v.createdAt === "string"
}

/** Tolerant parser of `{ items, nextCursor }` (malformed entries dropped). */
export function parseActivityPage(raw: unknown): ActivityPage {
  const page = raw as { items?: unknown; nextCursor?: unknown } | null
  const items = Array.isArray(page?.items) ? page.items.filter(isEntry) : []
  return { items, nextCursor: typeof page?.nextCursor === "string" ? page.nextCursor : null }
}

const ACTION_KEY: Record<string, keyof Translations> = {
  create: "historyActionCreate",
  update: "historyActionUpdate",
  delete: "historyActionDelete",
  status_change: "historyActionStatusChange",
  assign: "historyActionAssign",
  move: "historyActionMove",
  restore: "historyActionRestore",
  comment: "historyActionComment",
}

/** "Alice changed the status" (unknown actions read as an update; no actor = the system). */
export function actionSentence(entry: Pick<ActivityEntry, "action" | "actor">, t: Translations): string {
  const actor = entry.actor?.name || t.historySystem
  const template = t[ACTION_KEY[entry.action] ?? "historyActionUpdate"] as string
  return template.replace("{actor}", actor)
}

/** How a change reached Kanflow when not through the UI (recorded by `withVia` in services/_shared/activity.ts). */
export type ActivityVia = "api" | "mcp"

/** `meta.via` of an entry when it is a known channel, else null (= a UI or system change). */
export function activityVia(entry: Pick<ActivityEntry, "meta">): ActivityVia | null {
  const via = entry.meta?.via
  return via === "api" || via === "mcp" ? via : null
}
