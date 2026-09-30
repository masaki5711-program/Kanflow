import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/backlog/backlog.bulk", () => ({ bulkBacklog: vi.fn() }))

const { bulkBacklog } = await import("@/services/backlog/backlog.bulk")
const route = await import("@/app/api/projects/[projectId]/backlog/bulk/route")
const { NotFoundError } = await import("@/services/_shared")

const ok = { action: "status", affectedIds: ["a"], skippedIds: [] }

beforeEach(() => {
  vi.mocked(bulkBacklog).mockReset().mockResolvedValue(ok as never)
})

describe("POST /backlog/bulk", () => {
  it("changes status as SM and passes the parsed input and actor", async () => {
    asRole("sm")
    const body = { action: "status", ids: ["a", "b"], payload: { status: "ready" } }
    expect(await read(await route.POST(req("POST", body), ctx()))).toEqual({ status: 200, body: ok })
    expect(bulkBacklog).toHaveBeenCalledWith(PROJECT_ID, body, ACTOR)
  })

  it("assigns a PO as PO", async () => {
    asRole("po")
    const res = await route.POST(req("POST", { action: "assignPo", ids: ["a"], payload: { assignedPo: "Hanako" } }), ctx())
    expect(res.status).toBe(200)
  })

  it("401 when signed out, before reading the body", async () => {
    signedOut()
    expect((await route.POST(req("POST", "{"), ctx())).status).toBe(401)
    expect(bulkBacklog).not.toHaveBeenCalled()
  })

  it("404 for non-members, 403 for developers", async () => {
    asRole(null)
    expect((await route.POST(req("POST", { action: "status", ids: ["a"], payload: { status: "ready" } }), ctx())).status).toBe(404)
    asRole("dev")
    expect((await route.POST(req("POST", { action: "status", ids: ["a"], payload: { status: "ready" } }), ctx())).status).toBe(403)
    expect(bulkBacklog).not.toHaveBeenCalled()
  })

  it("trash needs backlog.delete: SM is refused (403), PO and admins pass", async () => {
    const body = { action: "trash", ids: ["a"] }
    asRole("sm")
    expect((await route.POST(req("POST", body), ctx())).status).toBe(403)
    expect(bulkBacklog).not.toHaveBeenCalled()
    asRole("po")
    expect((await route.POST(req("POST", body), ctx())).status).toBe(200)
    asRole(null, "admin")
    expect((await route.POST(req("POST", body), ctx())).status).toBe(200)
  })

  it("addToSprint is allowed for SM (sprint.manage)", async () => {
    asRole("sm")
    const res = await route.POST(req("POST", { action: "addToSprint", ids: ["a"], payload: { sprintId: "s1" } }), ctx())
    expect(res.status).toBe(200)
  })

  it.each([
    ["an unknown action", { action: "explode", ids: ["a"] }],
    ["no ids", { action: "trash", ids: [] }],
    ["more than 200 ids", { action: "trash", ids: Array.from({ length: 201 }, (_, i) => `id${i}`) }],
    ["a bad status", { action: "status", ids: ["a"], payload: { status: "done" } }],
    ["a missing sprint", { action: "addToSprint", ids: ["a"], payload: {} }],
    ["malformed JSON", "{"],
  ])("400 for %s", async (_label, body) => {
    asRole("po")
    expect((await route.POST(req("POST", body), ctx())).status).toBe(400)
    expect(bulkBacklog).not.toHaveBeenCalled()
  })

  it("maps service errors (e.g. unknown sprint → 404) and unexpected failures (500)", async () => {
    asRole("po")
    vi.mocked(bulkBacklog).mockRejectedValueOnce(new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND"))
    const notFound = await read(await route.POST(req("POST", { action: "addToSprint", ids: ["a"], payload: { sprintId: "zz" } }), ctx()))
    expect(notFound).toMatchObject({ status: 404, body: { code: "SPRINT_NOT_FOUND" } })
    vi.mocked(bulkBacklog).mockRejectedValueOnce(new Error("db"))
    expect((await route.POST(req("POST", { action: "trash", ids: ["a"] }), ctx())).status).toBe(500)
  })
})
