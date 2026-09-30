import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/activity/activity.service", () => ({
  listProjectActivity: vi.fn(),
  listEntityActivity: vi.fn(),
}))

const svc = await import("@/services/activity/activity.service")
const feed = await import("@/app/api/projects/[projectId]/activity/route")
const history = await import("@/app/api/projects/[projectId]/activity/[entityType]/[entityId]/route")
const { encodeCursor } = await import("@/services/_shared/cursor")

const get = (query = "") => new Request(`http://localhost/api/projects/${PROJECT_ID}/activity${query}`)
const PAGE = { items: [{ id: "a1" }], nextCursor: null }

beforeEach(() => {
  vi.mocked(svc.listProjectActivity).mockReset().mockResolvedValue(PAGE as never)
  vi.mocked(svc.listEntityActivity).mockReset().mockResolvedValue(PAGE as never)
})

describe("GET /activity", () => {
  it("returns the feed for any member with defaults applied", async () => {
    asRole("dev")
    expect(await read(await feed.GET(get(), ctx()))).toEqual({ status: 200, body: PAGE })
    expect(svc.listProjectActivity).toHaveBeenCalledWith(PROJECT_ID, { limit: 50 })
  })

  it("passes cursor, limit and entityType", async () => {
    asRole("dev")
    const cursor = encodeCursor({ createdAt: new Date("2026-10-01T00:00:00Z"), id: "x" })
    await feed.GET(get(`?cursor=${cursor}&limit=10&entityType=sprint`), ctx())
    expect(svc.listProjectActivity).toHaveBeenCalledWith(PROJECT_ID, { cursor, limit: 10, entityType: "sprint" })
  })

  it.each(["?limit=0", "?limit=101", "?entityType=bogus", "?limit=abc"])("400 for %s", async (q) => {
    asRole("dev")
    const res = await feed.GET(get(q), ctx())
    expect(res.status).toBe(400)
    expect(svc.listProjectActivity).not.toHaveBeenCalled()
  })

  it("401 signed out, 404 for non-members", async () => {
    signedOut()
    expect((await feed.GET(get(), ctx())).status).toBe(401)
    asRole(null)
    expect((await feed.GET(get(), ctx())).status).toBe(404)
  })

  it("maps a malformed cursor from the service to 400", async () => {
    asRole("dev")
    const { ValidationError } = await import("@/services/_shared/errors")
    vi.mocked(svc.listProjectActivity).mockRejectedValue(new ValidationError("Invalid cursor", {}, "VALIDATION"))
    expect((await read(await feed.GET(get("?cursor=zz"), ctx()))).status).toBe(400)
  })
})

describe("GET /activity/:entityType/:entityId", () => {
  it("returns one entity's history", async () => {
    asRole("dev")
    const res = await history.GET(get("?limit=5"), ctx({ entityType: "pbi", entityId: "b1" }))
    expect(await read(res)).toEqual({ status: 200, body: PAGE })
    expect(svc.listEntityActivity).toHaveBeenCalledWith(PROJECT_ID, { entityType: "pbi", entityId: "b1" }, { limit: 5 })
  })

  it("400 for an unknown entity type", async () => {
    asRole("dev")
    expect((await history.GET(get(), ctx({ entityType: "user", entityId: "b1" }))).status).toBe(400)
    expect(svc.listEntityActivity).not.toHaveBeenCalled()
  })

  it("500 when the service fails", async () => {
    asRole("po")
    vi.mocked(svc.listEntityActivity).mockRejectedValue(new Error("db"))
    expect((await history.GET(get(), ctx({ entityType: "sprint", entityId: "s1" }))).status).toBe(500)
  })
})
