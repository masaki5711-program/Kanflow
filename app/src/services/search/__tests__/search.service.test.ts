import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../search.repository")

const repo = await import("../search.repository")
const tr = await import("@/services/_shared/translations")
const { searchEverything } = await import("../search.service")
const { DEFAULT_DB } = await import("@/services/__tests__/support")

const P1 = { id: "p1", name: "Apollo" }
const MEMBER = { userId: "u1", systemRole: "member" }

function emptyRepo() {
  vi.mocked(repo.findTranslationMatches).mockResolvedValue([])
  vi.mocked(repo.findPbis).mockResolvedValue([])
  vi.mocked(repo.findTasks).mockResolvedValue([])
  vi.mocked(repo.findIceboxItems).mockResolvedValue([])
  vi.mocked(repo.findProjects).mockResolvedValue([])
  vi.mocked(repo.findGoals).mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
  emptyRepo()
  vi.mocked(tr.getI18nFor).mockResolvedValue(new Map())
})

describe("searchEverything", () => {
  it("escapes LIKE wildcards before querying", async () => {
    await searchEverything(MEMBER, { q: "50%_off", limit: 5 })
    expect(repo.findTranslationMatches).toHaveBeenCalledWith(DEFAULT_DB, "50\\%\\_off")
    expect(vi.mocked(repo.findPbis).mock.calls[0][2]).toMatchObject({ pattern: "50\\%\\_off", take: 5, displayId: null })
  })

  it("scopes every query to the viewer's accessible projects", async () => {
    await searchEverything(MEMBER, { q: "abc", limit: 3 })
    const scope = { deletedAt: null, members: { some: { userId: "u1" } } }
    for (const fn of [repo.findPbis, repo.findTasks, repo.findIceboxItems, repo.findProjects, repo.findGoals]) {
      expect(vi.mocked(fn).mock.calls[0][1]).toEqual(scope)
      expect(vi.mocked(fn).mock.calls[0][2]).toMatchObject({ take: 3 })
    }
  })

  it("admins search all live projects; section managers include their sections", async () => {
    await searchEverything({ userId: "a", systemRole: "admin" }, { q: "abc", limit: 3 })
    expect(vi.mocked(repo.findPbis).mock.calls[0][1]).toEqual({ deletedAt: null })
    await searchEverything({ userId: "s", systemRole: "section_manager" }, { q: "abc", limit: 3 })
    expect(vi.mocked(repo.findPbis).mock.calls[1][1]).toHaveProperty("OR")
  })

  it("passes the parsed displayId and puts the exact match first", async () => {
    vi.mocked(repo.findPbis).mockResolvedValue([
      { id: "b1", displayId: 120, initiative: "PBI-12 follow-up", userStory: null, status: "ready", project: P1 },
      { id: "b2", displayId: 12, initiative: null, userStory: "As a user", status: "ready", project: P1 },
    ])
    const out = await searchEverything(MEMBER, { q: "PBI-12", limit: 5 })
    expect(vi.mocked(repo.findPbis).mock.calls[0][2]).toMatchObject({ displayId: 12 })
    const pbis = out.groups.find((g) => g.type === "pbi")!.items
    expect(pbis.map((p) => p.id)).toEqual(["b2", "b1"])
    expect(pbis[0]).toMatchObject({ title: "As a user", titleField: "userStory", href: "/projects/p1/backlog?pbi=b2" })
    expect(pbis[1]).toMatchObject({ title: "PBI-12 follow-up", titleField: "initiative" })
  })

  it("feeds ids matched in the other language into each entity query", async () => {
    vi.mocked(repo.findTranslationMatches).mockResolvedValue([
      { entityType: "backlog_item", entityId: "b7" },
      { entityType: "sprint_task", entityId: "t7" },
      { entityType: "icebox_item", entityId: "i7" },
      { entityType: "project", entityId: "p7" },
      { entityType: "product_goal", entityId: "g7" },
    ])
    await searchEverything(MEMBER, { q: "login", limit: 5 })
    expect(vi.mocked(repo.findPbis).mock.calls[0][2].ids).toEqual(["b7"])
    expect(vi.mocked(repo.findTasks).mock.calls[0][2].ids).toEqual(["t7"])
    expect(vi.mocked(repo.findIceboxItems).mock.calls[0][2].ids).toEqual(["i7"])
    expect(vi.mocked(repo.findProjects).mock.calls[0][2].ids).toEqual(["p7"])
    expect(vi.mocked(repo.findGoals).mock.calls[0][2].ids).toEqual(["g7"])
  })

  it("groups hits by type with project name, deep links and only the title's translations", async () => {
    vi.mocked(repo.findTasks).mockResolvedValue([
      { id: "t1", taskName: "Write tests", status: "todo", sprint: { id: "s1", sprintName: "Sprint 3", project: P1 } },
    ])
    vi.mocked(repo.findIceboxItems).mockResolvedValue([{ id: "i1", displayId: 4, request: "Idea", status: "unreviewed", project: P1 }])
    vi.mocked(repo.findProjects).mockResolvedValue([{ id: "p1", name: "Apollo", status: "active" }])
    vi.mocked(repo.findGoals).mockResolvedValue([{ id: "g1", title: "Goal", project: P1 }])
    const ft = { ja: "テスト", id: "Tes", source: "ja" as const, status: "done" as const }
    vi.mocked(tr.getI18nFor).mockImplementation(async (type: string) => {
      if (type === "sprint_task") return new Map([["t1", { taskName: ft, completionComment: ft }]])
      if (type === "project") return new Map([["p1", { name: ft, description: ft }]])
      return new Map()
    })

    const out = await searchEverything(MEMBER, { q: "te", limit: 5 })

    expect(out.query).toBe("te")
    expect(out.groups.map((g) => g.type)).toEqual(["task", "icebox", "project", "goal"])
    const [task] = out.groups[0].items
    expect(task).toEqual({
      type: "task",
      id: "t1",
      projectId: "p1",
      projectName: "Apollo",
      projectI18n: { name: ft },
      title: "Write tests",
      titleField: "taskName",
      i18n: { taskName: ft },
      displayId: null,
      context: "Sprint 3",
      status: "todo",
      href: "/projects/p1/sprints?task=t1",
    })
    expect(out.groups[1].items[0]).toMatchObject({ href: "/projects/p1/icebox?item=i1", displayId: 4, i18n: {} })
    expect(out.groups[2].items[0]).toMatchObject({ href: "/projects/p1", projectName: "Apollo" })
    expect(out.groups[3].items[0]).toMatchObject({ href: "/projects/p1", titleField: "title" })
    expect(tr.getI18nFor).toHaveBeenCalledWith("project", ["p1"])
    expect(tr.getI18nFor).toHaveBeenCalledWith("sprint_task", ["t1"])
  })

  it("returns no groups (and skips translation lookups per type) when nothing matches", async () => {
    const out = await searchEverything(MEMBER, { q: "zz", limit: 5 })
    expect(out.groups).toEqual([])
    expect(tr.getI18nFor).toHaveBeenCalledTimes(1)
  })
})
