import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
vi.mock("@/services/api-tokens/api-tokens.service", () => ({
  getOwnTokens: vi.fn(),
  createOwnToken: vi.fn(),
  revokeOwnToken: vi.fn(),
  listAllTokens: vi.fn(),
  revokeTokenAsAdmin: vi.fn(),
}))

const svc = await import("@/services/api-tokens/api-tokens.service")
const userRoute = await import("@/app/api/user/api-tokens/route")
const userItemRoute = await import("@/app/api/user/api-tokens/[id]/route")
const adminRoute = await import("@/app/api/admin/api-tokens/route")
const adminItemRoute = await import("@/app/api/admin/api-tokens/[id]/route")

const member = { user: { id: "u1", name: "U", role: "member" } }
const admin = { user: { id: "a1", name: "A", role: "admin" } }
const idParams = (id = "t1") => ({ params: Promise.resolve({ id }) })

function post(body: unknown): Request {
  return new Request("http://localhost/api/user/api-tokens", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => vi.clearAllMocks())

describe("/api/user/api-tokens", () => {
  it("401 without a session", async () => {
    authMock.mockResolvedValue(null)
    expect((await userRoute.GET())!.status).toBe(401)
    expect((await userRoute.POST(post({})))!.status).toBe(401)
    expect((await userItemRoute.DELETE(new Request("http://x"), idParams()))!.status).toBe(401)
  })

  it("lists the caller's tokens", async () => {
    authMock.mockResolvedValue(member)
    vi.mocked(svc.getOwnTokens).mockResolvedValue({ config: {}, tokens: [] } as never)
    const res = (await userRoute.GET())!
    expect(res.status).toBe(200)
    expect(svc.getOwnTokens).toHaveBeenCalledWith({ id: "u1", role: "member" })
  })

  it("creates a token (201) after validating the body", async () => {
    authMock.mockResolvedValue(member)
    vi.mocked(svc.createOwnToken).mockResolvedValue({ id: "t1", token: "kfl_x" } as never)
    const res = (await userRoute.POST(post({ name: " CI ", expiresInDays: 90 })))!
    expect(res.status).toBe(201)
    expect(svc.createOwnToken).toHaveBeenCalledWith("u1", { name: "CI", expiresInDays: 90 })
  })

  it("400 for an unsupported expiry or empty name", async () => {
    authMock.mockResolvedValue(member)
    expect((await userRoute.POST(post({ name: "CI", expiresInDays: 7 })))!.status).toBe(400)
    expect((await userRoute.POST(post({ name: "", expiresInDays: 30 })))!.status).toBe(400)
    expect(svc.createOwnToken).not.toHaveBeenCalled()
  })

  it("passes scopes / projectIds through; an unknown scope or an empty project list is a 400", async () => {
    authMock.mockResolvedValue(member)
    vi.mocked(svc.createOwnToken).mockResolvedValue({ id: "t1", token: "kfl_x" } as never)
    const body = { name: "MCP", expiresInDays: 30, scopes: ["task:write"], projectIds: ["p1"] }
    expect((await userRoute.POST(post(body)))!.status).toBe(201)
    expect(svc.createOwnToken).toHaveBeenCalledWith("u1", body)
    vi.mocked(svc.createOwnToken).mockClear()
    expect((await userRoute.POST(post({ ...body, scopes: ["admin"] })))!.status).toBe(400)
    expect((await userRoute.POST(post({ ...body, projectIds: [] })))!.status).toBe(400)
    expect(svc.createOwnToken).not.toHaveBeenCalled()
  })

  it("409 when the per-user limit is reached", async () => {
    authMock.mockResolvedValue(member)
    vi.mocked(svc.createOwnToken).mockRejectedValue(new ConflictError("Token limit reached (5)"))
    expect((await userRoute.POST(post({ name: "CI", expiresInDays: 30 })))!.status).toBe(409)
  })

  it("revokes own tokens; another user's token is 404", async () => {
    authMock.mockResolvedValue(member)
    expect((await userItemRoute.DELETE(new Request("http://x"), idParams("t1")))!.status).toBe(200)
    expect(svc.revokeOwnToken).toHaveBeenCalledWith("u1", "t1")
    vi.mocked(svc.revokeOwnToken).mockRejectedValue(new NotFoundError())
    expect((await userItemRoute.DELETE(new Request("http://x"), idParams("t9")))!.status).toBe(404)
  })
})

describe("/api/admin/api-tokens", () => {
  it("403 for non-admins, 401 without a session", async () => {
    authMock.mockResolvedValue(member)
    expect((await adminRoute.GET())!.status).toBe(403)
    expect((await adminItemRoute.DELETE(new Request("http://x"), idParams()))!.status).toBe(403)
    authMock.mockResolvedValue(null)
    expect((await adminRoute.GET())!.status).toBe(401)
    expect(svc.listAllTokens).not.toHaveBeenCalled()
    expect(svc.revokeTokenAsAdmin).not.toHaveBeenCalled()
  })

  it("admins list and revoke any token", async () => {
    authMock.mockResolvedValue(admin)
    vi.mocked(svc.listAllTokens).mockResolvedValue({ enabled: true, tokens: [] })
    expect((await adminRoute.GET())!.status).toBe(200)
    expect((await adminItemRoute.DELETE(new Request("http://x"), idParams("t1")))!.status).toBe(200)
    expect(svc.revokeTokenAsAdmin).toHaveBeenCalledWith("a1", "t1")
  })
})
