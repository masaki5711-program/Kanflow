import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => {
  const log = { debug() {}, info() {}, warn() {}, error() {}, child: () => log }
  return { logger: log }
})
vi.mock("@/services/search/search.service", () => ({ searchEverything: vi.fn() }))

const svc = await import("@/services/search/search.service")
const route = await import("@/app/api/search/route")
const { SEARCH_RATE_LIMIT } = await import("@/services/search/search.schemas")

const get = async (qs: string): Promise<Response> => (await route.GET(new Request(`http://localhost/api/search${qs}`)))!
const json = async (res: Response) => ({ status: res.status, body: await res.json() })
let userSeq = 0
/** A fresh user per test so the process-wide rate limiter never carries over. */
function signedIn(role = "member") {
  const id = `u${++userSeq}`
  authMock.mockResolvedValue({ user: { id, name: "Alice", role } })
  return id
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockReset()
  vi.mocked(svc.searchEverything).mockResolvedValue({ query: "abc", groups: [] })
})

describe("GET /api/search", () => {
  it("401 without a session", async () => {
    authMock.mockResolvedValue(null)
    expect((await get("?q=abc")).status).toBe(401)
    expect(svc.searchEverything).not.toHaveBeenCalled()
  })

  it("searches as the session user with the normalized query and default limit", async () => {
    const id = signedIn("section_manager")
    const res = await json(await get("?q=%20%20ab%20%20c%20"))
    expect(res).toEqual({ status: 200, body: { query: "abc", groups: [] } })
    expect(svc.searchEverything).toHaveBeenCalledWith({ userId: id, systemRole: "section_manager" }, { q: "ab c", limit: 5 })
  })

  it("defaults a missing role to member and honours limit", async () => {
    const id = `u${++userSeq}`
    authMock.mockResolvedValue({ user: { id } })
    await get("?q=abc&limit=10")
    expect(svc.searchEverything).toHaveBeenCalledWith({ userId: id, systemRole: "member" }, { q: "abc", limit: 10 })
  })

  it.each([["?q=a"], ["?q=%20a%20"], [""], ["?q=abc&limit=0"], ["?q=abc&limit=11"], [`?q=${"x".repeat(101)}`]])(
    "400 VALIDATION for %s",
    async (qs) => {
      signedIn()
      const res = await json(await get(qs))
      expect(res.status).toBe(400)
      expect(res.body.code).toBe("VALIDATION")
      expect(svc.searchEverything).not.toHaveBeenCalled()
    }
  )

  it("500 with the generic message when the service fails", async () => {
    signedIn()
    vi.mocked(svc.searchEverything).mockRejectedValue(new Error("db down"))
    const res = await json(await get("?q=abc"))
    expect(res).toEqual({ status: 500, body: { error: "検索に失敗しました", code: "INTERNAL" } })
  })

  it("429 RATE_LIMITED with Retry-After once the per-user budget is spent", async () => {
    signedIn()
    for (let i = 0; i < SEARCH_RATE_LIMIT.limit; i++) await get("?q=abc")
    const res = await get("?q=abc")
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/)
    expect((await res.json()).code).toBe("RATE_LIMITED")
    expect(svc.searchEverything).toHaveBeenCalledTimes(SEARCH_RATE_LIMIT.limit)
  })
})
