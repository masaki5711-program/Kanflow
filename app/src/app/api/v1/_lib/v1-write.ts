import crypto from "node:crypto"
import { loadApiTokenConfig } from "@/lib/api-tokens/config"
import type { ProjectAction } from "@/lib/authz"
import { getRateLimiter } from "@/lib/rate-limit"
import type { Actor } from "@/services/_shared/actor"
import { ConflictError, StatusError } from "@/services/_shared/errors"
import { loadApiActor } from "@/services/api-v1/api-v1.service"
import { assertV1Action, V1Reply, v1ProjectRoute, type V1Handler, type V1ProjectContext } from "./v1-route"

/**
 * Write routes of /api/v1 (docs/api-v1.md "Writes"), used by scripts and the
 * Kanflow MCP server. On top of v1ProjectRoute (token, project access,
 * project restriction):
 *
 * 1. `assertV1Action`: the token scope AND the owner's project role
 *    (403 INSUFFICIENT_SCOPE / FORBIDDEN).
 * 2. Write budget per token (`API_V1_WRITE_RATE_LIMIT_PER_MIN`, 429).
 * 3. JSON body (400 INVALID_JSON); the handler validates it with the same
 *    schema as the UI route and calls the same service, so validation,
 *    notifications and the activity log are identical. The service actor
 *    carries `via: "api"`, which the activity log records.
 * 4. Optional `Idempotency-Key` header on creates: a retry with the same key
 *    and body gets the first response again (`Idempotent-Replayed: true`)
 *    instead of a duplicate; the same key with another body is 409.
 *    Kept in memory per web process for IDEMPOTENCY_TTL_MS.
 */

const MINUTE_MS = 60_000
export const IDEMPOTENCY_TTL_MS = 24 * 60 * MINUTE_MS
const IDEMPOTENCY_MAX_ENTRIES = 10_000
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,200}$/

export interface V1WriteContext<P> extends V1ProjectContext<P> {
  /** Parsed JSON body (unvalidated: parse it with the route's schema). */
  body: unknown
  /** Service actor of the token owner, `via: "api"`. */
  serviceActor: Actor
}

interface WriteOptions {
  /** Honour `Idempotency-Key` (creates). */
  idempotent?: boolean
}

interface IdempotencyEntry {
  fingerprint: string
  expiresAt: number
  reply: Promise<V1Reply>
}

function idempotencyStore(): Map<string, IdempotencyEntry> {
  const g = globalThis as { __kanflowV1Idempotency?: Map<string, IdempotencyEntry> }
  g.__kanflowV1Idempotency ??= new Map()
  return g.__kanflowV1Idempotency
}

/** Test helper. */
export function resetIdempotencyStore(): void {
  idempotencyStore().clear()
}

function pruneExpired(store: Map<string, IdempotencyEntry>, now: number): void {
  for (const [k, e] of store) if (e.expiresAt <= now) store.delete(k)
  // Still full: drop the oldest (Map keeps insertion order).
  while (store.size >= IDEMPOTENCY_MAX_ENTRIES) {
    const first = store.keys().next()
    if (first.done) break
    store.delete(first.value)
  }
}

function writeBudget(tokenId: string): V1Reply | null {
  const limit = loadApiTokenConfig().writeRatePerMinute
  // The limit is part of the name so a changed API_V1_WRITE_RATE_LIMIT_PER_MIN takes effect.
  const limiter = getRateLimiter(`api-v1:write:${limit}`, { limit, windowMs: MINUTE_MS })
  const budget = limiter.peek(tokenId)
  if (budget.limited) {
    return new V1Reply({ error: "Too many write requests", code: "RATE_LIMITED" }, 429, {
      "Retry-After": String(Math.max(Math.ceil(budget.retryAfterMs / 1000), 1)),
    })
  }
  limiter.hit(tokenId)
  return null
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new StatusError(400, "Invalid JSON", {}, "INVALID_JSON")
  }
}

function fingerprintOf(body: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex")
}

function asReply(result: object | V1Reply, status: number): V1Reply {
  return result instanceof V1Reply ? result : new V1Reply(result, status)
}

/**
 * A v1 write route. `status` is the success status (201 for creates) unless
 * the handler returns its own V1Reply.
 */
export function v1ProjectWrite<P extends { projectId: string }>(
  action: ProjectAction,
  status: number,
  handler: (ctx: V1WriteContext<P>) => Promise<object | V1Reply>,
  options: WriteOptions = {}
): V1Handler<P> {
  return v1ProjectRoute<P>(async (ctx) => {
    assertV1Action(ctx.principal, ctx.actor, action)
    const limited = writeBudget(ctx.principal.tokenId)
    if (limited) return limited

    const body = await readJson(ctx.request)
    const run = async () => {
      const serviceActor = await loadApiActor(ctx.principal)
      return asReply(await handler({ ...ctx, body, serviceActor }), status)
    }

    const key = options.idempotent ? ctx.request.headers.get("idempotency-key") : null
    if (key === null) return run()
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new StatusError(400, "Invalid Idempotency-Key (1-200 visible ASCII characters)", {}, "VALIDATION")
    }

    const store = idempotencyStore()
    const now = Date.now()
    const storeKey = `${ctx.principal.tokenId}\n${ctx.request.method}\n${new URL(ctx.request.url).pathname}\n${key}`
    const fingerprint = fingerprintOf(body)
    const existing = store.get(storeKey)
    if (existing && existing.expiresAt > now) {
      if (existing.fingerprint !== fingerprint) throw new ConflictError("Idempotency-Key was used with a different request")
      const first = await existing.reply
      return new V1Reply(first.body, first.status, { ...first.headers, "Idempotent-Replayed": "true" })
    }

    pruneExpired(store, now)
    const reply = run()
    store.set(storeKey, { fingerprint, expiresAt: now + IDEMPOTENCY_TTL_MS, reply })
    try {
      const result = await reply
      // Only successes are replayed; a failed attempt may be retried with the same key.
      if (result.status >= 300) store.delete(storeKey)
      return result
    } catch (error) {
      store.delete(storeKey)
      throw error
    }
  })
}
