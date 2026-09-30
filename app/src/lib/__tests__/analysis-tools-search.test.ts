import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  pbiFindMany: vi.fn(),
  iceFindMany: vi.fn(),
  sbiFindMany: vi.fn(),
  pbiIds: vi.fn(),
  iceIds: vi.fn(),
  taskIds: vi.fn(),
  translations: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    productBacklogItem: { findMany: m.pbiFindMany },
    iceboxItem: { findMany: m.iceFindMany },
    sprintBacklogItem: { findMany: m.sbiFindMany },
  },
}))
vi.mock("@/services/search/search.fulltext", () => ({
  fulltextPbiIds: m.pbiIds,
  fulltextIceboxIds: m.iceIds,
  fulltextTaskIds: m.taskIds,
  findTranslationFulltext: m.translations,
}))
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }) } }))

const { searchWorkItems, WORK_ITEM_SEARCH_LIMIT } = await import("@/lib/analysis-tools-search")
const { resetFulltextFallback } = await import("@/lib/fulltext/fallback")
const { prisma } = await import("@/lib/prisma")

const TASK = (id: string, name: string) => ({
  id,
  taskName: name,
  status: "todo",
  assignee: "",
  assignees: [],
  sprint: { sprintName: "S1", status: "active" },
  pbItem: { displayId: 1 },
})

beforeEach(() => {
  vi.clearAllMocks()
  resetFulltextFallback()
  for (const f of [m.pbiFindMany, m.iceFindMany, m.sbiFindMany, m.pbiIds, m.iceIds, m.taskIds, m.translations]) f.mockResolvedValue([])
})
afterEach(() => vi.unstubAllEnvs())

describe("searchWorkItems (FULLTEXT)", () => {
  it("looks up candidates of this project only, with the boolean query", async () => {
    m.pbiIds.mockResolvedValue([{ id: "b1", score: 1 }])
    m.pbiFindMany.mockResolvedValue([{ id: "b1", displayId: 1, initiative: "Login", userStory: null, status: "ready", workloadScore: 2 }])
    await searchWorkItems("p1", "login form")
    for (const f of [m.pbiIds, m.iceIds, m.taskIds]) {
      expect(f).toHaveBeenCalledWith(prisma, ["p1"], "+login* +form*", WORK_ITEM_SEARCH_LIMIT)
    }
    expect(m.translations).toHaveBeenCalledWith(prisma, "+login* +form*", ["pbi", "icebox", "task"])
  })

  it("reloads candidates with the project / soft-delete filters and keeps relevance order", async () => {
    m.pbiIds.mockResolvedValue([{ id: "b1", score: 1 }])
    m.translations.mockResolvedValue([
      { entityType: "backlog_item", entityId: "b2", score: 4 },
      { entityType: "sprint_task", entityId: "t1", score: 1 },
    ])
    m.pbiFindMany.mockResolvedValue([
      { id: "b1", displayId: 1, initiative: "one", userStory: null, status: "ready", workloadScore: 1 },
      { id: "b2", displayId: 2, initiative: "two", userStory: null, status: "ready", workloadScore: 3 },
    ])
    m.sbiFindMany.mockResolvedValue([TASK("t1", "Login API")])

    const results = await searchWorkItems("p1", "login")

    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null, id: { in: ["b2", "b1"] } })
    expect(m.sbiFindMany.mock.calls[0][0].where).toEqual({ sprint: { projectId: "p1" }, pbItem: { deletedAt: null }, id: { in: ["t1"] } })
    expect(m.iceFindMany).not.toHaveBeenCalled() // no icebox candidate
    expect(results.map((r) => r.type)).toEqual(["pbi", "pbi", "task"])
    expect(results[0]).toEqual({ type: "pbi", id: "#2", status: "ready", sp: 3, title: "two" })
  })

  it("falls back to LIKE when FULLTEXT finds nothing", async () => {
    await searchWorkItems("p1", "login")
    expect(m.pbiFindMany.mock.calls[0][0].where.OR).toEqual([
      { initiative: { contains: "login" } },
      { epic: { contains: "login" } },
      { userStory: { contains: "login" } },
    ])
  })

  it("falls back to LIKE when the FULLTEXT index is missing", async () => {
    m.pbiIds.mockRejectedValue(Object.assign(new Error("x"), { meta: { driverAdapterError: { cause: { code: 1191 } } } }))
    await searchWorkItems("p1", "login")
    expect(m.sbiFindMany.mock.calls[0][0].where.taskName).toEqual({ contains: "login" })
  })
})

describe("searchWorkItems (LIKE)", () => {
  it("is used for 1-character keywords and when SEARCH_FULLTEXT=off", async () => {
    await searchWorkItems("p1", "x")
    vi.stubEnv("SEARCH_FULLTEXT", "off")
    await searchWorkItems("p1", "login")
    expect(m.pbiIds).not.toHaveBeenCalled()
    expect(m.iceFindMany.mock.calls[1][0].where).toEqual({
      projectId: "p1",
      deletedAt: null,
      OR: [{ request: { contains: "login" } }, { background: { contains: "login" } }],
    })
  })

  it("caps the merged list", async () => {
    m.pbiFindMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({ id: `b${i}`, displayId: i, initiative: "i", userStory: null, status: "ready", workloadScore: 1 }))
    )
    m.iceFindMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, displayId: i, request: "r", status: "open", author: "a" })))
    expect(await searchWorkItems("p1", "x")).toHaveLength(WORK_ITEM_SEARCH_LIMIT)
  })
})
