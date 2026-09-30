import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  topPageProps: null as Record<string, unknown> | null,
  prisma: {
    userSection: { findMany: vi.fn() },
    project: { findMany: vi.fn(), count: vi.fn() },
    userProjectCategory: { findMany: vi.fn() },
    sprintBacklogItem: { findMany: vi.fn() },
  },
  getI18nFor: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
vi.mock("next/navigation", () => ({ redirect: m.redirect }))
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))
vi.mock("@/components/header", () => ({ Header: () => <header>HEADER</header> }))
vi.mock("@/lib/translation/hooks", () => ({ getI18nFor: m.getI18nFor }))
vi.mock("../top-page", () => ({
  TopPage: (props: Record<string, unknown>) => {
    m.topPageProps = props
    return <div data-testid="top-page" />
  },
}))

const { default: HomePage } = await import("../(home)/page")

const rawProject = (id: string, fav: boolean) => ({
  id,
  name: id,
  members: [],
  sections: [{ section: { id: "s1", name: "Sec" } }],
  favoritedBy: fav ? [{ userId: "u1" }] : [],
  aiReports: [],
  _count: { iceboxItems: 0, backlogItems: 0, sprints: 0, aiReports: 0 },
})

const rawTask = {
  id: "t1",
  taskName: "Task",
  assignee: "Taro",
  assignees: [] as { userId: string }[],
  status: "todo",
  version: 4,
  estimatedHours: 2,
  actualHours: null,
  pbItem: { id: "pb1", displayId: 3, userStory: "story" },
  sprint: {
    id: "sp1",
    sprintName: "S1",
    status: "active",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2026-09-10T00:00:00Z"),
    projectId: "p1",
    project: { name: "P1" },
  },
}

describe("HomePage (server)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.topPageProps = null
    m.prisma.userSection.findMany.mockResolvedValue([{ sectionId: "sec1" }])
    m.prisma.project.findMany.mockResolvedValue([rawProject("p1", true)])
    m.prisma.project.count.mockResolvedValue(2)
    m.prisma.userProjectCategory.findMany.mockResolvedValue([{ id: "c1" }])
    m.prisma.sprintBacklogItem.findMany.mockResolvedValue([rawTask])
    m.getI18nFor.mockImplementation(async (type: string) => new Map(type === "project" ? [["p1", { name: { ja: "x" } }]] : []))
  })

  it("redirects anonymous users to /login", async () => {
    m.auth.mockResolvedValue(null)
    await expect(HomePage()).rejects.toThrow("REDIRECT:/login")
  })

  it("loads member projects for a regular user and flattens the view model", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", name: "Taro", role: "member" } })
    render(await HomePage())
    expect(screen.getByText("HEADER")).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("page-wide")
    expect(screen.getByTestId("top-page")).toBeInTheDocument()
    expect(m.prisma.userSection.findMany).not.toHaveBeenCalled()
    const where = m.prisma.project.findMany.mock.calls[0][0].where
    expect(where).toEqual({ members: { some: { userId: "u1" } }, status: "active", deletedAt: null })
    const countSelect = m.prisma.project.findMany.mock.calls[0][0].include._count.select
    expect(countSelect.backlogItems).toEqual({ where: { deletedAt: null } })
    expect(countSelect.iceboxItems).toEqual({ where: { deletedAt: null } })

    const props = m.topPageProps as Record<string, never>
    const active = props.activeProjects as unknown as Array<Record<string, unknown>>
    expect(active[0]).toMatchObject({ id: "p1", isFavorite: true, sections: [{ id: "s1", name: "Sec" }], i18n: { name: { ja: "x" } } })
    // Archived projects are only counted (loaded lazily by the list).
    expect(props.archivedCount).toBe(2)
    expect(m.prisma.project.findMany).toHaveBeenCalledTimes(1)
    expect(m.prisma.project.count).toHaveBeenCalledWith({ where: { members: { some: { userId: "u1" } }, status: "archived", deletedAt: null } })
    expect(m.getI18nFor).toHaveBeenCalledWith("project", ["p1"])
    expect(props.isAdmin).toBe(false)
    expect(props.userName).toBe("Taro")
    expect((props.myTasks as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: "t1",
      version: 4,
      pbDisplayId: 3,
      sprintStartDate: "2026-09-01T00:00:00.000Z",
      projectName: "P1",
      projectI18n: { name: { ja: "x" } },
    })
    const taskWhere = m.prisma.sprintBacklogItem.findMany.mock.calls[0][0].where
    expect(taskWhere.OR).toEqual([
      { assignees: { some: { userId: "u1" } } },
      { assignees: { none: {} }, assignee: { contains: "Taro" } },
    ])
    expect(taskWhere.pbItem).toEqual({ deletedAt: null })
    expect(taskWhere.sprint.project.deletedAt).toBeNull()
  })

  it("my tasks: TaskAssignee by id, legacy rows only on an exact name match", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", name: "Taro", role: "member" } })
    m.prisma.sprintBacklogItem.findMany.mockResolvedValue([
      { ...rawTask, id: "by-id", assignee: "renamed", assignees: [{ userId: "u1" }] },
      { ...rawTask, id: "legacy-exact", assignee: "Hanako, Taro", assignees: [] },
      { ...rawTask, id: "legacy-substring", assignee: "Taro Yamada", assignees: [] },
      { ...rawTask, id: "someone-else", assignee: "Taro", assignees: [{ userId: "u2" }] },
    ])
    render(await HomePage())
    const ids = ((m.topPageProps as Record<string, unknown>).myTasks as Array<{ id: string }>).map((t) => t.id)
    expect(ids).toEqual(["by-id", "legacy-exact"])
    expect(m.prisma.sprintBacklogItem.findMany.mock.calls[0][0].include.assignees).toEqual({ select: { userId: true } })
  })

  it("admins see all projects", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", name: null, role: "admin" } })
    render(await HomePage())
    expect(m.prisma.project.findMany.mock.calls[0][0].where).toEqual({ status: "active", deletedAt: null })
    // No display name: only TaskAssignee rows by id (never every task).
    expect(m.prisma.sprintBacklogItem.findMany.mock.calls[0][0].where.assignees).toEqual({ some: { userId: "u1" } })
    expect((m.topPageProps as Record<string, unknown>).isAdmin).toBe(true)
  })

  it("section managers also see projects of their sections", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", name: "S", role: "section_manager" } })
    await HomePage()
    expect(m.prisma.project.findMany.mock.calls[0][0].where).toEqual({
      status: "active",
      deletedAt: null,
      OR: [{ members: { some: { userId: "u1" } } }, { sections: { some: { sectionId: { in: ["sec1"] } } } }],
    })
  })

  it("section managers without sections fall back to membership", async () => {
    m.prisma.userSection.findMany.mockResolvedValue([])
    m.auth.mockResolvedValue({ user: { id: "u1", name: "S", role: "section_manager" } })
    await HomePage()
    expect(m.prisma.project.findMany.mock.calls[0][0].where).toEqual({ members: { some: { userId: "u1" } }, status: "active", deletedAt: null })
  })
})
