import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../api-v1.repository")
vi.mock("@/services/projects/project-list", () => ({
  loadProjectListScope: vi.fn(async (u: { id: string; role?: string }) => ({ userId: u.id, isAdmin: u.role === "admin", sectionIds: [] })),
  projectListWhere: vi.fn((scope: { userId: string }, status: string) => ({ scope: scope.userId, status })),
}))
vi.mock("@/services/activity/activity.service", () => ({
  listProjectActivity: vi.fn(async () => ({ items: [{ id: "a1" }], nextCursor: "c2" })),
}))

const repo = await import("../api-v1.repository")
const { DEFAULT_DB } = await import("@/services/__tests__/support")
const v1 = await import("../api-v1.service")
const { listProjectActivity } = await import("@/services/activity/activity.service")
const { encodeCursor } = await import("@/services/_shared/cursor")

const T = new Date("2026-10-01T00:00:00.000Z")

beforeEach(() => vi.clearAllMocks())

describe("me", () => {
  it("returns the token owner's profile", async () => {
    vi.mocked(repo.findMe).mockResolvedValue({ id: "u1", name: "A", email: "a@x", role: "member", language: "ja", department: null })
    expect(await v1.getMe("u1")).toEqual({ data: { id: "u1", name: "A", email: "a@x", role: "member", language: "ja", department: null } })
  })

  it("404s when the user vanished", async () => {
    vi.mocked(repo.findMe).mockResolvedValue(null)
    await expect(v1.getMe("u1")).rejects.toMatchObject({ status: 404 })
  })
})

describe("projects", () => {
  const row = {
    id: "p1", name: "P", description: null, status: "active", projectType: "software", progressPct: 10,
    pointUnit: "SP", language: "ja", sprintDurationDays: 7, createdAt: T, updatedAt: T,
  }

  it("lists the projects in the user's role scope", async () => {
    vi.mocked(repo.findProjects).mockResolvedValue([row])
    const out = await v1.listProjects({ id: "u1", role: "member" }, { status: "archived" })
    expect(repo.findProjects).toHaveBeenCalledWith(DEFAULT_DB, { scope: "u1", status: "archived" })
    expect(out.data[0]).toEqual({ ...row, createdAt: T.toISOString(), updatedAt: T.toISOString() })
  })

  it("project detail flattens sections and members", async () => {
    vi.mocked(repo.findProject).mockResolvedValue({
      ...row,
      sections: [{ section: { id: "s1", name: "S" } }],
      members: [{ role: "po", user: { id: "u1", name: "A" } }],
    })
    const out = await v1.getProject("p1")
    expect(out.data.sections).toEqual([{ id: "s1", name: "S" }])
    expect(out.data.members).toEqual([{ userId: "u1", name: "A", role: "po" }])
  })

  it("project detail 404s", async () => {
    vi.mocked(repo.findProject).mockResolvedValue(null)
    await expect(v1.getProject("p1")).rejects.toMatchObject({ status: 404 })
  })
})

describe("backlog pagination", () => {
  const pbi = (id: string, minute: number) => ({
    id, displayId: 1, status: "ready", initiative: null, epic: null, userStory: "s", acceptanceCriteria: null,
    workloadScore: 3, assignedPo: null, sortOrder: 1, productGoalId: null, planItemId: null, completedAt: null,
    createdAt: new Date(T.getTime() + minute * 60_000), updatedAt: T,
  })

  it("returns a page and a cursor when more rows exist (limit + 1 fetched)", async () => {
    vi.mocked(repo.findBacklogPage).mockResolvedValue([pbi("a", 1), pbi("b", 2), pbi("c", 3)])
    const out = await v1.listBacklog("p1", { limit: 2, status: "ready" })
    expect(repo.findBacklogPage).toHaveBeenCalledWith(DEFAULT_DB, "p1", { limit: 2, status: "ready" })
    expect(out.data.map((i) => i.id)).toEqual(["a", "b"])
    expect(out.nextCursor).toBe(encodeCursor({ createdAt: new Date(T.getTime() + 2 * 60_000), id: "b" }))
  })

  it("last page has a null cursor", async () => {
    vi.mocked(repo.findBacklogPage).mockResolvedValue([pbi("a", 1)])
    const out = await v1.listBacklog("p1", { limit: 2 })
    expect(out.nextCursor).toBeNull()
    expect(out.data[0].createdAt).toBe(new Date(T.getTime() + 60_000).toISOString())
  })
})

describe("sprints and tasks", () => {
  it("lists sprints", async () => {
    vi.mocked(repo.findSprints).mockResolvedValue([
      { id: "s1", sprintName: "S1", status: "active", startDate: T, endDate: T, sprintGoal: null, capacity: 5, actualScore: 2, createdAt: T, updatedAt: T },
    ])
    const out = await v1.listSprints("p1")
    expect(out.data[0]).toMatchObject({ id: "s1", name: "S1", startDate: T.toISOString() })
  })

  it("lists tasks of a sprint of the project", async () => {
    vi.mocked(repo.findSprintId).mockResolvedValue({ id: "s1" })
    vi.mocked(repo.findSprintTasks).mockResolvedValue([
      {
        id: "t1", taskName: "Do", status: "todo", estimatedHours: 1, actualHours: null, completedAt: null, createdAt: T, updatedAt: T,
        pbItem: { id: "b1", displayId: 4 }, assignees: [{ user: { id: "u1", name: "A" } }],
      },
    ] as never)
    const out = await v1.listSprintTasks("p1", "s1")
    expect(repo.findSprintId).toHaveBeenCalledWith(DEFAULT_DB, "p1", "s1")
    expect(out.data[0]).toMatchObject({ id: "t1", pbi: { id: "b1", displayId: 4 }, assignees: [{ id: "u1", name: "A" }] })
  })

  it("404s for a sprint of another project", async () => {
    vi.mocked(repo.findSprintId).mockResolvedValue(null)
    await expect(v1.listSprintTasks("p1", "s9")).rejects.toMatchObject({ status: 404 })
    expect(repo.findSprintTasks).not.toHaveBeenCalled()
  })
})

describe("plan, releases, activity", () => {
  it("lists plan items with progress and status", async () => {
    vi.mocked(repo.findPlanItems).mockResolvedValue([
      {
        id: "i1", parentId: null, name: "Phase", status: "in_progress", progressPct: 40, plannedStart: T, plannedEnd: T,
        actualStart: null, actualEnd: null, isMilestone: false, sortOrder: 0, createdAt: T, updatedAt: T,
      },
    ])
    const out = await v1.listPlan("p1")
    expect(out.data[0]).toMatchObject({ id: "i1", progressPct: 40, status: "in_progress", actualStart: null, plannedStart: T.toISOString() })
  })

  it("hides the link to a trashed source PBI in releases", async () => {
    const base = { planVersion: "v1", releaseVersion: null, releaseDate: null, status: "staged", initiative: null, epic: null, userStory: null, createdAt: T, updatedAt: T }
    vi.mocked(repo.findReleases).mockResolvedValue([
      { ...base, id: "r1", pbItem: { id: "b1", displayId: 1, deletedAt: null } },
      { ...base, id: "r2", pbItem: { id: "b2", displayId: 2, deletedAt: T } },
    ])
    const out = await v1.listReleases("p1")
    expect(out.data[0].pbi).toEqual({ id: "b1", displayId: 1 })
    expect(out.data[1].pbi).toBeNull()
  })

  it("reuses the activity service", async () => {
    const out = await v1.listActivity("p1", { limit: 10 })
    expect(listProjectActivity).toHaveBeenCalledWith("p1", { limit: 10 })
    expect(out).toEqual({ data: [{ id: "a1" }], nextCursor: "c2" })
  })
})
