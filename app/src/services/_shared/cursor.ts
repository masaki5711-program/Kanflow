/**
 * Keyset (cursor) pagination over (createdAt DESC, id DESC) — newest first,
 * stable under concurrent inserts (no OFFSET drift).
 *
 * The cursor is opaque to clients: base64url of "<ISO createdAt>|<id>" of the
 * last row of the previous page.
 */
import { ValidationError } from "./errors"

export interface CursorKey {
  createdAt: Date
  id: string
}

export const PAGE_LIMIT_DEFAULT = 50
export const PAGE_LIMIT_MAX = 100

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(`${key.createdAt.toISOString()}|${key.id}`, "utf8").toString("base64url")
}

/** Decode a client cursor; 400 VALIDATION when malformed. */
export function decodeCursor(cursor: string): CursorKey {
  const raw = Buffer.from(cursor, "base64url").toString("utf8")
  const sep = raw.indexOf("|")
  const createdAt = new Date(sep > 0 ? raw.slice(0, sep) : "")
  const id = sep > 0 ? raw.slice(sep + 1) : ""
  if (isNaN(createdAt.getTime()) || !id || id.length > 191) throw new ValidationError("Invalid cursor", {}, "VALIDATION")
  return { createdAt, id }
}

/** Prisma `where` fragment: rows strictly after the cursor in (createdAt DESC, id DESC) order. */
export function afterCursorWhere(cursor: string | undefined) {
  if (!cursor) return {}
  const { createdAt, id } = decodeCursor(cursor)
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] }
}

export const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }]

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/**
 * Rows were fetched with `take: limit + 1`: the extra row only proves there
 * is a next page and is dropped.
 */
export function toPage<R extends CursorKey, T>(rows: readonly R[], limit: number, map: (row: R) => T): Page<T> {
  const pageRows = rows.slice(0, limit)
  const last = pageRows[pageRows.length - 1]
  return {
    items: pageRows.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  }
}

/** Query-string → plain object (empty values dropped so defaults apply). */
export function searchParamsObject(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URL(url).searchParams) if (v !== "") out[k] = v
  return out
}
