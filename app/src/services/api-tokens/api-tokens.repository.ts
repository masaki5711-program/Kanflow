import type { Db } from "@/services/_shared/db"

/** Upper bound of the admin token list (tokens per user are capped, so this is generous). */
export const ADMIN_TOKEN_LIST_LIMIT = 2000

const TOKEN_LIST_SELECT = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
} as const

/** Tokens that still count against the per-user limit: not revoked and not expired. */
export function countActiveTokens(db: Db, userId: string, now: Date): Promise<number> {
  return db.apiToken.count({
    where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  })
}

export function findUserTokenVersion(db: Db, userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, isActive: true } })
}

export function insertToken(
  db: Db,
  data: {
    userId: string
    name: string
    tokenHash: string
    prefix: string
    scopes: string
    userTokenVersion: number
    expiresAt: Date | null
  }
) {
  return db.apiToken.create({ data, select: TOKEN_LIST_SELECT })
}

/** The user's tokens that were not revoked (expired ones included, shown as expired). */
export function findUserTokens(db: Db, userId: string) {
  return db.apiToken.findMany({
    where: { userId, revokedAt: null },
    select: TOKEN_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
}

/** Every non-revoked token with its owner (admin list). */
export function findAllTokens(db: Db) {
  return db.apiToken.findMany({
    where: { revokedAt: null },
    select: { ...TOKEN_LIST_SELECT, user: { select: { id: true, name: true, email: true, isActive: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_TOKEN_LIST_LIMIT,
  })
}

/** A live token by id (optionally only the given owner's), for revoke + audit log. */
export function findLiveToken(db: Db, id: string, userId?: string) {
  return db.apiToken.findFirst({
    where: { id, revokedAt: null, ...(userId !== undefined ? { userId } : {}) },
    select: { id: true, userId: true, prefix: true },
  })
}

export function revokeToken(db: Db, id: string, now: Date) {
  return db.apiToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } })
}

export function revokeUserTokens(db: Db, userId: string, now: Date) {
  return db.apiToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })
}

/** Bearer lookup: one UNIQUE index probe on the hash. */
export function findTokenByHash(db: Db, tokenHash: string) {
  return db.apiToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      prefix: true,
      scopes: true,
      userTokenVersion: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  })
}

export function touchLastUsed(db: Db, id: string, now: Date) {
  return db.apiToken.updateMany({ where: { id }, data: { lastUsedAt: now } })
}
