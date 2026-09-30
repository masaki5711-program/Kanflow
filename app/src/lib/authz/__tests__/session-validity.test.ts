import { beforeEach, describe, expect, it, vi } from "vitest"

const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))

const {
  SESSION_STATE_TTL_MS,
  checkTokenAgainstUser,
  clearUserAuthStateCache,
  invalidateUserAuthState,
  loadUserAuthState,
} = await import("@/lib/authz/session-validity")

const ACTIVE = { isActive: true, role: "member", tokenVersion: 2 }

beforeEach(() => {
  findUnique.mockReset()
  clearUserAuthStateCache()
})

describe("checkTokenAgainstUser", () => {
  it("accepts an active user whose tokenVersion matches and returns the DB role", () => {
    expect(checkTokenAgainstUser(2, { ...ACTIVE, role: "admin" })).toEqual({ valid: true, role: "admin" })
  })

  it("rejects a deleted user", () => {
    expect(checkTokenAgainstUser(0, null)).toEqual({ valid: false, reason: "user_missing" })
  })

  it("rejects a deactivated user", () => {
    expect(checkTokenAgainstUser(2, { ...ACTIVE, isActive: false })).toEqual({ valid: false, reason: "inactive" })
  })

  it("rejects a token issued before the version was bumped", () => {
    expect(checkTokenAgainstUser(1, ACTIVE)).toEqual({ valid: false, reason: "revoked" })
  })

  it("treats a token without tokenVersion (issued before the column existed) as version 0", () => {
    expect(checkTokenAgainstUser(undefined, { ...ACTIVE, tokenVersion: 0 })).toEqual({ valid: true, role: "member" })
    expect(checkTokenAgainstUser(undefined, ACTIVE)).toMatchObject({ valid: false, reason: "revoked" })
  })

  it("rejects a non-numeric tokenVersion claim", () => {
    expect(checkTokenAgainstUser("0" as unknown as number, { ...ACTIVE, tokenVersion: 0 })).toMatchObject({ valid: false })
  })
})

describe("loadUserAuthState", () => {
  it("reads isActive / role / tokenVersion by id", async () => {
    findUnique.mockResolvedValue(ACTIVE)
    await expect(loadUserAuthState("u1")).resolves.toEqual(ACTIVE)
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { isActive: true, role: true, tokenVersion: true },
    })
  })

  it("caches the result per user for the TTL", async () => {
    findUnique.mockResolvedValue(ACTIVE)
    await loadUserAuthState("u1", 1_000)
    await loadUserAuthState("u1", 1_000 + SESSION_STATE_TTL_MS - 1)
    expect(findUnique).toHaveBeenCalledTimes(1)

    await loadUserAuthState("u1", 1_000 + SESSION_STATE_TTL_MS)
    expect(findUnique).toHaveBeenCalledTimes(2)
  })

  it("caches a missing user as null too", async () => {
    findUnique.mockResolvedValue(null)
    await expect(loadUserAuthState("gone", 0)).resolves.toBeNull()
    await expect(loadUserAuthState("gone", 1)).resolves.toBeNull()
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it("keys the cache by user id", async () => {
    findUnique.mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce({ ...ACTIVE, role: "admin" })
    await expect(loadUserAuthState("u1", 0)).resolves.toMatchObject({ role: "member" })
    await expect(loadUserAuthState("u2", 0)).resolves.toMatchObject({ role: "admin" })
  })

  it("invalidateUserAuthState forces the next call to hit the DB", async () => {
    findUnique.mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce({ ...ACTIVE, isActive: false })
    await loadUserAuthState("u1", 0)
    invalidateUserAuthState("u1")
    await expect(loadUserAuthState("u1", 1)).resolves.toMatchObject({ isActive: false })
    expect(findUnique).toHaveBeenCalledTimes(2)
  })

  it("does not cache DB failures (the error propagates)", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(ACTIVE)
    await expect(loadUserAuthState("u1", 0)).rejects.toThrow("db down")
    await expect(loadUserAuthState("u1", 1)).resolves.toEqual(ACTIVE)
  })
})
