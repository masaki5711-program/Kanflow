/**
 * Personal access tokens: create / list / revoke (user and admin), and the
 * revoke-all hook the users service calls when a user's sessions are revoked.
 *
 * Security: the plain token exists only in the create response. Rows hold the
 * SHA-256 hash; logs carry the user id and the display prefix (`patPrefix`),
 * never the token (field names avoid "token" so the logger's key-based
 * redaction does not blank the prefix either).
 */
import { API_TOKEN_EXPIRY_DAYS, loadApiTokenConfig } from "@/lib/api-tokens/config"
import { generateApiToken, parseScopes, serializeScopes, tokenState, type ApiTokenScope, type TokenState } from "@/lib/api-tokens/token"
import { logger } from "@/lib/logger"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import * as repo from "./api-tokens.repository"
import type { CreateApiTokenInput } from "./api-tokens.schemas"

const log = logger.child({ module: "api-tokens" })
const DAY_MS = 86_400_000

export interface ApiTokenDto {
  id: string
  name: string
  prefix: string
  scopes: ApiTokenScope[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  state: TokenState
}

export interface AdminApiTokenDto extends ApiTokenDto {
  user: { id: string; name: string; email: string; isActive: boolean }
}

interface TokenRow {
  id: string
  name: string
  prefix: string
  scopes: string
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** Pure: row → DTO (never includes the hash). */
export function toTokenDto(row: TokenRow, now: Date): ApiTokenDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: parseScopes(row.scopes),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: iso(row.lastUsedAt),
    expiresAt: iso(row.expiresAt),
    state: tokenState(row, now),
  }
}

export interface OwnTokensDto {
  config: { enabled: boolean; maxPerUser: number; allowNoExpiry: boolean; expiryDays: readonly number[] }
  tokens: ApiTokenDto[]
}

export async function getOwnTokens(userId: string, now: Date = new Date()): Promise<OwnTokensDto> {
  const cfg = loadApiTokenConfig()
  const rows = await repo.findUserTokens(defaultDb, userId)
  return {
    config: { enabled: cfg.enabled, maxPerUser: cfg.maxPerUser, allowNoExpiry: cfg.allowNoExpiry, expiryDays: API_TOKEN_EXPIRY_DAYS },
    tokens: rows.map((r) => toTokenDto(r, now)),
  }
}

export interface CreatedTokenDto extends ApiTokenDto {
  /** The plain token. Shown once; it cannot be retrieved again. */
  token: string
}

export async function createOwnToken(userId: string, input: CreateApiTokenInput, now: Date = new Date()): Promise<CreatedTokenDto> {
  const cfg = loadApiTokenConfig()
  if (!cfg.enabled) throw new ForbiddenError("API tokens are disabled")
  if (input.expiresInDays === null && !cfg.allowNoExpiry) throw new ValidationError("An expiry is required")

  const generated = generateApiToken()
  const created = await withTransaction(async (tx) => {
    const user = await repo.findUserTokenVersion(tx, userId)
    if (!user || !user.isActive) throw new NotFoundError("User not found", {}, "USER_NOT_FOUND")
    if ((await repo.countActiveTokens(tx, userId, now)) >= cfg.maxPerUser) {
      throw new ConflictError(`Token limit reached (${cfg.maxPerUser})`, { maxPerUser: cfg.maxPerUser })
    }
    return repo.insertToken(tx, {
      userId,
      name: input.name,
      tokenHash: generated.hash,
      prefix: generated.prefix,
      scopes: serializeScopes(["read"]),
      userTokenVersion: user.tokenVersion,
      expiresAt: input.expiresInDays === null ? null : new Date(now.getTime() + input.expiresInDays * DAY_MS),
    })
  })
  log.info("api token created", { userId, patId: created.id, patPrefix: created.prefix, expiresAt: iso(created.expiresAt) })
  return { ...toTokenDto(created, now), token: generated.token }
}

async function revoke(byUserId: string, id: string, ownerId: string | undefined, now: Date): Promise<void> {
  const token = await repo.findLiveToken(defaultDb, id, ownerId)
  if (!token) throw new NotFoundError()
  await repo.revokeToken(defaultDb, id, now)
  log.info("api token revoked", { userId: token.userId, patId: token.id, patPrefix: token.prefix, by: byUserId })
}

/** The caller's own token; another user's token is 404 (existence not revealed). */
export function revokeOwnToken(userId: string, id: string, now: Date = new Date()): Promise<void> {
  return revoke(userId, id, userId, now)
}

export function revokeTokenAsAdmin(adminId: string, id: string, now: Date = new Date()): Promise<void> {
  return revoke(adminId, id, undefined, now)
}

export async function listAllTokens(now: Date = new Date()): Promise<{ enabled: boolean; tokens: AdminApiTokenDto[] }> {
  const rows = await repo.findAllTokens(defaultDb)
  return {
    enabled: loadApiTokenConfig().enabled,
    tokens: rows.map((r) => ({ ...toTokenDto(r, now), user: r.user })),
  }
}

/**
 * Revoke every live token of a user (deactivation, role change, password
 * reset — whenever the user's sessions are revoked). Runs in the caller's
 * transaction client. Returns the number of revoked tokens.
 */
export async function revokeAllUserTokens(db: Db, userId: string, reason: string, now: Date = new Date()): Promise<number> {
  const { count } = await repo.revokeUserTokens(db, userId, now)
  if (count > 0) log.info("api tokens revoked for user", { userId, count, reason })
  return count
}
