/**
 * Bearer-token authentication for the read-only REST API (/api/v1).
 *
 * Only `Authorization: Bearer kfl_...` is accepted — session cookies are
 * ignored, so CSRF does not apply. Every failure of the credential itself
 * (missing, malformed, unknown, revoked, expired, user deactivated or
 * tokenVersion bumped) answers the same 401 so a caller cannot probe which
 * one it was; the reason goes to the log with the display prefix only.
 *
 * Order: API enabled → global + per-IP failure budgets → syntax → hash lookup (UNIQUE
 * index) → revoked / expired → scope → user state (isActive + tokenVersion
 * via session-validity, cached 30 s) → per-token rate limit → lastUsedAt
 * (written at most once per minute per token).
 */
import { loadApiTokenConfig } from "@/lib/api-tokens/config"
import { bearerToken, hashApiToken, isWellFormedToken, parseScopes, tokenState, type ApiTokenScope } from "@/lib/api-tokens/token"
import { checkTokenAgainstUser, loadUserAuthState } from "@/lib/authz/session-validity"
import { logger } from "@/lib/logger"
import { clientIpFromHeaders, getRateLimiter, type RateLimitStatus } from "@/lib/rate-limit"
import { defaultDb } from "@/services/_shared/db"
import type { ApiErrorCode } from "@/services/_shared/error-codes"
import * as repo from "./api-tokens.repository"

const log = logger.child({ module: "api-v1-auth" })

const MINUTE_MS = 60_000
/** Failed credential attempts per client IP per minute before 429. */
export const AUTH_FAILURES_PER_IP_PER_MIN = 30
// No global (all-clients) failure budget: a shared counter lets anyone lock
// every token holder out. Tokens are 256-bit random, so guessing is not a
// threat the per-IP limit has to stop; it only damps noisy clients.
/** lastUsedAt is written at most this often per token. */
export const LAST_USED_WRITE_INTERVAL_MS = MINUTE_MS

export interface ApiPrincipal {
  userId: string
  /** User.role from the DB (not from the token). */
  role: string
  tokenId: string
  tokenPrefix: string
  scopes: ApiTokenScope[]
}

export interface AuthFailure {
  ok: false
  status: 401 | 403 | 429
  error: string
  code: ApiErrorCode
  headers?: Record<string, string>
}

export type ApiAuthResult = { ok: true; principal: ApiPrincipal; rate: RateLimitStatus & { limit: number } } | AuthFailure

const UNAUTHORIZED: AuthFailure = { ok: false, status: 401, error: "Unauthorized", code: "UNAUTHORIZED", headers: { "WWW-Authenticate": 'Bearer realm="kanflow"' } }

function tooMany(status: RateLimitStatus, limit: number): AuthFailure {
  return {
    ok: false,
    status: 429,
    error: "Too many requests",
    code: "RATE_LIMITED",
    headers: {
      "Retry-After": String(Math.max(Math.ceil(status.retryAfterMs / 1000), 1)),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": "0",
    },
  }
}

function failureLimiter() {
  return getRateLimiter("api-v1:auth-fail-ip", { limit: AUTH_FAILURES_PER_IP_PER_MIN, windowMs: MINUTE_MS })
}

function tokenLimiter(limit: number) {
  // The limit is part of the name so a changed API_V1_RATE_LIMIT_PER_MIN takes effect.
  return getRateLimiter(`api-v1:token:${limit}`, { limit, windowMs: MINUTE_MS })
}

function lastTouch(): Map<string, number> {
  const g = globalThis as { __kanflowApiTokenTouch?: Map<string, number> }
  g.__kanflowApiTokenTouch ??= new Map()
  return g.__kanflowApiTokenTouch
}

/** Test helper. */
export function resetApiTokenTouchCache(): void {
  lastTouch().clear()
}

/** Fire-and-forget lastUsedAt update, at most once per LAST_USED_WRITE_INTERVAL_MS per token. */
function maybeTouchLastUsed(row: { id: string; lastUsedAt: Date | null }, nowMs: number): void {
  const touched = lastTouch()
  const last = Math.max(touched.get(row.id) ?? 0, row.lastUsedAt?.getTime() ?? 0)
  if (nowMs - last < LAST_USED_WRITE_INTERVAL_MS) return
  touched.set(row.id, nowMs)
  if (touched.size > 10_000) touched.clear()
  repo.touchLastUsed(defaultDb, row.id, new Date(nowMs)).catch((err: unknown) => {
    log.warn("lastUsedAt update failed", { patId: row.id, error: err instanceof Error ? err.message : String(err) })
  })
}

function reject(ip: string | null, reason: string, fields: Record<string, unknown> = {}): AuthFailure {
  if (ip) failureLimiter().hit(ip)
  log.info("api request rejected", { reason, ip, ...fields })
  return UNAUTHORIZED
}

export async function authenticateApiRequest(request: Request, now: () => number = Date.now): Promise<ApiAuthResult> {
  const cfg = loadApiTokenConfig()
  if (!cfg.enabled) return { ok: false, status: 403, error: "API tokens are disabled", code: "FORBIDDEN" }

  const ip = clientIpFromHeaders(request.headers)
  if (ip) {
    const budget = failureLimiter().peek(ip)
    if (budget.limited) return tooMany(budget, AUTH_FAILURES_PER_IP_PER_MIN)
  }

  const raw = bearerToken(request.headers.get("authorization"))
  if (!raw) return reject(null, "missing")
  if (!isWellFormedToken(raw)) return reject(ip, "malformed")

  const row = await repo.findTokenByHash(defaultDb, hashApiToken(raw))
  if (!row) return reject(ip, "unknown")
  const nowMs = now()
  const state = tokenState(row, new Date(nowMs))
  if (state !== "active") return reject(ip, state, { patPrefix: row.prefix, userId: row.userId })

  const scopes = parseScopes(row.scopes)
  if (!scopes.includes("read")) {
    return { ok: false, status: 403, error: "Insufficient scope", code: "FORBIDDEN" }
  }

  const user = checkTokenAgainstUser(row.userTokenVersion, await loadUserAuthState(row.userId, nowMs))
  if (!user.valid) return reject(ip, `user_${user.reason}`, { patPrefix: row.prefix, userId: row.userId })

  // peek then hit: the limiter reports "limited" once `limit` hits are recorded,
  // so the limit-th request itself must still pass.
  const limiter = tokenLimiter(cfg.ratePerMinute)
  const budget = limiter.peek(row.id)
  if (budget.limited) return tooMany(budget, cfg.ratePerMinute)
  const rate = limiter.hit(row.id)

  maybeTouchLastUsed(row, nowMs)
  return {
    ok: true,
    principal: { userId: row.userId, role: user.role, tokenId: row.id, tokenPrefix: row.prefix, scopes },
    rate: { ...rate, limit: cfg.ratePerMinute },
  }
}
