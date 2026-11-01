/**
 * Confidential PBIs on the Claude-facing surfaces (decision D-5): the Kanflow MCP server (/api/mcp)
 * and the REST dev API (/api/v1). A PBI with `confidential = true` is NEVER returned there:
 *
 *   - lists omit it (and its sprint tasks, release copies, claims and activity rows);
 *   - a direct get / write that names it answers exactly what a PBI that does not exist answers,
 *     so its existence is not revealed;
 *   - tasks under it are treated as not existing, so neither its title nor its description
 *     leaks through a task.
 *
 * The signed-in web UI is NOT affected (it never imports this file): members still see everything.
 *
 * This is the ONE place that knows the rule. Token-facing reads use the where-fragments below,
 * token-facing writes call the guards. Every MCP tool and /api/v1 route is listed in
 * `app/api/v1/_lib/confidential-coverage.ts`, and a test fails when a new one is missing there,
 * so a new route cannot forget the rule.
 */
import { defaultDb, type Db } from "@/services/_shared/db"
import { parsePbiRef } from "@/services/_shared/pbi-ref"
import { NOT_DELETED } from "@/services/_shared/soft-delete"

// ------------------------------------------------------------ where-fragments (pure)

/** Where-fragment of a PBI row the token surfaces may show: live and not confidential. */
export const API_VISIBLE_PBI = Object.freeze({ ...NOT_DELETED, confidential: false })

/** Sprint task filter of the token surfaces: the parent PBI is live and not confidential (LIVE_PBI + D-5). */
export const API_VISIBLE_PBI_OF = Object.freeze({ pbItem: API_VISIBLE_PBI })

/**
 * Release item filter: a release item is a COPY of its PBI (initiative / epic / userStory), so a
 * copy of a confidential PBI is hidden too. A copy whose PBI was trashed or purged stays (as before).
 */
export const API_VISIBLE_RELEASE_ITEM = Object.freeze({ OR: [{ pbItemId: null }, { pbItem: { confidential: false } }] })

/** `where` plus the live / not-confidential filter of a PBI query (new object). */
export function apiVisiblePbi<W extends object>(where: W): W & { deletedAt: null; confidential: false } {
  return { ...where, ...API_VISIBLE_PBI }
}

// ------------------------------------------------------------ lookups

/** Ids among `ids` that are confidential PBIs (any project; ids are globally unique). */
export async function confidentialPbiIds(ids: Iterable<string>, db: Db = defaultDb): Promise<Set<string>> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return new Set()
  const rows = await db.productBacklogItem.findMany({ where: { id: { in: wanted }, confidential: true }, select: { id: true } })
  return new Set(rows.map((r) => r.id))
}

/** `ids` without the confidential PBIs (order kept; unknown ids stay: the service skips them as before). */
export async function withoutConfidentialPbiIds(ids: readonly string[], db: Db = defaultDb): Promise<string[]> {
  const hidden = await confidentialPbiIds(ids, db)
  return hidden.size === 0 ? [...ids] : ids.filter((id) => !hidden.has(id))
}

/** `items` without those whose PBI (`pbiIdOf`) is confidential. */
export async function withoutConfidentialItems<T>(items: readonly T[], pbiIdOf: (item: T) => string, db: Db = defaultDb): Promise<T[]> {
  const hidden = await confidentialPbiIds(items.map(pbiIdOf), db)
  return hidden.size === 0 ? [...items] : items.filter((item) => !hidden.has(pbiIdOf(item)))
}

/** The PBI named by `ref` (id, "12", "PBI-12") is a confidential PBI of the project. */
export async function isConfidentialPbiRef(projectId: string, ref: string, db: Db = defaultDb): Promise<boolean> {
  const row = await db.productBacklogItem.findFirst({ where: { projectId, ...parsePbiRef(ref), confidential: true }, select: { id: true } })
  return row !== null
}

/** The sprint task sits under a confidential PBI. */
export async function isConfidentialTask(taskId: string, db: Db = defaultDb): Promise<boolean> {
  const row = await db.sprintBacklogItem.findFirst({ where: { id: taskId, pbItem: { confidential: true } }, select: { id: true } })
  return row !== null
}

/** The work claim is on a confidential PBI. */
export async function isConfidentialClaim(projectId: string, claimId: string, db: Db = defaultDb): Promise<boolean> {
  const row = await db.workClaim.findFirst({ where: { id: claimId, projectId, backlogItem: { confidential: true } }, select: { id: true } })
  return row !== null
}

// ------------------------------------------------------------ masking (writes and filtered reads)

/**
 * An id no row can have. A write that names a confidential PBI (or a task / claim under one) hands
 * this to the service instead of the real id, so the service answers EXACTLY what it answers for a
 * missing one: same status, code, message and same order of checks. A separate "is it confidential?"
 * error would leak that the PBI exists.
 */
export const NO_SUCH_ID = "-"

/** `ref` (id, "12", "PBI-12"), or NO_SUCH_ID when it names a confidential PBI of the project. */
export async function maskPbiRef(projectId: string, ref: string): Promise<string> {
  return (await isConfidentialPbiRef(projectId, ref)) ? NO_SUCH_ID : ref
}

/** `ids` with every confidential PBI replaced by NO_SUCH_ID (same length and order). */
export async function maskPbiIds(ids: readonly string[]): Promise<string[]> {
  const hidden = await confidentialPbiIds(ids)
  return hidden.size === 0 ? [...ids] : ids.map((id) => (hidden.has(id) ? NO_SUCH_ID : id))
}

/** `taskId`, or NO_SUCH_ID when the task sits under a confidential PBI. */
export async function maskTaskId(taskId: string): Promise<string> {
  return (await isConfidentialTask(taskId)) ? NO_SUCH_ID : taskId
}

/** `claimId`, or NO_SUCH_ID when the claim is on a confidential PBI. */
export async function maskClaimId(projectId: string, claimId: string): Promise<string> {
  return (await isConfidentialClaim(projectId, claimId)) ? NO_SUCH_ID : claimId
}

/**
 * The entity id of a comment thread (`pbi` | `sprint_task` | `icebox`), or NO_SUCH_ID when the thread
 * belongs to a confidential PBI or to a task under one. Its comments are never readable or writable here.
 */
export async function maskCommentEntityId(projectId: string, entityType: string, entityId: string): Promise<string> {
  if (entityType === "pbi") return maskPbiRef(projectId, entityId)
  if (entityType === "sprint_task") return maskTaskId(entityId)
  return entityId
}
