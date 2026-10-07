/**
 * In-memory sliding-window rate limiter (single-process, self-hosted deploy).
 *
 * Each key keeps the timestamps of its recent hits. A key is limited once
 * it has `limit` hits inside the trailing `windowMs`. State is lost on
 * restart, which is acceptable for brute-force throttling.
 */

export interface RateLimitOptions {
  limit: number
  windowMs: number
  /** Upper bound on tracked keys before a full sweep of expired entries. */
  maxKeys?: number
  now?: () => number
}

export interface RateLimitStatus {
  limited: boolean
  remaining: number
  /** ms until the oldest hit leaves the window (0 when not limited). */
  retryAfterMs: number
}

export interface RateLimiter {
  /** Inspect the key without recording a hit. */
  peek(key: string): RateLimitStatus
  /** Record a hit and return the status after recording. */
  hit(key: string): RateLimitStatus
  /** Forget all hits for a key (e.g. after a successful login). */
  reset(key: string): void
  size(): number
}

const DEFAULT_MAX_KEYS = 10_000

function recentHits(hits: readonly number[], now: number, windowMs: number): number[] {
  return hits.filter((t) => now - t < windowMs)
}

function statusFor(hits: readonly number[], now: number, opts: RateLimitOptions): RateLimitStatus {
  const limited = hits.length >= opts.limit
  const oldest = hits.length > 0 ? hits[0] : now
  return {
    limited,
    remaining: Math.max(opts.limit - hits.length, 0),
    retryAfterMs: limited ? Math.max(oldest + opts.windowMs - now, 0) : 0,
  }
}

export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  if (opts.limit <= 0 || opts.windowMs <= 0) {
    throw new Error("rate limiter requires positive limit and windowMs")
  }
  const store = new Map<string, readonly number[]>()
  const clock = opts.now ?? Date.now
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS

  function sweep(now: number): void {
    for (const [key, hits] of store) {
      const fresh = recentHits(hits, now, opts.windowMs)
      if (fresh.length === 0) store.delete(key)
      else store.set(key, fresh)
    }
  }

  function current(key: string, now: number): number[] {
    return recentHits(store.get(key) ?? [], now, opts.windowMs)
  }

  return {
    peek(key) {
      const now = clock()
      return statusFor(current(key, now), now, opts)
    },
    hit(key) {
      const now = clock()
      if (!store.has(key) && store.size >= maxKeys) sweep(now)
      const next = [...current(key, now), now]
      store.set(key, next)
      return statusFor(next, now, opts)
    },
    reset(key) {
      store.delete(key)
    },
    size() {
      return store.size
    },
  }
}

type LimiterRegistry = Map<string, RateLimiter>

const globalForLimiters = globalThis as unknown as { __kanflowRateLimiters?: LimiterRegistry }

/**
 * Process-wide named limiter. Stored on globalThis so every route bundle
 * (and dev HMR reloads) share the same counters.
 */
export function getRateLimiter(name: string, opts: RateLimitOptions): RateLimiter {
  const registry = globalForLimiters.__kanflowRateLimiters ?? new Map<string, RateLimiter>()
  globalForLimiters.__kanflowRateLimiters = registry
  const existing = registry.get(name)
  if (existing) return existing
  const limiter = createRateLimiter(opts)
  registry.set(name, limiter)
  return limiter
}

/** Best-effort client IP from proxy headers; null when unavailable. */
export function clientIpFromHeaders(headers: Headers | null | undefined): string | null {
  if (!headers) return null
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const real = headers.get("x-real-ip")?.trim()
  return real || null
}

export function retryAfterSeconds(status: RateLimitStatus): string {
  return String(Math.max(Math.ceil(status.retryAfterMs / 1000), 1))
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

export const LOGIN_LIMITS = {
  perUser: { limit: 10, windowMs: FIFTEEN_MINUTES_MS },
  perIp: { limit: 50, windowMs: FIFTEEN_MINUTES_MS },
} as const

export interface LoginLimiters {
  byUser: RateLimiter
  byIp: RateLimiter
}

export function getLoginLimiters(): LoginLimiters {
  return {
    byUser: getRateLimiter("login:user", LOGIN_LIMITS.perUser),
    byIp: getRateLimiter("login:ip", LOGIN_LIMITS.perIp),
  }
}

function userKey(username: string): string {
  return username.trim().toLowerCase()
}

/** True when either the username or the client IP has exhausted its failure budget. */
export function isLoginBlocked(
  limiters: LoginLimiters,
  username: string,
  ip: string | null
): boolean {
  if (limiters.byUser.peek(userKey(username)).limited) return true
  return ip !== null && limiters.byIp.peek(ip).limited
}

export function recordLoginFailure(
  limiters: LoginLimiters,
  username: string,
  ip: string | null
): void {
  limiters.byUser.hit(userKey(username))
  if (ip !== null) limiters.byIp.hit(ip)
}

/** A successful login clears the per-user counter (per-IP keeps counting). */
export function recordLoginSuccess(limiters: LoginLimiters, username: string): void {
  limiters.byUser.reset(userKey(username))
}

/** Per-user limits for the AI endpoints (Ollama is a shared, single-request resource). */
export const AI_CHAT_RATE_LIMIT: RateLimitOptions = { limit: 30, windowMs: 60_000 }
export const AI_JOB_RATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 60_000 }
/** Per-user limit for emoji reaction toggles (generous for clicking, stops a script). */
export const REACTION_RATE_LIMIT: RateLimitOptions = { limit: 60, windowMs: 60_000 }

/**
 * Record a hit for `key` on the named limiter. Returns the Retry-After value
 * (seconds, as a string) when the caller is over the limit, else null.
 */
export function consumeRateLimit(name: string, opts: RateLimitOptions, key: string): string | null {
  const limiter = getRateLimiter(name, opts)
  const status = limiter.peek(key)
  if (status.limited) return retryAfterSeconds(status)
  limiter.hit(key)
  return null
}
