import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConflictError, ForbiddenError, NotFoundError } from "@/services/_shared/errors"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const users = {
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  resetPassword: vi.fn(),
}
vi.mock("@/services/users/users.service", () => users)

const account = { searchUsers: vi.fn() }
vi.mock("@/services/users/account.service", () => account)

/**
 * Type-only: requireAuth/requireAdmin gates make tsc infer
 * `Promise<Response | undefined>` for handlers; at runtime they always return.
 */
type Defined<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => Promise<infer R> ? (...a: A) => Promise<NonNullable<R>> : T[K]
}
function defined<T>(mod: T): Defined<T> {
  return mod as Defined<T>
}

const usersRoute = defined(await import("@/app/api/users/route"))
const userRoute = defined(await import("@/app/api/users/[id]/route"))
const resetRoute = defined(await import("@/app/api/users/[id]/reset-password/route"))
const searchRoute = defined(await import("@/app/api/users/search/route"))

const BASE = "http://localhost/api/users"
const idParams = (id = "u9") => ({ params: Promise.resolve({ id }) })

function session(role = "admin", id = "admin-1") {
  return { user: { id, name: "A", email: "a@example.com", role } }
}
function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

const validUser = { name: "New", email: "new@example.com", password: "secret12", role: "member" }

const ADMIN_ENDPOINTS: Array<[string, () => Promise<Response>]> = [
  ["GET /users", () => usersRoute.GET()],
  ["POST /users", () => usersRoute.POST(jsonReq(BASE, "POST", validUser))],
  ["PATCH /users/[id]", () => userRoute.PATCH(jsonReq(`${BASE}/u9`, "PATCH", { name: "x" }), idParams())],
  [
    "POST /users/[id]/reset-password",
    () => resetRoute.POST(jsonReq(`${BASE}/u9/reset-password`, "POST", { password: "abcdefgh" }), idParams()),
  ],
]

const ALL_MOCKS = [...Object.values(users), ...Object.values(account)]

beforeEach(() => {
  authMock.mockReset().mockResolvedValue(session())
  for (const m of ALL_MOCKS) m.mockReset()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
})

describe("users admin routes — access control", () => {
  it.each(ADMIN_ENDPOINTS)("%s returns 401 without a session", async (_n, invoke) => {
    authMock.mockResolvedValue(null)
    expect((await invoke()).status).toBe(401)
    for (const m of ALL_MOCKS) expect(m).not.toHaveBeenCalled()
  })

  it.each(ADMIN_ENDPOINTS)("%s returns 403 for a member", async (_n, invoke) => {
    authMock.mockResolvedValue(session("member", "user-1"))
    expect((await invoke()).status).toBe(403)
    for (const m of ALL_MOCKS) expect(m).not.toHaveBeenCalled()
  })

  it.each(ADMIN_ENDPOINTS)("%s returns 403 for a section manager", async (_n, invoke) => {
    authMock.mockResolvedValue(session("section_manager", "sm-1"))
    expect((await invoke()).status).toBe(403)
  })
})

describe("GET/POST /api/users", () => {
  it("lists users", async () => {
    users.listUsers.mockResolvedValue([{ id: "u1" }])
    const res = await usersRoute.GET()
    expect(await res.json()).toEqual([{ id: "u1" }])
  })

  it("maps list failures to 500", async () => {
    users.listUsers.mockRejectedValue(new Error("x"))
    expect((await usersRoute.GET()).status).toBe(500)
  })

  it("creates a user with 201", async () => {
    users.createUser.mockResolvedValue({ id: "u2" })
    const res = await usersRoute.POST(jsonReq(BASE, "POST", { ...validUser, sectionIds: ["s1"] }))
    expect(res.status).toBe(201)
    expect(users.createUser).toHaveBeenCalledWith({ ...validUser, sectionIds: ["s1"] })
  })

  it.each([
    ["invalid email", { ...validUser, email: "nope" }],
    ["short password", { ...validUser, password: "1234567" }],
    ["unknown role", { ...validUser, role: "root" }],
    ["missing name", { ...validUser, name: "" }],
    ["malformed JSON", "{"],
  ])("rejects %s with 400", async (_l, body) => {
    const res = await usersRoute.POST(jsonReq(BASE, "POST", body))
    expect(res.status).toBe(400)
    expect(users.createUser).not.toHaveBeenCalled()
  })

  it("maps a duplicate email conflict to 409", async () => {
    users.createUser.mockRejectedValue(new ConflictError("このメールアドレスは既に使用されています"))
    const res = await usersRoute.POST(jsonReq(BASE, "POST", validUser))
    expect(res.status).toBe(409)
  })
})

describe("PATCH /api/users/[id]", () => {
  it("updates with the acting admin id", async () => {
    users.updateUser.mockResolvedValue({ id: "u9", isActive: false })
    const res = await userRoute.PATCH(jsonReq(`${BASE}/u9`, "PATCH", { isActive: false }), idParams("u9"))
    expect(res.status).toBe(200)
    expect(users.updateUser).toHaveBeenCalledWith("admin-1", "u9", { isActive: false })
  })

  it("rejects invalid input", async () => {
    const res = await userRoute.PATCH(jsonReq(`${BASE}/u9`, "PATCH", { role: "owner" }), idParams())
    expect(res.status).toBe(400)
    const malformed = await userRoute.PATCH(jsonReq(`${BASE}/u9`, "PATCH", "{"), idParams())
    expect(malformed.status).toBe(400)
  })

  it("maps service refusals (e.g. self-demotion) to 403 and missing users to 404", async () => {
    users.updateUser.mockRejectedValueOnce(new ForbiddenError("自分自身は変更できません"))
    expect((await userRoute.PATCH(jsonReq(`${BASE}/u9`, "PATCH", { role: "member" }), idParams())).status).toBe(403)
    users.updateUser.mockRejectedValueOnce(new NotFoundError())
    expect((await userRoute.PATCH(jsonReq(`${BASE}/u9`, "PATCH", {}), idParams())).status).toBe(404)
    users.updateUser.mockRejectedValueOnce(new Error("x"))
    expect((await userRoute.PATCH(jsonReq(`${BASE}/u9`, "PATCH", {}), idParams())).status).toBe(500)
  })
})

describe("POST /api/users/[id]/reset-password (rate limited)", () => {
  const post = (body: unknown = { password: "newpass1" }, id = "u9") =>
    resetRoute.POST(jsonReq(`${BASE}/${id}/reset-password`, "POST", body), idParams(id))

  it("resets the target user's password", async () => {
    users.resetPassword.mockResolvedValue(undefined)
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(users.resetPassword).toHaveBeenCalledWith("u9", "newpass1")
  })

  it.each([["short", { password: "1234567" }], ["missing", {}], ["malformed", "{"]])(
    "rejects a %s password with 400",
    async (_l, body) => {
      expect((await post(body)).status).toBe(400)
      expect(users.resetPassword).not.toHaveBeenCalled()
    }
  )

  it("maps NotFound to 404 and failures to 500", async () => {
    users.resetPassword.mockRejectedValueOnce(new NotFoundError())
    expect((await post()).status).toBe(404)
    users.resetPassword.mockRejectedValueOnce(new Error("x"))
    expect((await post()).status).toBe(500)
  })

  it("returns 429 with Retry-After once an admin exceeds 20 resets in the window", async () => {
    users.resetPassword.mockResolvedValue(undefined)
    for (let i = 0; i < 20; i++) expect((await post({ password: "newpass1" }, `u${i}`)).status).toBe(200)

    const limited = await post()
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(users.resetPassword).toHaveBeenCalledTimes(20)
  })

  it("counts invalid attempts too (hit happens before validation)", async () => {
    for (let i = 0; i < 20; i++) await post({ password: "x" })
    expect((await post()).status).toBe(429)
  })

  it("limits per admin: a different admin is not blocked", async () => {
    users.resetPassword.mockResolvedValue(undefined)
    for (let i = 0; i < 20; i++) await post()
    expect((await post()).status).toBe(429)
    authMock.mockResolvedValue(session("admin", "admin-2"))
    expect((await post()).status).toBe(200)
  })
})

describe("GET /api/users/search", () => {
  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null)
    const res = await searchRoute.GET(new Request(`${BASE}/search?q=a`))
    expect(res.status).toBe(401)
    expect(account.searchUsers).not.toHaveBeenCalled()
  })

  it("is available to any authenticated user; trims q and forwards excludeProjectId", async () => {
    authMock.mockResolvedValue(session("member", "user-1"))
    account.searchUsers.mockResolvedValue([{ id: "u1" }])
    const res = await searchRoute.GET(new Request(`${BASE}/search?q=%20tanaka%20&excludeProjectId=p1`))
    expect(await res.json()).toEqual([{ id: "u1" }])
    expect(account.searchUsers).toHaveBeenCalledWith("tanaka", "p1")
  })

  it("defaults to an empty query and no exclusion", async () => {
    account.searchUsers.mockResolvedValue([])
    await searchRoute.GET(new Request(`${BASE}/search`))
    expect(account.searchUsers).toHaveBeenCalledWith("", undefined)
  })

  it("maps failures to 500", async () => {
    account.searchUsers.mockRejectedValue(new Error("x"))
    expect((await searchRoute.GET(new Request(`${BASE}/search?q=a`))).status).toBe(500)
  })
})
