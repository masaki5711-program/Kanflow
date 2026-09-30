import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../api-tokens.repository")
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))
const userState = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("@/lib/authz/session-validity", async (orig) => ({
  ...(await orig<typeof import("@/lib/authz/session-validity")>()),
  loadUserAuthState: userState.load,
}))

const repo = await import("../api-tokens.repository")
const { authenticateApiRequest, resetApiTokenTouchCache, AUTH_FAILURES_PER_IP_PER_MIN, AUTH_FAILURES_GLOBAL_PER_MIN } = await import("../api-token-auth")
const { generateApiToken } = await import("@/lib/api-tokens/token")

const NOW = Date.parse("2026-10-05T00:00:00Z")
const clock = () => NOW
const token = generateApiToken()

function req(auth?: string, ip = "10.0.0.1"): Request {
  const headers = new Headers({ "x-forwarded-for": ip })
  if (auth !== undefined) headers.set("authorization", auth)
  return new Request("http://localhost/api/v1/me", { headers })
}

function tokenRow(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    userId: "u1",
    prefix: token.prefix,
    scopes: '["read"]',
    userTokenVersion: 2,
    expiresAt: new Date(NOW + 86_400_000),
    revokedAt: null,
    lastUsedAt: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow() as never)
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  userState.load.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 2 })
})
afterEach(() => vi.unstubAllEnvs())

describe("authenticateApiRequest", () => {
  it("accepts a valid bearer token with the DB role", async () => {
    userState.load.mockResolvedValue({ isActive: true, role: "admin", tokenVersion: 2 })
    const out = await authenticateApiRequest(req(`Bearer ${token.token}`), clock)
    expect(out).toMatchObject({ ok: true, principal: { userId: "u1", role: "admin", tokenId: "t1", tokenPrefix: token.prefix } })
    expect(repo.findTokenByHash).toHaveBeenCalledWith(expect.anything(), token.hash)
  })

  it.each([
    ["missing header", undefined],
    ["other scheme", "Basic abc"],
    ["malformed token", "Bearer kfl_short"],
  ])("401 for %s", async (_label, header) => {
    const out = await authenticateApiRequest(req(header), clock)
    expect(out).toMatchObject({ ok: false, status: 401, code: "UNAUTHORIZED" })
    expect(repo.findTokenByHash).not.toHaveBeenCalled()
  })

  it("ignores session cookies entirely", async () => {
    const r = new Request("http://localhost/api/v1/me", { headers: { cookie: "authjs.session-token=abc" } })
    expect(await authenticateApiRequest(r, clock)).toMatchObject({ ok: false, status: 401 })
  })

  it.each([
    ["unknown", null],
    ["revoked", tokenRow({ revokedAt: new Date(NOW - 1) })],
    ["expired", tokenRow({ expiresAt: new Date(NOW - 1) })],
  ])("401 for an %s token", async (_label, row) => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(row as never)
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`), clock)).toMatchObject({ ok: false, status: 401 })
  })

  it.each([
    ["deactivated user", { isActive: false, role: "member", tokenVersion: 2 }],
    ["bumped tokenVersion", { isActive: true, role: "member", tokenVersion: 3 }],
    ["deleted user", null],
  ])("401 for a %s", async (_label, state) => {
    userState.load.mockResolvedValue(state)
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`), clock)).toMatchObject({ ok: false, status: 401 })
  })

  it("never logs the plain token", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ revokedAt: new Date(NOW - 1) }) as never)
    await authenticateApiRequest(req(`Bearer ${token.token}`), clock)
    expect(log.info).toHaveBeenCalledWith("api request rejected", expect.objectContaining({ reason: "revoked", patPrefix: token.prefix }))
    expect(JSON.stringify(log.info.mock.calls)).not.toContain(token.token)
  })

  it("403 when the token lacks the read scope", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ scopes: "[]" }) as never)
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`), clock)).toMatchObject({ ok: false, status: 403 })
  })

  it("403 when the API is disabled", async () => {
    vi.stubEnv("API_TOKENS_ENABLED", "off")
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`), clock)).toMatchObject({ ok: false, status: 403 })
  })

  it("rate limits per token with Retry-After", async () => {
    vi.stubEnv("API_V1_RATE_LIMIT_PER_MIN", "2")
    const r = () => authenticateApiRequest(req(`Bearer ${token.token}`), clock)
    expect(await r()).toMatchObject({ ok: true, rate: { remaining: 1, limit: 2 } })
    expect(await r()).toMatchObject({ ok: true, rate: { remaining: 0 } })
    const third = await r()
    expect(third).toMatchObject({ ok: false, status: 429, code: "RATE_LIMITED" })
    expect(third.ok === false && third.headers?.["Retry-After"]).toBeTruthy()
  })

  it("throttles an IP after repeated bad credentials", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(null)
    for (let i = 0; i < AUTH_FAILURES_PER_IP_PER_MIN; i++) await authenticateApiRequest(req(`Bearer ${token.token}`, "10.9.9.9"), clock)
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`, "10.9.9.9"), clock)).toMatchObject({ status: 429 })
    // Another IP is unaffected.
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`, "10.9.9.8"), clock)).toMatchObject({ status: 401 })
  })

  it("throttles everyone once the global failure budget is spent (spoofed IPs)", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(null)
    for (let i = 0; i < AUTH_FAILURES_GLOBAL_PER_MIN; i++) await authenticateApiRequest(req(`Bearer ${token.token}`, `10.1.${i >> 8}.${i & 255}`), clock)
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow() as never)
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`, "10.200.0.1"), clock)).toMatchObject({ status: 429 })
  })

  it("writes lastUsedAt at most once per minute", async () => {
    let t = NOW
    const tick = () => t
    await authenticateApiRequest(req(`Bearer ${token.token}`), tick)
    t += 30_000
    await authenticateApiRequest(req(`Bearer ${token.token}`), tick)
    expect(repo.touchLastUsed).toHaveBeenCalledTimes(1)
    t += 31_000
    await authenticateApiRequest(req(`Bearer ${token.token}`), tick)
    expect(repo.touchLastUsed).toHaveBeenCalledTimes(2)
  })

  it("skips the write when the stored lastUsedAt is recent (other process)", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ lastUsedAt: new Date(NOW - 10_000) }) as never)
    await authenticateApiRequest(req(`Bearer ${token.token}`), clock)
    expect(repo.touchLastUsed).not.toHaveBeenCalled()
  })

  it("a failed lastUsedAt write only warns", async () => {
    vi.mocked(repo.touchLastUsed).mockRejectedValue(new Error("db down"))
    expect(await authenticateApiRequest(req(`Bearer ${token.token}`), clock)).toMatchObject({ ok: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(log.warn).toHaveBeenCalledWith("lastUsedAt update failed", expect.objectContaining({ patId: "t1" }))
  })
})
