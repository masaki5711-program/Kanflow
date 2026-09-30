import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * next-auth is replaced by a stub that captures the config passed to
 * NextAuth(), so the credentials `authorize` and the jwt / session
 * callbacks can be exercised directly. The real rate limiter is used.
 */
type AnyFn = (...args: never[]) => unknown
interface CapturedConfig {
  session: { strategy: string; maxAge: number; updateAge: number }
  jwt: { maxAge: number }
  providers: Array<{ authorize: AnyFn }>
  callbacks: { jwt: AnyFn; session: AnyFn }
  pages: { signIn: string }
  logger: { error: AnyFn }
}

const captured = vi.hoisted(() => ({ config: null as unknown }))
const handlers = vi.hoisted(() => ({ GET: () => "get", POST: () => "post" }))

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    captured.config = config
    return { handlers, auth: () => null, signIn: () => null, signOut: () => null }
  },
}))
vi.mock("next-auth/providers/credentials", () => ({
  default: (opts: Record<string, unknown>) => ({ id: "credentials", ...opts }),
}))

const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))

const compare = vi.fn()
vi.mock("bcryptjs", () => ({ default: { compare: (...a: unknown[]) => compare(...a) } }))

const { clearUserAuthStateCache } = await import("@/lib/authz/session-validity")
const authModule = await import("@/lib/auth")
const nextAuthRoute = await import("@/app/api/auth/[...nextauth]/route")
const config = captured.config as CapturedConfig

type Authorize = (creds: Record<string, unknown> | undefined, req?: { headers: Headers }) => Promise<unknown>
const authorize = config.providers[0].authorize as unknown as Authorize
const jwtCb = config.callbacks.jwt as unknown as (a: {
  token: Record<string, unknown>
  user?: Record<string, unknown>
}) => Promise<Record<string, unknown> | null>
const sessionCb = config.callbacks.session as unknown as (a: {
  session: { user?: Record<string, unknown> }
  token: Record<string, unknown>
}) => Promise<{ user?: Record<string, unknown> }>

const ACTIVE_USER = {
  id: "u1",
  name: "Taro",
  email: "taro@example.com",
  role: "member",
  isActive: true,
  tokenVersion: 3,
  password: "$2a$hash",
}

function reqFrom(ip?: string) {
  const headers = new Headers()
  if (ip) headers.set("x-forwarded-for", ip)
  return { headers }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  findUnique.mockReset()
  compare.mockReset()
  clearUserAuthStateCache()
  warnSpy?.mockRestore()
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

describe("auth config", () => {
  it("uses a 2h JWT session with 10 min rolling refresh and the /login page", () => {
    expect(config.session).toEqual({ strategy: "jwt", maxAge: 7200, updateAge: 600 })
    expect(config.jwt).toEqual({ maxAge: 7200 })
    expect(config.pages.signIn).toBe("/login")
  })

  it("installs the quiet auth logger so wrong passwords do not dump stacks (C3-02)", async () => {
    const { authLogger } = await import("@/lib/auth-logger")
    expect(config.logger).toBe(authLogger)
  })

  it("re-exports the NextAuth handlers from the catch-all route", () => {
    expect(authModule.handlers).toBe(handlers)
    expect(nextAuthRoute.GET).toBe(handlers.GET)
    expect(nextAuthRoute.POST).toBe(handlers.POST)
  })
})

describe("credentials authorize", () => {
  it("returns the public user fields for valid credentials", async () => {
    findUnique.mockResolvedValue(ACTIVE_USER)
    compare.mockResolvedValue(true)
    const user = await authorize({ email: "taro@example.com", password: "pw" }, reqFrom("10.0.0.1"))
    expect(user).toEqual({ id: "u1", name: "Taro", email: "taro@example.com", role: "member", tokenVersion: 3 })
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "taro@example.com" } })
    expect(compare).toHaveBeenCalledWith("pw", "$2a$hash")
  })

  it.each([
    ["no credentials", undefined],
    ["missing email", { password: "pw" }],
    ["missing password", { email: "a@b.c" }],
    ["empty password", { email: "a@b.c", password: "" }],
  ])("returns null for %s without touching the DB", async (_l, creds) => {
    expect(await authorize(creds as Record<string, unknown> | undefined)).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("returns null for an unknown user", async () => {
    findUnique.mockResolvedValue(null)
    expect(await authorize({ email: "x@example.com", password: "pw" })).toBeNull()
    expect(compare).not.toHaveBeenCalled()
  })

  it("returns null for a deactivated user without checking the password", async () => {
    findUnique.mockResolvedValue({ ...ACTIVE_USER, isActive: false })
    expect(await authorize({ email: "taro@example.com", password: "pw" })).toBeNull()
    expect(compare).not.toHaveBeenCalled()
  })

  it("returns null for a wrong password", async () => {
    findUnique.mockResolvedValue(ACTIVE_USER)
    compare.mockResolvedValue(false)
    expect(await authorize({ email: "taro@example.com", password: "bad" })).toBeNull()
  })
})

describe("login rate limiting", () => {
  const LIMIT_PER_USER = 10

  async function failTimes(n: number, email: string, ip?: string) {
    findUnique.mockResolvedValue(ACTIVE_USER)
    compare.mockResolvedValue(false)
    for (let i = 0; i < n; i++) await authorize({ email, password: "bad" }, reqFrom(ip))
  }

  it("blocks a username after 10 failures even with the correct password, without DB lookup", async () => {
    await failTimes(LIMIT_PER_USER, "taro@example.com", "10.0.0.1")
    findUnique.mockClear()
    compare.mockResolvedValue(true)

    const res = await authorize({ email: "taro@example.com", password: "correct" }, reqFrom("10.0.0.2"))
    expect(res).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("login rate limit exceeded"))
  })

  it("normalizes the username key (case / whitespace) so variants share one budget", async () => {
    await failTimes(LIMIT_PER_USER, "Taro@Example.com ")
    findUnique.mockClear()
    expect(await authorize({ email: "taro@example.com", password: "pw" })).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("does not block at 9 failures", async () => {
    await failTimes(LIMIT_PER_USER - 1, "taro@example.com")
    compare.mockResolvedValue(true)
    expect(await authorize({ email: "taro@example.com", password: "pw" })).not.toBeNull()
  })

  it("a successful login resets the per-user counter", async () => {
    await failTimes(LIMIT_PER_USER - 1, "taro@example.com")
    compare.mockResolvedValue(true)
    expect(await authorize({ email: "taro@example.com", password: "pw" })).not.toBeNull()
    await failTimes(LIMIT_PER_USER - 1, "taro@example.com")
    compare.mockResolvedValue(true)
    expect(await authorize({ email: "taro@example.com", password: "pw" })).not.toBeNull()
  })

  it("blocks an IP after 50 failures across different usernames", async () => {
    findUnique.mockResolvedValue(null)
    for (let i = 0; i < 50; i++) await authorize({ email: `u${i}@example.com`, password: "x" }, reqFrom("203.0.113.9"))
    findUnique.mockClear()
    findUnique.mockResolvedValue(ACTIVE_USER)
    compare.mockResolvedValue(true)

    expect(await authorize({ email: "taro@example.com", password: "pw" }, reqFrom("203.0.113.9"))).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
    // Same user from another IP is still allowed.
    expect(await authorize({ email: "taro@example.com", password: "pw" }, reqFrom("198.51.100.1"))).not.toBeNull()
  })

  it("works without request headers (ip unknown)", async () => {
    findUnique.mockResolvedValue(ACTIVE_USER)
    compare.mockResolvedValue(true)
    expect(await authorize({ email: "taro@example.com", password: "pw" })).not.toBeNull()
  })
})

describe("jwt callback", () => {
  const STATE_QUERY = { where: { id: "u1" }, select: { isActive: true, role: true, tokenVersion: true } }

  it("copies id, role and tokenVersion from the signed-in user", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "admin", tokenVersion: 4 })
    const token = await jwtCb({ token: {}, user: { id: "u1", role: "admin", tokenVersion: 4 } })
    expect(token).toMatchObject({ id: "u1", role: "admin", tokenVersion: 4 })
  })

  it("defaults tokenVersion to 0 when the signed-in user has none", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
    const token = await jwtCb({ token: {}, user: { id: "u1", role: "member" } })
    expect(token).toMatchObject({ tokenVersion: 0 })
  })

  it("re-validates an existing token against the DB and takes the DB role", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 1 })
    const token = await jwtCb({ token: { id: "u1", role: "admin", tokenVersion: 1 } })
    expect(token).toEqual({ id: "u1", role: "section_manager", tokenVersion: 1 })
    expect(findUnique).toHaveBeenCalledWith(STATE_QUERY)
  })

  it("fills a missing role from the DB", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 0 })
    expect((await jwtCb({ token: { id: "u1" } }))?.role).toBe("section_manager")
  })

  it("keeps pre-tokenVersion sessions valid while the DB version is 0", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
    expect(await jwtCb({ token: { id: "u1", role: "member" } })).toEqual({ id: "u1", role: "member" })
  })

  it.each([
    ["the user was deleted", null],
    ["the user was deactivated", { isActive: false, role: "member", tokenVersion: 0 }],
    ["the tokenVersion was bumped", { isActive: true, role: "member", tokenVersion: 1 }],
  ])("returns null (ends the session) when %s", async (_l, row) => {
    findUnique.mockResolvedValue(row)
    expect(await jwtCb({ token: { id: "u1", role: "member", tokenVersion: 0 } })).toBeNull()
  })

  it("caches the DB state so repeated calls do not query again", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
    await jwtCb({ token: { id: "u1", role: "member" } })
    await jwtCb({ token: { id: "u1", role: "member" } })
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it("keeps the token (fail open) and warns when the DB is unreachable", async () => {
    findUnique.mockRejectedValue(new Error("db down"))
    expect(await jwtCb({ token: { id: "u1", role: "admin" } })).toEqual({ id: "u1", role: "admin" })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("session re-validation skipped"))
  })

  it("defaults a missing role to member when the DB is unreachable", async () => {
    findUnique.mockRejectedValue(new Error("db down"))
    expect((await jwtCb({ token: { id: "u1" } }))?.role).toBe("member")
  })

  it("does nothing for an anonymous token", async () => {
    expect(await jwtCb({ token: {} })).toEqual({})
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe("session callback", () => {
  it("exposes id and role on session.user", async () => {
    const s = await sessionCb({ session: { user: { name: "T" } }, token: { id: "u1", role: "admin" } })
    expect(s.user).toEqual({ name: "T", id: "u1", role: "admin" })
  })

  it("defaults role to member", async () => {
    const s = await sessionCb({ session: { user: {} }, token: { id: "u1" } })
    expect(s.user?.role).toBe("member")
  })

  it("leaves the session alone without a token id or user", async () => {
    expect(await sessionCb({ session: { user: { name: "T" } }, token: {} })).toEqual({ user: { name: "T" } })
    expect(await sessionCb({ session: {}, token: { id: "u1" } })).toEqual({})
  })
})
