import crypto from "node:crypto"

/**
 * Guard for /api/internal/** endpoints (process-to-process, never browsers).
 *
 * - INTERNAL_API_TOKEN must be configured (else 503) and sent verbatim in
 *   `x-internal-token` (constant-time compare, else 403).
 * - The request must be addressed to a loopback host and must not carry a
 *   non-loopback X-Forwarded-For (i.e. not relayed by a proxy for a remote
 *   client), else 404 so the endpoint is not advertised. The Host header is
 *   client-controlled, so this is defence in depth on top of the token.
 */

export const INTERNAL_TOKEN_HEADER = "x-internal-token"

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

export function constantTimeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || b.length === 0) return false
  const ha = crypto.createHash("sha256").update(a, "utf8").digest()
  const hb = crypto.createHash("sha256").update(b, "utf8").digest()
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length
}

/** Host header value → hostname without port ("[::1]:3000" → "[::1]"). */
export function hostnameOf(hostHeader: string | null): string | null {
  if (!hostHeader) return null
  const h = hostHeader.trim().toLowerCase()
  if (h.startsWith("[")) {
    const end = h.indexOf("]")
    return end > 0 ? h.slice(0, end + 1) : null
  }
  const colon = h.indexOf(":")
  return colon >= 0 ? h.slice(0, colon) : h
}

export function isLoopbackHost(hostHeader: string | null): boolean {
  const name = hostnameOf(hostHeader)
  return name !== null && LOOPBACK_HOSTS.has(name)
}

function forwardedIsLoopback(xff: string | null): boolean {
  if (!xff) return true
  return xff
    .split(",")
    .map((s) => s.trim().replace(/^::ffff:/, ""))
    .every((ip) => ip === "127.0.0.1" || ip === "::1")
}

export type InternalAuthResult = { ok: true } | { ok: false; status: 403 | 404 | 503; error: string }

export function checkInternalRequest(headers: Headers, token: string | undefined): InternalAuthResult {
  if (!isLoopbackHost(headers.get("host")) || !forwardedIsLoopback(headers.get("x-forwarded-for"))) {
    return { ok: false, status: 404, error: "not found" }
  }
  const expected = token?.trim()
  if (!expected) return { ok: false, status: 503, error: "INTERNAL_API_TOKEN not configured" }
  if (!constantTimeEqual(headers.get(INTERNAL_TOKEN_HEADER), expected)) {
    return { ok: false, status: 403, error: "forbidden" }
  }
  return { ok: true }
}
