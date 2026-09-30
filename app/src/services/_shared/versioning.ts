/**
 * Optimistic locking (P2). ProductBacklogItem, SprintBacklogItem, Sprint and
 * IceboxItem carry `version Int @default(0)`; every user write bumps it.
 *
 * A client that sends the `version` it loaded gets an atomic compare-and-set:
 *
 *   updateMany({ where: { id, ...versionWhere(version) }, data: { ...patch, ...BUMP_VERSION } })
 *   count 0 → staleOrMissing(await loadCurrent(), notFound)   // 409 with `current`, or 404
 *
 * A client that omits `version` (older UI, scripts) still gets a plain update
 * that bumps the version — backward compatible, logged at debug level.
 */
import { z } from "zod"
import { logger } from "@/lib/logger"
import { ValidationError, VersionConflictError, type ServiceError } from "./errors"

const log = logger.child({ module: "versioning" })

/** Optional lock token accepted by update schemas (`version: versionField`). */
export const versionField = z.number().int().min(0).optional()

/** `data` increment that marks a user write. */
export const BUMP_VERSION = { version: { increment: 1 } } as const

/** Split `version` off a parsed input so it is never written as a column value. */
export function takeVersion<T extends { version?: number }>(input: T): { version: number | undefined; data: Omit<T, "version"> } {
  const { version, ...data } = input
  return { version, data }
}

/** `where` fragment: only the expected version matches when one is given. */
export function versionWhere(version: number | undefined): { version?: number } {
  return version === undefined ? {} : { version }
}

/**
 * The error for a versioned write that matched no row: the row still exists →
 * someone else changed it (409 with `current`); otherwise → `notFound()`.
 */
export function staleOrMissing(current: unknown, notFound: () => ServiceError): ServiceError {
  return current ? new VersionConflictError(current) : notFound()
}

/** Debug trace of a write that skipped the lock check (no `version` sent). */
export function noteUnversionedWrite(entity: string, id: string, version: number | undefined): void {
  if (version === undefined) log.debug("write without version", { entity, id })
}

/** `?version=N` of a DELETE request; absent/empty = unversioned; anything else non-integer = 400. */
export function parseVersionParam(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get("version")
  if (raw === null || raw === "") return undefined
  if (!/^\d+$/.test(raw)) throw new ValidationError("Invalid version", {}, "VALIDATION")
  return Number(raw)
}
