import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, USER, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/sprints/sprints.service", () => ({ getBurndown: vi.fn() }))
vi.mock("@/services/projects/projects.service", () => ({ favoriteProject: vi.fn(), unfavoriteProject: vi.fn() }))

const sprints = await import("@/services/sprints/sprints.service")
const projects = await import("@/services/projects/projects.service")
const burndown = await import("@/app/api/projects/[projectId]/burndown/route")
const favorite = await import("@/app/api/projects/[projectId]/favorite/route")

beforeEach(() => {
  vi.mocked(sprints.getBurndown).mockReset()
  vi.mocked(projects.favoriteProject).mockReset()
  vi.mocked(projects.unfavoriteProject).mockReset()
})

describe("GET /burndown", () => {
  it("returns burndown data for a member", async () => {
    asRole("dev")
    vi.mocked(sprints.getBurndown).mockResolvedValue({ points: [] } as never)
    expect(await read(await burndown.GET(req("GET"), ctx()))).toEqual({ status: 200, body: { points: [] } })
    expect(sprints.getBurndown).toHaveBeenCalledWith(PROJECT_ID)
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
