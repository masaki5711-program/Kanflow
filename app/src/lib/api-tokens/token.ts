import crypto from "node:crypto"
import { isApiTokenScope, type ApiTokenScope } from "./scopes"

/**
 * Personal access tokens (pure helpers, no I/O).
 *
 * Format: `kfl_` + 32 random bytes as base64url (43 chars). Only the SHA-256
 * hex of the whole token is stored (ApiToken.tokenHash, UNIQUE), so a lookup
 * is an index probe on the hash — no per-token string comparison that could
 * leak timing — and a database dump holds no usable credential.
 * The first 12 characters (`kfl_` + 8) are kept as a display prefix.
 */

export const TOKEN_PREFIX = "kfl_"
const RANDOM_BYTES = 32
/** base64url length of RANDOM_BYTES without padding. */
const RANDOM_CHARS = 43
const DISPLAY_PREFIX_LENGTH = 12
const TOKEN_PATTERN = new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{${RANDOM_CHARS}}$`)

export { API_TOKEN_SCOPES, type ApiTokenScope } from "./scopes"

/** Upper bound of projects a token can be restricted to. */
export const API_TOKEN_MAX_PROJECTS = 50

export interface GeneratedToken {
  /** Plain token: returned to the user once, never stored or logged. */
  token: string
  hash: string
  prefix: string
}

export function hashApiToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex")
}

export function displayPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LENGTH)
}

export function generateApiToken(): GeneratedToken {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(RANDOM_BYTES).toString("base64url")}`
  return { token, hash: hashApiToken(token), prefix: displayPrefix(token) }
}

/** Cheap syntactic check before any DB lookup. */
export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

/** The credential of an `Authorization: Bearer <token>` header, else null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim())
  return match ? match[1] : null
}

export function serializeScopes(scopes: readonly ApiTokenScope[]): string {
  return JSON.stringify(scopes)
}

/** Stored JSON array → known scopes (malformed text or unknown entries grant nothing). */
export function parseScopes(text: string): ApiTokenScope[] {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isApiTokenScope)
  } catch {
    return []
  }
}

/** Project restriction → ApiToken.projectIds (null = every project the owner can access). */
export function serializeProjectIds(projectIds: readonly string[] | null): string | null {
  return projectIds && projectIds.length > 0 ? JSON.stringify(projectIds) : null
}

/**
 * Stored ApiToken.projectIds → the allowed project ids, or null for "no
 * restriction". Malformed text fails closed (an empty list = no project).
 */
export function parseProjectIds(text: string | null): string[] | null {
  if (text === null) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === "string" && p.length > 0)
  } catch {
    return []
  }
}

export type TokenState = "active" | "revoked" | "expired"

export function tokenState(row: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): TokenState {
  if (row.revokedAt) return "revoked"
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "expired"
  return "active"
}
