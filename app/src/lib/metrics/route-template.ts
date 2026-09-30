/**
 * Collapse a concrete API path into its route template so metrics are kept
 * per route, not per URL (`/api/projects/cmg…/backlog` → `/api/projects/:id/backlog`).
 * Pure; no knowledge of the app's route table, only of what ids look like.
 */

const CUID = /^c[a-z0-9]{20,32}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC = /^\d+$/
/** Long opaque tokens (file ids, signed ids): 16+ url-safe chars with at least one digit. */
const OPAQUE = /^(?=.*\d)[A-Za-z0-9_-]{16,}$/
const MAX_SEGMENTS = 10

function isIdSegment(segment: string): boolean {
  return CUID.test(segment) || UUID.test(segment) || NUMERIC.test(segment) || OPAQUE.test(segment)
}

/** Template of an /api path (query string ignored), or null for non-API paths. */
export function routeTemplate(rawPath: string): string | null {
  const path = rawPath.split("?")[0] ?? ""
  if (!path.startsWith("/api/")) return null
  const segments = path.split("/").filter(Boolean).slice(0, MAX_SEGMENTS)
  return `/${segments.map((s) => (isIdSegment(s) ? ":id" : s)).join("/")}`
}
