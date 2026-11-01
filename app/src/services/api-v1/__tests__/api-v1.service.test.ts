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
    workloadScore: 3, assignedPo: null, sortOrder: 1, productGoalId: null, planItemId: null, completedAt: null, version: 0,
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
        id: "t1", taskName: "Do", status: "todo", estimatedHours: 1, actualHours: null, completedAt: null, version: 0, createdAt: T, updatedAt: T,
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
    expect(listProjectActivity).toHaveBeenCalledWith("p1", { limit: 10 }, { hideConfidential: true })
    expect(out).toEqual({ data: [{ id: "a1" }], nextCursor: "c2" })
  })
})

describe("Kanflow MCP helpers", () => {
  it("locateEntity: project of a PBI / sprint / Icebox item, project and sprint of a task, null when missing", async () => {
    vi.mocked(repo.findPbiProjectId).mockResolvedValue({ projectId: "p1" })
    vi.mocked(repo.findSprintProjectId).mockResolvedValue({ projectId: "p2" })
    vi.mocked(repo.findIceboxProjectId).mockResolvedValue(null)
    vi.mocked(repo.findTaskLocation).mockResolvedValue({ sprintId: "s1", sprint: { projectId: "p3" } })
    expect(await v1.locateEntity("pbi", "b1")).toEqual({ projectId: "p1" })
    expect(await v1.locateEntity("sprint", "s1")).toEqual({ projectId: "p2" })
    expect(await v1.locateEntity("icebox", "i1")).toBeNull()
    expect(await v1.locateEntity("task", "k1")).toEqual({ projectId: "p3", sprintId: "s1" })
    vi.mocked(repo.findTaskLocation).mockResolvedValue(null)
    expect(await v1.locateEntity("task", "k2")).toBeNull()
  })

  it("normalizeRemoteUrl: ssh:// and credentials / ports dropped, http upgraded, scp form untouched", () => {
    const host = "gitlab.example.com"
    expect(v1.normalizeRemoteUrl(`ssh://git@${host}:2222/g/r.git`)).toBe(`https://${host}/g/r.git`)
    expect(v1.normalizeRemoteUrl(`https://oauth2:secret@${host}/g/r.git`)).toBe(`https://${host}/g/r.git`)
    expect(v1.normalizeRemoteUrl(`http://${host}/g/r`)).toBe(`https://${host}/g/r`)
    expect(v1.normalizeRemoteUrl(` git@${host}:g/r.git `)).toBe(`git@${host}:g/r.git`)
  })

  it("findProjectsByRepository flattens the rows", async () => {
    vi.mocked(repo.findRepositoriesAt).mockResolvedValue([{ projectId: "p1", name: "API", webUrl: "https://h/g/r", project: { name: "Kanflow" } }])
    expect(await v1.findProjectsByRepository({ apiBase: "https://h", repoPath: "g/r" })).toEqual({
      items: [{ projectId: "p1", projectName: "Kanflow", repository: { name: "API", webUrl: "https://h/g/r" } }],
      truncated: false,
      limit: repo.V1_REPOSITORY_MATCH_LIMIT,
    })
    expect(repo.findRepositoriesAt).toHaveBeenCalledWith(DEFAULT_DB, "https://h", "g/r")
  })

  it("findProjectsByRepository / listMyTasks cut at the limit and say so", async () => {
    const repoRow = { projectId: "p1", name: "API", webUrl: "https://h/g/r", project: { name: "Kanflow" } }
    vi.mocked(repo.findRepositoriesAt).mockResolvedValue(Array.from({ length: repo.V1_REPOSITORY_MATCH_LIMIT + 1 }, () => repoRow))
    const repos = await v1.findProjectsByRepository({ apiBase: "https://h", repoPath: "g/r" })
    expect(repos.items).toHaveLength(repo.V1_REPOSITORY_MATCH_LIMIT)
    expect(repos.truncated).toBe(true)

    const task = {
      id: "k", taskName: "t", status: "todo", estimatedHours: null, actualHours: null, completedAt: null, version: 0, createdAt: T, updatedAt: T,
      pbItem: { id: "b1", displayId: 1, initiative: "I", userStory: null }, sprint: { id: "s1", sprintName: "S", status: "active", projectId: "p1" },
    }
    vi.mocked(repo.findMyTasks).mockResolvedValue(Array.from({ length: repo.V1_MY_TASKS_LIMIT + 1 }, () => task))
    const mine = await v1.listMyTasks("u1", null, false)
    expect(repo.findMyTasks).toHaveBeenCalledWith(DEFAULT_DB, "u1", null, false)
    expect(mine.data).toHaveLength(repo.V1_MY_TASKS_LIMIT)
    expect(mine).toMatchObject({ truncated: true, limit: repo.V1_MY_TASKS_LIMIT })
  })

  it("listMyTasks: no projects → no query; rows carry project, sprint and PBI title", async () => {
    expect(await v1.listMyTasks("u1", [], false)).toEqual({ data: [], truncated: false, limit: repo.V1_MY_TASKS_LIMIT })
    expect(repo.findMyTasks).not.toHaveBeenCalled()
    vi.mocked(repo.findMyTasks).mockResolvedValue([
      {
        id: "k1", taskName: "API", status: "todo", estimatedHours: 2, actualHours: null, completedAt: null, version: 1, createdAt: T, updatedAt: T,
        pbItem: { id: "b1", displayId: 12, initiative: null, userStory: "As a dev I want X" },
        sprint: { id: "s1", sprintName: "S1", status: "active", projectId: "p1" },
      },
    ])
    const out = await v1.listMyTasks("u1", ["p1"], true)
    expect(repo.findMyTasks).toHaveBeenCalledWith(DEFAULT_DB, "u1", ["p1"], true)
    expect(out.data[0]).toMatchObject({
      id: "k1", projectId: "p1", createdAt: T.toISOString(),
      sprint: { id: "s1", name: "S1", status: "active" },
      pbi: { id: "b1", displayId: 12, title: "As a dev I want X" },
    })
  })
})

describe("duplicate hint of a task create (findSimilarTasks)", () => {
  it("normalizes names: NFKC, case and whitespace folded", () => {
    expect(v1.normalizeTaskName("  ＡＰＩ   実装 ")).toBe("api 実装")
    expect(v1.normalizeTaskName(null)).toBe("")
  })

  it("returns the same PBI's tasks of the sprint with the same normalized name", async () => {
    vi.mocked(repo.findPbiTasksInSprint).mockResolvedValue([
      { id: "k1", taskName: "API 実装", status: "todo" },
      { id: "k2", taskName: "UI", status: "todo" },
    ] as never)
    expect(await v1.findSimilarTasks("p1", "s1", "b1", "api  実装")).toEqual([{ id: "k1", taskName: "API 実装", status: "todo" }])
    expect(repo.findPbiTasksInSprint).toHaveBeenCalledWith(DEFAULT_DB, "p1", "s1", "b1")
  })

  it("does not look anything up for an unnamed task", async () => {
    expect(await v1.findSimilarTasks("p1", "s1", "b1", "  ")).toEqual([])
    expect(repo.findPbiTasksInSprint).not.toHaveBeenCalled()
  })
})

describe("getPbi: acceptance criteria as items with stable ids (W5)", () => {
  const pbiRow = {
    id: "b1", displayId: 12, status: "ready", initiative: "Login", epic: null, userStory: "story", acceptanceCriteria: "old free text",
    referenceDoc: null, workloadScore: 3, assignedPo: null, poNote: null, notReadyReason: null, sortOrder: 0, productGoalId: null,
    planItemId: null, iceboxItemId: null, completedAt: null, version: 2, createdAt: T, updatedAt: T,
    sprintItems: [],
    criteria: [
      { seq: 1, given: null, when: null, then: null, text: "Login works", evidenceKind: null },
      { seq: 3, given: "g", when: "w", then: "t", text: null, evidenceKind: "measurement" },
    ],
  }

  it("returns acceptanceCriteriaItems: [{ id: 'PBI-12/AC-n', seq, given, when, then, text, evidenceKind }] and leaves acceptanceCriteria as the old text", async () => {
    vi.mocked(repo.findPbi).mockResolvedValue(pbiRow as never)
    const { data } = await v1.getPbi("p1", "PBI-12")
    expect(data.acceptanceCriteriaItems).toEqual([
      { id: "PBI-12/AC-1", seq: 1, given: null, when: null, then: null, text: "Login works", evidenceKind: null },
      { id: "PBI-12/AC-3", seq: 3, given: "g", when: "w", then: "t", text: null, evidenceKind: "measurement" },
    ])
    expect(data.acceptanceCriteria).toBe("old free text")
    expect(data).not.toHaveProperty("criteria")
    expect(repo.findPbi).toHaveBeenCalledWith(DEFAULT_DB, "p1", { displayId: 12 })
  })

  it("a PBI without items gives an empty list (the old text stays readable)", async () => {
    vi.mocked(repo.findPbi).mockResolvedValue({ ...pbiRow, criteria: [] } as never)
    const { data } = await v1.getPbi("p1", "b1")
    expect(data.acceptanceCriteriaItems).toEqual([])
    expect(data.acceptanceCriteria).toBe("old free text")
  })
})
