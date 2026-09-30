import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ReactElement } from "react"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getI18nFor: vi.fn(),
  prisma: {
    projectMember: { findFirst: vi.fn() },
    project: { findUnique: vi.fn() },
    userSection: { findFirst: vi.fn() },
    sprintBacklogItem: { findMany: vi.fn() },
    planItem: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))
vi.mock("@/lib/translation/hooks", () => ({ getI18nFor: m.getI18nFor }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
  notFound: () => { throw new Error("NOT_FOUND") },
}))
vi.mock("../dashboard-content", () => ({ DashboardContent: (props: Record<string, unknown>) => <pre data-testid="props">{JSON.stringify(props)}</pre> }))

const { default: ProjectDashboard } = await import("../page")

const params = Promise.resolve({ projectId: "p1" })
const d = (s: string) => new Date(s)

const fullProject = {
  id: "p1",
  name: "Kanflow",
  description: "desc",
  progressPct: 42,
  productGoals: [{ id: "g1", title: "Goal", description: null }],
  attachmentFolders: [{
    id: "f1", name: "Specs", parentId: null, sortOrder: 0,
    attachments: [{ id: "a1", originalName: "a.pdf", fileName: "a", fileSize: 1, mimeType: "application/pdf", folderId: "f1", createdAt: d("2026-01-01T00:00:00Z") }],
  }],
  attachments: [
    { id: "a1", originalName: "a.pdf", fileName: "a", fileSize: 1, mimeType: "application/pdf", folderId: "f1", createdAt: d("2026-01-01T00:00:00Z") },
    { id: "a2", originalName: "b.pdf", fileName: "b", fileSize: 2, mimeType: "application/pdf", folderId: null, createdAt: d("2026-01-02T00:00:00Z") },
  ],
  _count: { iceboxItems: 4, backlogItems: 5, sprints: 6 },
  sprints: [{
    id: "s1", sprintName: "S1", sprintGoal: "G", capacity: 10,
    startDate: d("2026-09-01T00:00:00Z"), endDate: d("2026-09-14T00:00:00Z"),
    items: [{ status: "todo" }, { status: "in_progress" }, { status: "done" }, { status: "done" }],
  }],
}

async function renderPage() {
  const el = (await ProjectDashboard({ params })) as ReactElement
  render(el)
  return JSON.parse(screen.getByTestId("props").textContent!) as Record<string, unknown>
}

describe("ProjectDashboard (server)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.prisma.sprintBacklogItem.findMany.mockResolvedValue([])
    m.prisma.planItem.findMany.mockResolvedValue([])
    m.getI18nFor.mockImplementation(async (_type: string, ids: string[]) => new Map(ids.map((id) => [id, { name: { en: `en-${id}` } }])))
  })

  it("redirects anonymous users to /login", async () => {
    m.auth.mockResolvedValue(null)
    await expect(ProjectDashboard({ params })).rejects.toThrow("REDIRECT:/login")
  })

  it("maps project data for a member (role from membership)", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "user" } })
    m.prisma.projectMember.findFirst.mockResolvedValue({ role: "developer" })
    m.prisma.project.findUnique.mockResolvedValue(fullProject)
    const props = await renderPage()
    expect(props).toMatchObject({
      projectId: "p1",
      projectName: "Kanflow",
      projectProgressPct: 42,
      currentUserRole: "developer",
      iceboxCount: 4,
      backlogCount: 5,
      sprintCount: 6,
      projectI18n: { name: { en: "en-p1" } },
    })
    expect((props.attachments as { id: string }[]).map((a) => a.id)).toEqual(["a2"])
    expect((props.folders as { attachments: { createdAt: string }[] }[])[0].attachments[0].createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(props.activeSprint).toMatchObject({ id: "s1", name: "S1", taskCounts: { todo: 1, inProgress: 1, done: 2 }, i18n: { name: { en: "en-s1" } } })
    expect((props.productGoals as { i18n: unknown }[])[0].i18n).toEqual({ name: { en: "en-g1" } })
  })

  it("adds my open tasks here, upcoming due items and the sprint sparkline", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", name: "Taro", role: "user" } })
    m.prisma.projectMember.findFirst.mockResolvedValue({ role: "developer" })
    m.prisma.project.findUnique.mockResolvedValue({
      ...fullProject,
      sprints: [{
        ...fullProject.sprints[0],
        items: [
          { taskName: "a", status: "done", completedAt: d("2026-09-02T03:00:00Z") },
          { taskName: "b", status: "todo", completedAt: null },
        ],
      }],
    })
    m.prisma.sprintBacklogItem.findMany.mockResolvedValue([
      { id: "t1", taskName: "Mine", status: "todo", assignee: null, assignees: [{ userId: "u1" }], pbItem: { id: "pb1", displayId: 4, userStory: "S" } },
      { id: "t2", taskName: "Substring only", status: "todo", assignee: "Taro Yamada", assignees: [], pbItem: { id: "pb2", displayId: 5, userStory: null } },
    ])
    const soon = new Date(Date.now() + 3 * 86_400_000)
    m.prisma.planItem.findMany.mockResolvedValue([
      { id: "pl1", name: "Launch", plannedEnd: new Date(Date.UTC(soon.getFullYear(), soon.getMonth(), soon.getDate())), status: "in_progress", isMilestone: true },
    ])
    const props = await renderPage()

    const taskArgs = m.prisma.sprintBacklogItem.findMany.mock.calls[0][0]
    expect(taskArgs.where.sprint).toEqual({ projectId: "p1", status: { in: ["planning", "active"] } })
    expect(taskArgs.where.status).toEqual({ not: "done" })
    expect(taskArgs.where.pbItem).toEqual({ deletedAt: null })
    expect(props.myTasks).toEqual([
      { id: "t1", taskName: "Mine", status: "todo", pbDisplayId: 4, pbUserStory: "S", i18n: { name: { en: "en-t1" } }, pbI18n: { name: { en: "en-pb1" } } },
    ])

    const planArgs = m.prisma.planItem.findMany.mock.calls[0][0]
    expect(planArgs.where).toMatchObject({ projectId: "p1", status: { not: "done" } })
    const due = props.upcomingDue as { id: string; kind: string; days: number }[]
    expect(due.map((i) => [i.id, i.kind])).toEqual([["s1", "sprint_end"], ["pl1", "milestone"]])
    expect(due[1].days).toBe(3)

    const sprint = props.activeSprint as { sparkline: { total: number; remaining: number; ideal: number[] } }
    expect(sprint.sparkline).toMatchObject({ total: 2, remaining: 1 })
    expect(sprint.sparkline.ideal.length).toBeGreaterThan(1)
  })

  it("gives admins PO access without membership and handles no active sprint / null progress", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })
    m.prisma.projectMember.findFirst.mockResolvedValue(null)
    m.prisma.project.findUnique.mockResolvedValue({ ...fullProject, progressPct: null, sprints: [] })
    m.getI18nFor.mockResolvedValue(new Map())
    const props = await renderPage()
    expect(props.currentUserRole).toBe("po")
    expect(props.projectProgressPct).toBe(0)
    expect(props.activeSprint).toBeNull()
    expect(props.projectI18n).toEqual({})
    expect(props.myTasks).toEqual([])
    expect(props.upcomingDue).toEqual([])
  })

  it("lets a section manager in when sections overlap", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "section_manager" } })
    m.prisma.projectMember.findFirst.mockResolvedValue(null)
    m.prisma.project.findUnique
      .mockResolvedValueOnce({ sections: [{ sectionId: "sec1" }] })
      .mockResolvedValueOnce(fullProject)
    m.prisma.userSection.findFirst.mockResolvedValue({ sectionId: "sec1" })
    const props = await renderPage()
    expect(props.currentUserRole).toBe("section_manager")
    expect(m.prisma.userSection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", sectionId: { in: ["sec1"] } } }))
  })

  it("404s a section manager without overlap or without project sections", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "section_manager" } })
    m.prisma.projectMember.findFirst.mockResolvedValue(null)
    m.prisma.project.findUnique.mockResolvedValueOnce({ sections: [{ sectionId: "sec1" }] })
    m.prisma.userSection.findFirst.mockResolvedValue(null)
    await expect(ProjectDashboard({ params })).rejects.toThrow("NOT_FOUND")

    m.prisma.project.findUnique.mockResolvedValueOnce(null)
    await expect(ProjectDashboard({ params })).rejects.toThrow("NOT_FOUND")
  })

  it("404s non-members and missing projects", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "user" } })
    m.prisma.projectMember.findFirst.mockResolvedValue(null)
    await expect(ProjectDashboard({ params })).rejects.toThrow("NOT_FOUND")

    m.prisma.projectMember.findFirst.mockResolvedValue({ role: "po" })
    m.prisma.project.findUnique.mockResolvedValue(null)
    await expect(ProjectDashboard({ params })).rejects.toThrow("NOT_FOUND")
  })
})
