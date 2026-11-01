import crypto from "node:crypto"
import { loadApiTokenConfig } from "@/lib/api-tokens/config"
import type { ProjectAction, ProjectActor } from "@/lib/authz"
import { getRateLimiter } from "@/lib/rate-limit"
import type { Actor } from "@/services/_shared/actor"
import { ConflictError, StatusError } from "@/services/_shared/errors"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { loadApiActor } from "@/services/api-v1/api-v1.service"
import { assertV1Action, assertV1Scope, resolveV1ProjectActor, V1Reply, v1ProjectRoute, v1Route, type V1Context, type V1Handler, type V1ProjectContext } from "./v1-route"

/**
 * Write routes of /api/v1 (docs/api-v1.md "Writes") and the write tools of
 * the Kanflow MCP server (/api/mcp, docs/mcp.md). Both go through
 * `runV1Write`, which does not depend on a Request. On top of the project
 * resolution (token, project access, project restriction —
 * resolveV1ProjectActor, done by the caller):
 *
 * 1. `assertV1Action`: the token scope AND the owner's project role
 *    (403 INSUFFICIENT_SCOPE / FORBIDDEN).
 * 2. Write budget per token (`API_V1_WRITE_RATE_LIMIT_PER_MIN`, 429).
 * 3. Body (REST: JSON, 400 INVALID_JSON); the handler validates it with the
 *    same schema as the UI route and calls the same service, so validation,
 *    notifications and the activity log are identical. The service actor
 *    carries `via: "api"` (REST) or `via: "mcp"` (MCP tools), which the
 *    activity log records as `meta.via`.
 * 4. Idempotency on creates: REST honours an optional `Idempotency-Key`
 *    header, MCP passes a key per tool call (docs/mcp.md). A retry with the
 *    same key and body gets the first response again (`Idempotent-Replayed:
 *    true`) instead of a duplicate; the same key with another body is 409.
 *    Kept in memory per web process for IDEMPOTENCY_TTL_MS (or the shorter
 *    TTL the caller sets).
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
  /** The operation applies its own per-token budget (feedback reports): the generic write budget is skipped. */
  ownBudget?: boolean
}

/** Idempotency of one write call: `scope` separates surfaces / endpoints, `key` is the caller's key. */
export interface V1IdempotencyKey {
  scope: string
  key: string
  /** Defaults to IDEMPOTENCY_TTL_MS. */
  ttlMs?: number
}

/** One write, independent of how it arrived (REST request or MCP tool call). */
export interface V1WriteCall {
  principal: ApiPrincipal
  /**
   * The token owner's actor, from resolveV1ProjectActor. null = an account-level operation that is
   * not about one project (the feedback loop): only the token scope is checked here and the
   * handler decides what the owner may do.
   */
  actor: ProjectActor | null
  action: ProjectAction
  /** Success status unless the handler returns its own V1Reply. */
  status: number
  /** Read lazily so a refused write never parses its body. */
  readBody: () => Promise<unknown>
  /** null / absent = no idempotency. */
  idempotency?: V1IdempotencyKey | null
  /** Recorded in the activity log as meta.via; absent = "api". */
  via?: "mcp"
  /** The handler applies its own per-token budget, so the generic write budget (API_V1_WRITE_RATE_LIMIT_PER_MIN) is skipped. */
  ownBudget?: boolean
  handler: (body: unknown, serviceActor: Actor) => Promise<object | V1Reply>
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

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new StatusError(400, "Invalid JSON", {}, "INVALID_JSON")
  }
}

/** Pure: JSON with object keys sorted, so a retry that only reorders keys is the same request. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  )
}

function fingerprintOf(body: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(body)).digest("hex")
}

function asReply(result: object | V1Reply, status: number): V1Reply {
  return result instanceof V1Reply ? result : new V1Reply(result, status)
}

/**
 * The shared write path (see the file comment): scope ∩ role, write budget,
 * body, idempotency, then the handler with the token owner's service actor.
 */
export async function runV1Write(call: V1WriteCall): Promise<V1Reply> {
  if (call.actor) assertV1Action(call.principal, call.actor, call.action)
  else assertV1Scope(call.principal, call.action)
  if (!call.ownBudget) {
    const limited = writeBudget(call.principal.tokenId)
    if (limited) return limited
  }

  const body = await call.readBody()
  const run = async () => {
    const apiActor = await loadApiActor(call.principal)
    const serviceActor: Actor = call.via ? { ...apiActor, via: call.via } : apiActor
    return asReply(await call.handler(body, serviceActor), call.status)
  }

  const idem = call.idempotency
  if (!idem) return run()
  if (!IDEMPOTENCY_KEY_PATTERN.test(idem.key)) {
    throw new StatusError(400, "Invalid Idempotency-Key (1-200 visible ASCII characters)", {}, "VALIDATION")
  }

  const store = idempotencyStore()
  const now = Date.now()
  const storeKey = `${call.principal.tokenId}\n${idem.scope}\n${idem.key}`
  const fingerprint = fingerprintOf(body)
  const existing = store.get(storeKey)
  if (existing && existing.expiresAt > now) {
    if (existing.fingerprint !== fingerprint) throw new ConflictError("Idempotency-Key was used with a different request")
    const first = await existing.reply
    return new V1Reply(first.body, first.status, { ...first.headers, "Idempotent-Replayed": "true" })
  }

  pruneExpired(store, now)
  const reply = run()
  store.set(storeKey, { fingerprint, expiresAt: now + (idem.ttlMs ?? IDEMPOTENCY_TTL_MS), reply })
  try {
    const result = await reply
    // Only successes are replayed; a failed attempt may be retried with the same key.
    if (result.status >= 300) store.delete(storeKey)
    return result
  } catch (error) {
    store.delete(storeKey)
    throw error
  }
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
    const key = options.idempotent ? ctx.request.headers.get("idempotency-key") : null
    return runV1Write({
      principal: ctx.principal,
      actor: ctx.actor,
      action,
      status,
      readBody: () => readJson(ctx.request),
      idempotency: key === null ? null : { scope: `${ctx.request.method}\n${new URL(ctx.request.url).pathname}`, key },
      handler: (body, serviceActor) => handler({ ...ctx, body, serviceActor }),
    })
  })
}

export interface V1AccountWriteContext<P> extends V1Context<P> {
  body: unknown
  serviceActor: Actor
}

/**
 * A write that is not under /projects/:projectId (feedback loop, W11). `projectOf` (optional) names
 * the project the body refers to: then the owner's project role must allow `action` too (like a
 * project write); without a project only the token scope is checked and the handler authorizes.
 */
export function v1AccountWrite<P extends Record<string, string> = Record<string, never>>(
  action: ProjectAction,
  status: number,
  handler: (ctx: V1AccountWriteContext<P>) => Promise<object | V1Reply>,
  options: WriteOptions & { projectOf?: (body: unknown) => string | undefined } = {}
): V1Handler<P> {
  return v1Route<P>(async (ctx) => {
    const key = options.idempotent ? ctx.request.headers.get("idempotency-key") : null
    const early = options.projectOf ? await readJson(ctx.request) : undefined
    const projectId = options.projectOf ? options.projectOf(early) : undefined
    const actor = projectId ? await resolveV1ProjectActor(ctx.principal, projectId) : null
    return runV1Write({
      principal: ctx.principal,
      actor,
      action,
      status,
      ownBudget: options.ownBudget,
      readBody: () => (options.projectOf ? Promise.resolve(early) : readJson(ctx.request)),
      idempotency: key === null ? null : { scope: `${ctx.request.method}\n${new URL(ctx.request.url).pathname}`, key },
      handler: (body, serviceActor) => handler({ ...ctx, body, serviceActor }),
    })
  })
}
