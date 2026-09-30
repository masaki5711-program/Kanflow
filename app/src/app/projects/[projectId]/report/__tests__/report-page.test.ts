import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  memberFind: vi.fn(),
  projectFind: vi.fn(),
  userSectionFind: vi.fn(),
  sprintFind: vi.fn(),
  backlogFind: vi.fn(),
  iceboxFind: vi.fn(),
  eventFind: vi.fn(),
  getI18nFor: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: m.memberFind },
    project: { findUnique: m.projectFind },
    userSection: { findFirst: m.userSectionFind },
    sprint: { findMany: m.sprintFind },
    productBacklogItem: { findMany: m.backlogFind },
    iceboxItem: { findMany: m.iceboxFind },
    calendarEvent: { findMany: m.eventFind },
  },
}))
vi.mock("@/lib/translation/hooks", () => ({ getI18nFor: m.getI18nFor }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) },
  notFound: () => { throw new Error("NOT_FOUND") },
}))
vi.mock("../report-content", () => ({ ReportContent: () => null }))

const { default: ReportPage } = await import("../page")
const params = Promise.resolve({ projectId: "p1" })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = () => ReportPage({ params }) as Promise<ReactElement<any>>
const session = (role: string) => ({ user: { id: "u1", role } })
const D = (s: string) => new Date(s)

const project = {
  id: "p1", name: "Proj", description: "desc", language: "ja", pointUnit: "SP",
  members: [{ role: "po", user: { id: "u1", name: "Paula", email: "p@x" } }],
  productGoals: [{ id: "g1", title: "Goal", description: null }],
}

function seedData() {
  m.projectFind.mockResolvedValue(project)
  m.sprintFind.mockResolvedValue([
    {
      id: "s1", sprintName: "S1", startDate: D("2026-01-01T00:00:00Z"), endDate: D("2026-01-15T00:00:00Z"),
      sprintGoal: "g", capacity: 10, actualScore: 8, status: "done", reviewComment: null, retrospectiveMemo: null,
      retrospectiveKeep: null, retrospectiveProblem: null, retrospectiveTry: null,
      items: [{ id: "t1", taskName: "T", assignee: null, estimatedHours: 1, actualHours: 2, status: "done",
        pbItem: { id: "pb1", displayId: 1, initiative: "I", epic: null, userStory: null, workloadScore: 3 } }],
    },
  ])
  m.backlogFind.mockResolvedValue([
    { id: "pb1", displayId: 1, initiative: "I", epic: null, userStory: null, workloadScore: 3, status: "ready", assignedPo: null, completedAt: null, productGoal: { id: "g1", title: "Goal" } },
    { id: "pb2", displayId: 2, initiative: null, epic: null, userStory: null, workloadScore: null, status: "ready", assignedPo: null, completedAt: null, productGoal: null },
    { id: "pb3", displayId: 3, initiative: null, epic: null, userStory: null, workloadScore: 5, status: "not_ready", assignedPo: null, completedAt: null, productGoal: null },
    { id: "pb4", displayId: 4, initiative: null, epic: null, userStory: null, workloadScore: 2, status: "completed", assignedPo: "po", completedAt: D("2026-02-01T00:00:00Z"), productGoal: null },
  ])
  m.iceboxFind.mockResolvedValue([{ status: "unreviewed" }, { status: "unreviewed" }, { status: "reviewed" }, { status: "frozen" }])
  m.eventFind.mockResolvedValue([
    { id: "e1", title: "E", description: null, date: D("2026-03-01T00:00:00Z"), endDate: null, color: "blue" },
    { id: "e2", title: "E2", description: "d", date: D("2026-03-02T00:00:00Z"), endDate: D("2026-03-03T00:00:00Z"), color: "red" },
  ])
  m.getI18nFor.mockImplementation(async (type: string, ids: string[]) =>
    new Map(ids.map((id) => [id, { name: { ja: `${type}:${id}`, id: null, source: "ja", status: "pending" } }])),
  )
}

describe("ReportPage (server)", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
  })

  it("redirects anonymous users to /login", async () => {
    m.auth.mockResolvedValue(undefined)
    await expect(run()).rejects.toThrow("REDIRECT:/login")
  })

  it("404s for non-members, and for section managers without overlap / sections", async () => {
    m.auth.mockResolvedValue(session("user"))
    m.memberFind.mockResolvedValue(null)
    await expect(run()).rejects.toThrow("NOT_FOUND")

    m.auth.mockResolvedValue(session("section_manager"))
    m.projectFind.mockResolvedValueOnce({ sections: [{ sectionId: "s1" }] })
    m.userSectionFind.mockResolvedValue(null)
    await expect(run()).rejects.toThrow("NOT_FOUND")

    m.projectFind.mockResolvedValueOnce({ sections: [] })
    await expect(run()).rejects.toThrow("NOT_FOUND")
  })

  it("404s when the project does not exist", async () => {
    m.auth.mockResolvedValue(session("admin"))
    m.memberFind.mockResolvedValue(null)
    m.projectFind.mockResolvedValue(null)
    await expect(run()).rejects.toThrow("NOT_FOUND")
  })

  it("section manager with an overlapping section can view the report", async () => {
    m.auth.mockResolvedValue(session("section_manager"))
    m.memberFind.mockResolvedValue(null)
    seedData()
    m.projectFind.mockResolvedValueOnce({ sections: [{ sectionId: "s1" }] })
    m.userSectionFind.mockResolvedValue({ sectionId: "s1" })
    const el = await run()
    expect(el.props.projectName).toBe("Proj")
  })

  it("serialises sprints, backlog summary, icebox counts and events for a member", async () => {
    m.auth.mockResolvedValue(session("user"))
    m.memberFind.mockResolvedValue({ role: "dev" })
    seedData()
    const { props } = await run()

    expect(props.projectId).toBe("p1")
    expect(props.members).toEqual([{ id: "u1", name: "Paula", email: "p@x", role: "po" }])
    expect(props.projectI18n).toEqual({ name: { ja: "project:p1", id: null, source: "ja", status: "pending" } })
    expect(props.backlogSummary).toEqual({ ready: 2, notReady: 1, completed: 1, totalReadyWorkload: 3 })
    expect(props.icebox).toEqual({ unreviewed: 2, reviewed: 1, frozen: 1 })
    expect(props.sprints[0]).toMatchObject({
      id: "s1", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-01-15T00:00:00.000Z",
      items: [{ id: "t1", pbItem: { id: "pb1", i18n: expect.any(Object) } }],
    })
    expect(props.backlogItems[0]).toMatchObject({ productGoalTitle: "Goal", productGoalI18n: expect.any(Object) })
    expect(props.backlogItems[1]).toMatchObject({ productGoalTitle: null, productGoalI18n: null })
    expect(props.backlogItems[3].completedAt).toBe("2026-02-01T00:00:00.000Z")
    expect(props.events).toEqual([
      expect.objectContaining({ id: "e1", date: "2026-03-01T00:00:00.000Z", endDate: null }),
      expect.objectContaining({ id: "e2", endDate: "2026-03-03T00:00:00.000Z" }),
    ])
    expect(m.getI18nFor).toHaveBeenCalledWith("product_goal", ["g1", "g1"])
    expect(m.getI18nFor).toHaveBeenCalledWith("backlog_item", ["pb1", "pb1", "pb2", "pb3", "pb4"])
  })
})
