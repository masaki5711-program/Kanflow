/**
 * Pure building blocks of the global search (no I/O): query normalization,
 * LIKE escaping, displayId parsing, the "projects this user may see" filter
 * and deep-link targets. Kept separate so they can be table-tested.
 */
import type { TranslatableEntity } from "@/lib/translation/types"

export const SEARCH_TYPES = ["pbi", "task", "icebox", "project", "goal"] as const
export type SearchType = (typeof SEARCH_TYPES)[number]

export const SEARCH_QUERY_MIN = 2
export const SEARCH_QUERY_MAX = 100

/** The searched entities' translation rows (FieldTranslation.entityType). */
export const TRANSLATION_ENTITY: Record<SearchType, TranslatableEntity> = {
  pbi: "backlog_item",
  task: "sprint_task",
  icebox: "icebox_item",
  project: "project",
  goal: "product_goal",
}

/**
 * Searched text columns per type. The same field names are matched in the
 * other language via FieldTranslation (text_ja / text_id).
 */
export const SEARCH_FIELDS: Record<SearchType, readonly string[]> = {
  pbi: ["initiative", "epic", "userStory", "acceptanceCriteria"],
  task: ["taskName"],
  icebox: ["request", "background", "pbEpic"],
  project: ["name"],
  goal: ["title", "description"],
}

export interface SearchViewer {
  userId: string
  /** User.role ("admin" | "section_manager" | "member"). */
  systemRole: string
}

/** Trim and collapse whitespace (full-width spaces included). */
export function normalizeQuery(raw: string): string {
  return raw.replace(/[\s　]+/g, " ").trim()
}

/**
 * Escape `\`, `%` and `_` so user input is matched literally by MySQL LIKE
 * (Prisma's `contains` wraps the value in `%…%` but does not escape it;
 * backslash is MySQL's default LIKE escape character).
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const DISPLAY_ID = /^(?:pbi[\s-]*|#\s*)(\d{1,9})$/i

/** "PBI-12" / "pbi 12" / "#12" (full-width too) → 12; anything else → null. */
export function parseDisplayId(query: string): number | null {
  const m = DISPLAY_ID.exec(normalizeQuery(query.normalize("NFKC")))
  if (!m) return null
  const n = Number(m[1])
  return n > 0 ? n : null
}

/**
 * Prisma `ProjectWhereInput` for the live projects the viewer can open —
 * mirrors lib/authz (hasProjectAccess) and the project list on the home page:
 * admins see everything, section managers their member projects plus the
 * projects of their sections, everyone else their member projects.
 */
export function accessibleProjectWhere(viewer: SearchViewer) {
  const member = { members: { some: { userId: viewer.userId } } }
  if (viewer.systemRole === "admin") return { deletedAt: null }
  if (viewer.systemRole === "section_manager") {
    return {
      deletedAt: null,
      OR: [member, { sections: { some: { section: { users: { some: { userId: viewer.userId } } } } } }],
    }
  }
  return { deletedAt: null, ...member }
}

/** `[{ col: { contains: pattern } }, …]` for an OR list. `pattern` must already be escaped. */
export function containsAny(fields: readonly string[], pattern: string): Array<Record<string, { contains: string }>> {
  return fields.map((f) => ({ [f]: { contains: pattern } }))
}

export type SearchEntity = (typeof TRANSLATION_ENTITY)[SearchType]
export type TranslationMatchIds = Record<SearchEntity, string[]>

/** FieldTranslation hits → distinct entity ids per searched entity type. */
export function groupTranslationMatches(rows: ReadonlyArray<{ entityType: string; entityId: string }>): TranslationMatchIds {
  const out = Object.fromEntries(Object.values(TRANSLATION_ENTITY).map((e) => [e, [] as string[]])) as TranslationMatchIds
  for (const row of rows) {
    const bucket = out[row.entityType as keyof typeof out]
    if (bucket && !bucket.includes(row.entityId)) bucket.push(row.entityId)
  }
  return out
}

/** Where a hit navigates to. */
export function searchHref(type: SearchType, projectId: string, id: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}`
  const ref = encodeURIComponent(id)
  switch (type) {
    case "pbi":
      return `${base}/backlog?pbi=${ref}`
    case "task":
      return `${base}/sprints?task=${ref}`
    case "icebox":
      return `${base}/icebox?item=${ref}`
    case "project":
    case "goal":
      return base
  }
}
