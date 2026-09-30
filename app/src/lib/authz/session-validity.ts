import { prisma } from "@/lib/prisma"

/**
 * Server-side re-validation of JWT sessions.
 *
 * A JWT is self-contained, so without a DB check a deactivated / demoted user
 * keeps their old rights until the cookie expires (up to 2 h). The auth.ts
 * `jwt` callback runs on every `auth()` call and checks the token against
 * the user row: exists, isActive, tokenVersion matches (bumped by admins to
 * revoke sessions), and takes the role from the DB instead of the token.
 *
 * To keep that to at most one small query per user per TTL, the row is
 * cached in memory. Admin changes call `invalidateUserAuthState` so the
 * process that handled the change sees it immediately; other processes see
 * it within the TTL.
 */

export interface UserAuthState {
  isActive: boolean
  role: string
  tokenVersion: number
}

export type TokenCheck =
  | { valid: true; role: string }
  | { valid: false; reason: "user_missing" | "inactive" | "revoked" }

/** How long a user's auth state is trusted before re-reading the DB. */
export const SESSION_STATE_TTL_MS = 30_000

/** Above this many entries, expired ones are pruned on insert. */
const PRUNE_THRESHOLD = 500

interface CacheEntry {
  state: UserAuthState | null
  expiresAt: number
}

type StateCache = Map<string, CacheEntry>

/** One cache per process (route handlers and RSC may load separate module copies). */
function cache(): StateCache {
  const g = globalThis as { __kanflowUserAuthState?: StateCache }
  g.__kanflowUserAuthState ??= new Map()
  return g.__kanflowUserAuthState
}

function pruneExpired(entries: StateCache, now: number): void {
  if (entries.size <= PRUNE_THRESHOLD) return
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key)
  }
}

/**
 * The user's current auth state (null = no such user), cached for
 * SESSION_STATE_TTL_MS. DB errors propagate and are not cached.
 */
export async function loadUserAuthState(userId: string, now: number = Date.now()): Promise<UserAuthState | null> {
  const entries = cache()
  const hit = entries.get(userId)
  if (hit && hit.expiresAt > now) return hit.state

  const state = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true, tokenVersion: true },
  })
  pruneExpired(entries, now)
  entries.set(userId, { state, expiresAt: now + SESSION_STATE_TTL_MS })
  return state
}

/** Drop the cached state so the next request re-reads the DB (call after admin changes). */
export function invalidateUserAuthState(userId: string): void {
  cache().delete(userId)
}

/** Test helper: forget every cached state. */
export function clearUserAuthStateCache(): void {
  cache().clear()
}

/**
 * Pure decision: may a token carrying `tokenVersion` still act for this user?
 * A token without the claim (issued before tokenVersion existed) counts as 0,
 * so existing sessions survive the deploy until an admin bumps the version.
 */
export function checkTokenAgainstUser(tokenVersion: number | undefined, user: UserAuthState | null): TokenCheck {
  if (!user) return { valid: false, reason: "user_missing" }
  if (!user.isActive) return { valid: false, reason: "inactive" }
  const claimed = tokenVersion === undefined ? 0 : tokenVersion
  if (typeof claimed !== "number" || claimed !== user.tokenVersion) return { valid: false, reason: "revoked" }
  return { valid: true, role: user.role }
}
