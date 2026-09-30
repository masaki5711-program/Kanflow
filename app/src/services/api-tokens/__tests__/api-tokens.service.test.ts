import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../api-tokens.repository")
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const repo = await import("../api-tokens.repository")
const { TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const svc = await import("../api-tokens.service")
const { hashApiToken } = await import("@/lib/api-tokens/token")

const NOW = new Date("2026-10-05T00:00:00.000Z")
const DAY = 86_400_000

function row(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    name: "CI",
    prefix: "kfl_ABCDEFGH",
    scopes: '["read"]',
    createdAt: NOW,
    lastUsedAt: null,
    expiresAt: new Date(NOW.getTime() + 30 * DAY),
    revokedAt: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.mocked(repo.countActiveTokens).mockResolvedValue(0)
  vi.mocked(repo.findUserTokenVersion).mockResolvedValue({ tokenVersion: 3, isActive: true })
  vi.mocked(repo.insertToken).mockImplementation(((_db: unknown, data: { name: string; prefix: string; expiresAt: Date | null }) =>
    Promise.resolve(row({ name: data.name, prefix: data.prefix, expiresAt: data.expiresAt }))) as never)
})
afterEach(() => vi.unstubAllEnvs())

describe("toTokenDto", () => {
  it("maps state and scopes", () => {
    expect(svc.toTokenDto(row(), NOW)).toEqual({
      id: "t1",
      name: "CI",
      prefix: "kfl_ABCDEFGH",
      scopes: ["read"],
      createdAt: NOW.toISOString(),
      lastUsedAt: null,
      expiresAt: new Date(NOW.getTime() + 30 * DAY).toISOString(),
      state: "active",
    })
    expect(svc.toTokenDto(row({ expiresAt: new Date(NOW.getTime() - 1) }), NOW).state).toBe("expired")
  })
})

describe("createOwnToken", () => {
  it("stores only the hash, pins the user's tokenVersion and returns the plain token once", async () => {
    const out = await svc.createOwnToken("u1", { name: "CI", expiresInDays: 90 }, NOW)
    expect(out.token).toMatch(/^kfl_/)
    const data = vi.mocked(repo.insertToken).mock.calls[0][1]
    expect(repo.insertToken).toHaveBeenCalledWith(TX, expect.any(Object))
    expect(data).toMatchObject({ userId: "u1", name: "CI", scopes: '["read"]', userTokenVersion: 3 })
    expect(data.tokenHash).toBe(hashApiToken(out.token))
    expect(JSON.stringify(data)).not.toContain(out.token)
    expect(data.expiresAt).toEqual(new Date(NOW.getTime() + 90 * DAY))
    expect(out.prefix).toBe(out.token.slice(0, 12))
  })

  it("logs creation with user id and prefix but never the token", async () => {
    const out = await svc.createOwnToken("u1", { name: "CI", expiresInDays: 30 }, NOW)
    expect(log.info).toHaveBeenCalledWith("api token created", expect.objectContaining({ userId: "u1", patPrefix: out.prefix }))
    expect(JSON.stringify(log.info.mock.calls)).not.toContain(out.token)
  })

  it("refuses when tokens are disabled (403)", async () => {
    vi.stubEnv("API_TOKENS_ENABLED", "off")
    await expect(svc.createOwnToken("u1", { name: "CI", expiresInDays: 30 }, NOW)).rejects.toMatchObject({ status: 403 })
  })

  it("refuses tokens without expiry unless allowed", async () => {
    await expect(svc.createOwnToken("u1", { name: "CI", expiresInDays: null }, NOW)).rejects.toMatchObject({ status: 400 })
    vi.stubEnv("API_TOKEN_ALLOW_NO_EXPIRY", "true")
    await svc.createOwnToken("u1", { name: "CI", expiresInDays: null }, NOW)
    expect(vi.mocked(repo.insertToken).mock.calls[0][1].expiresAt).toBeNull()
  })

  it("enforces API_TOKEN_MAX_PER_USER (409)", async () => {
    vi.stubEnv("API_TOKEN_MAX_PER_USER", "2")
    vi.mocked(repo.countActiveTokens).mockResolvedValue(2)
    await expect(svc.createOwnToken("u1", { name: "CI", expiresInDays: 30 }, NOW)).rejects.toMatchObject({ status: 409 })
    expect(repo.insertToken).not.toHaveBeenCalled()
  })

  it("404s for a missing or inactive user", async () => {
    vi.mocked(repo.findUserTokenVersion).mockResolvedValue({ tokenVersion: 0, isActive: false })
    await expect(svc.createOwnToken("u1", { name: "CI", expiresInDays: 30 }, NOW)).rejects.toMatchObject({ status: 404 })
  })
})

describe("listing", () => {
  it("returns the own tokens with the config", async () => {
    vi.mocked(repo.findUserTokens).mockResolvedValue([row()] as never)
    const out = await svc.getOwnTokens("u1", NOW)
    expect(repo.findUserTokens).toHaveBeenCalledWith(DEFAULT_DB, "u1")
    expect(out.tokens).toHaveLength(1)
    expect(out.config).toEqual({ enabled: true, maxPerUser: 5, allowNoExpiry: false, expiryDays: [30, 90, 365] })
  })

  it("admin list carries the owner", async () => {
    vi.mocked(repo.findAllTokens).mockResolvedValue([row({ user: { id: "u2", name: "Bob", email: "b@x", isActive: true } })] as never)
    const out = await svc.listAllTokens(NOW)
    expect(out.tokens[0].user).toEqual({ id: "u2", name: "Bob", email: "b@x", isActive: true })
    expect(out.enabled).toBe(true)
  })
})

describe("revoke", () => {
  it("revokes the caller's own token and logs it", async () => {
    vi.mocked(repo.findLiveToken).mockResolvedValue({ id: "t1", userId: "u1", prefix: "kfl_ABCDEFGH" })
    vi.mocked(repo.revokeToken).mockResolvedValue({ count: 1 })
    await svc.revokeOwnToken("u1", "t1", NOW)
    expect(repo.findLiveToken).toHaveBeenCalledWith(DEFAULT_DB, "t1", "u1")
    expect(repo.revokeToken).toHaveBeenCalledWith(DEFAULT_DB, "t1", NOW)
    expect(log.info).toHaveBeenCalledWith("api token revoked", { userId: "u1", patId: "t1", patPrefix: "kfl_ABCDEFGH", by: "u1" })
  })

  it("404s for another user's (or an already revoked) token", async () => {
    vi.mocked(repo.findLiveToken).mockResolvedValue(null)
    await expect(svc.revokeOwnToken("u1", "t9", NOW)).rejects.toMatchObject({ status: 404 })
    expect(repo.revokeToken).not.toHaveBeenCalled()
  })

  it("admin revokes any token", async () => {
    vi.mocked(repo.findLiveToken).mockResolvedValue({ id: "t1", userId: "u2", prefix: "kfl_X" })
    vi.mocked(repo.revokeToken).mockResolvedValue({ count: 1 })
    await svc.revokeTokenAsAdmin("admin", "t1", NOW)
    expect(repo.findLiveToken).toHaveBeenCalledWith(DEFAULT_DB, "t1", undefined)
    expect(log.info).toHaveBeenCalledWith("api token revoked", expect.objectContaining({ userId: "u2", by: "admin" }))
  })

  it("revokeAllUserTokens revokes in the given client and logs only when something changed", async () => {
    vi.mocked(repo.revokeUserTokens).mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 })
    expect(await svc.revokeAllUserTokens(TX as never, "u1", "deactivated", NOW)).toBe(2)
    expect(repo.revokeUserTokens).toHaveBeenCalledWith(TX, "u1", NOW)
    expect(log.info).toHaveBeenCalledWith("api tokens revoked for user", { userId: "u1", count: 2, reason: "deactivated" })
    log.info.mockClear()
    expect(await svc.revokeAllUserTokens(TX as never, "u1", "deactivated", NOW)).toBe(0)
    expect(log.info).not.toHaveBeenCalled()
  })
})
