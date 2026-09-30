import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, USER, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/sprints/sprints.service", () => ({ getBurndown: vi.fn() }))
vi.mock("@/services/projects/projects.service", () => ({ favoriteProject: vi.fn(), unfavoriteProject: vi.fn() }))
vi.mock("@/services/sprints/velocity", () => ({ getVelocity: vi.fn() }))

const sprints = await import("@/services/sprints/sprints.service")
const projects = await import("@/services/projects/projects.service")
const burndown = await import("@/app/api/projects/[projectId]/burndown/route")
const favorite = await import("@/app/api/projects/[projectId]/favorite/route")
const velocitySvc = await import("@/services/sprints/velocity")
const velocity = await import("@/app/api/projects/[projectId]/velocity/route")

beforeEach(() => {
  vi.mocked(sprints.getBurndown).mockReset()
  vi.mocked(velocitySvc.getVelocity).mockReset()
  vi.mocked(projects.favoriteProject).mockReset()
  vi.mocked(projects.unfavoriteProject).mockReset()
})

describe("GET /burndown", () => {
  it("returns burndown data for a member", async () => {
    asRole("dev")
    vi.mocked(sprints.getBurndown).mockResolvedValue({ points: [] } as never)
    expect(await read(await burndown.GET(req("GET"), ctx()))).toEqual({ status: 200, body: { points: [] } })
    expect(sprints.getBurndown).toHaveBeenCalledWith(PROJECT_ID, undefined)
  })

  it("passes ?sprintId= through to the per-sprint burndown", async () => {
    asRole("dev")
    vi.mocked(sprints.getBurndown).mockResolvedValue({ points: [] } as never)
    const request = new Request(`http://localhost/api/projects/${PROJECT_ID}/burndown?sprintId=s-9`)
    expect((await burndown.GET(request, ctx())).status).toBe(200)
    expect(sprints.getBurndown).toHaveBeenCalledWith(PROJECT_ID, "s-9")
  })

  it("rejects a malformed sprintId with 400", async () => {
    asRole("dev")
    const request = new Request(`http://localhost/api/projects/${PROJECT_ID}/burndown?sprintId=${"x".repeat(300)}`)
    expect((await burndown.GET(request, ctx())).status).toBe(400)
    expect(sprints.getBurndown).not.toHaveBeenCalled()
  })

  it("maps failures to 500", async () => {
    asRole("dev")
    vi.mocked(sprints.getBurndown).mockRejectedValue(new Error("x"))
    expect(await read(await burndown.GET(req("GET"), ctx()))).toEqual({
      status: 500,
      body: { error: "取得に失敗しました", code: "INTERNAL" },
    })
  })
})

describe("GET /velocity", () => {
  it("returns the velocity series for a member", async () => {
    asRole("dev")
    const data = { sprints: [], average: null, pointUnit: "SP" }
    vi.mocked(velocitySvc.getVelocity).mockResolvedValue(data)
    expect(await read(await velocity.GET(req("GET"), ctx()))).toEqual({ status: 200, body: data })
    expect(velocitySvc.getVelocity).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("denies non-members and maps failures to 500", async () => {
    asRole(null)
    expect((await velocity.GET(req("GET"), ctx())).status).toBeGreaterThanOrEqual(400)
    expect(velocitySvc.getVelocity).not.toHaveBeenCalled()
    asRole("dev")
    vi.mocked(velocitySvc.getVelocity).mockRejectedValue(new Error("x"))
    expect((await velocity.GET(req("GET"), ctx())).status).toBe(500)
  })
})

describe("POST/DELETE /favorite", () => {
  it("favorites for the session user (not a body-supplied id)", async () => {
    asRole("dev")
    vi.mocked(projects.favoriteProject).mockResolvedValue(undefined)
    expect(await read(await favorite.POST(req("POST", { userId: "someone-else" }), ctx()))).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(projects.favoriteProject).toHaveBeenCalledWith(USER.id, PROJECT_ID)
  })

  it("unfavorites for the session user", async () => {
    asRole("dev")
    vi.mocked(projects.unfavoriteProject).mockResolvedValue(undefined)
    expect((await favorite.DELETE(req("DELETE"), ctx())).status).toBe(200)
    expect(projects.unfavoriteProject).toHaveBeenCalledWith(USER.id, PROJECT_ID)
  })

  it("lets a section manager of the project favorite it", async () => {
    asRole(null, "section_manager")
    const { sectionFindFirst } = await import("./route-harness")
    sectionFindFirst.mockResolvedValue({ sectionId: "sec-1" })
    vi.mocked(projects.favoriteProject).mockResolvedValue(undefined)
    expect((await favorite.POST(req("POST"), ctx())).status).toBe(200)
  })

  it("maps failures to 500", async () => {
    asRole("dev")
    vi.mocked(projects.favoriteProject).mockRejectedValue(new Error("x"))
    vi.mocked(projects.unfavoriteProject).mockRejectedValue(new Error("x"))
    expect((await favorite.POST(req("POST"), ctx())).status).toBe(500)
    expect((await favorite.DELETE(req("DELETE"), ctx())).status).toBe(500)
  })
})
