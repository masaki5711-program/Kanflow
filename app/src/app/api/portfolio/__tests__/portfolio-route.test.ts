import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => {
  const log = { debug() {}, info() {}, warn() {}, error() {}, child: () => log }
  return { logger: log }
})
vi.mock("@/services/portfolio/portfolio.service", () => ({ getPortfolio: vi.fn() }))

const svc = await import("@/services/portfolio/portfolio.service")
const route = await import("@/app/api/portfolio/route")
const { ForbiddenError } = await import("@/services/_shared/errors")
const { PORTFOLIO_RATE_LIMIT } = await import("@/services/portfolio/portfolio.schemas")

const get = async (qs = ""): Promise<Response> => (await route.GET(new Request(`http://localhost/api/portfolio${qs}`)))!
const json = async (res: Response) => ({ status: res.status, body: await res.json() })
let seq = 0
function signedIn(role: string) {
  const id = `u${++seq}`
  authMock.mockResolvedValue({ user: { id, name: "A", role } })
  return id
}

const row = (id: string, over: Record<string, unknown> = {}) => ({ id, status: "active", sections: [], needsAttention: false, ...over })
const DTO = {
  asOf: "2026-10-06T00:00:00.000Z",
  scope: "all",
  capped: false,
  sections: [{ id: "s1", name: "S1" }],
  rows: [row("a", { sections: [{ id: "s1", name: "S1" }] }), row("b", { status: "archived", needsAttention: true })],
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockReset()
  vi.mocked(svc.getPortfolio).mockResolvedValue(DTO as never)
})

describe("GET /api/portfolio", () => {
  it("401 without a session", async () => {
    authMock.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(svc.getPortfolio).not.toHaveBeenCalled()
  })

  it("passes the session user as viewer and returns the portfolio", async () => {
    const id = signedIn("section_manager")
    expect(await json(await get())).toEqual({ status: 200, body: DTO })
    expect(svc.getPortfolio).toHaveBeenCalledWith({ userId: id, systemRole: "section_manager" })
  })

  it("403 for other roles (the service decides)", async () => {
    signedIn("member")
    vi.mocked(svc.getPortfolio).mockRejectedValue(new ForbiddenError("no", {}, "FORBIDDEN"))
    expect(await json(await get())).toMatchObject({ status: 403, body: { code: "FORBIDDEN" } })
  })

  it("applies ?section= / ?status= / ?attention=1 and rejects unknown statuses", async () => {
    signedIn("admin")
    expect((await json(await get("?section=s1"))).body.rows.map((r: { id: string }) => r.id)).toEqual(["a"])
    expect((await json(await get("?attention=1"))).body.rows.map((r: { id: string }) => r.id)).toEqual(["b"])
    expect((await json(await get("?status=archived"))).body.rows.map((r: { id: string }) => r.id)).toEqual(["b"])
    expect((await get("?status=weird")).status).toBe(400)
  })

  it("rate limits per user", async () => {
    signedIn("admin")
    for (let i = 0; i < PORTFOLIO_RATE_LIMIT.limit; i++) await get()
    const res = await get()
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
  })
})
