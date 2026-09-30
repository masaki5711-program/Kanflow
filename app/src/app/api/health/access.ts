import { constantTimeEqual, INTERNAL_TOKEN_HEADER, isLoopbackHost } from "@/lib/ai-gate/internal-auth"

/**
 * Who may see the detailed /api/health body (component status, queue
 * counts, uptime, buildId): the ops scripts on the server itself (watchdog,
 * status.ps1, deploy — they call http://127.0.0.1:<port>/api/health) or a
 * caller presenting INTERNAL_API_TOKEN in `x-internal-token`. Everyone else
 * gets only `{ status, db }`.
 *
 * "Local" = Host is a loopback name AND every X-Forwarded-For hop is a
 * loopback address (Next fills X-Forwarded-For from the socket when a direct
 * client did not send one; a reverse proxy appends the real client). Both
 * headers are client-controlled, so this only keeps internals out of casual
 * view — nothing secret is in the detailed body either.
 */

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1"])

function forwardedIsLoopback(xff: string | null): boolean {
  if (!xff) return true
  return xff
    .split(",")
    .map((s) => s.trim().replace(/^::ffff:/i, ""))
    .every((ip) => LOOPBACK_IPS.has(ip))
}

export function isLocalRequest(headers: Headers): boolean {
  return isLoopbackHost(headers.get("host")) && forwardedIsLoopback(headers.get("x-forwarded-for"))
}

export function mayReadHealthDetails(headers: Headers, internalToken: string | undefined): boolean {
  const token = internalToken?.trim()
  if (token && constantTimeEqual(headers.get(INTERNAL_TOKEN_HEADER), token)) return true
  return isLocalRequest(headers)
}
