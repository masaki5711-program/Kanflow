import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  sprintFindMany: vi.fn(),
  pbiFindMany: vi.fn(),
  iceFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: m.projectFindUnique },
    sprint: { findMany: m.sprintFindMany },
    productBacklogItem: { findMany: m.pbiFindMany },
    iceboxItem: { findMany: m.iceFindMany },
  },
}))

const { buildProjectContext, CHAT_SYSTEM_PROMPT } = await import("@/lib/project-context")

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe("buildProjectContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.sprintFindMany.mockResolvedValue([])
    m.pbiFindMany.mockResolvedValue([])
    m.iceFindMany.mockResolvedValue([])
  })

  it("returns an empty string for an unknown project and runs no further queries", async () => {
    m.projectFindUnique.mockResolvedValue(null)
    await expect(buildProjectContext("nope")).resolves.toBe("")
    expect(m.projectFindUnique.mock.calls[0][0].where).toEqual({ id: "nope", deletedAt: null })
    expect(m.sprintFindMany).not.toHaveBeenCalled()
  })

  it("scopes every query to the requested project", async () => {
    m.projectFindUnique.mockResolvedValue({
      name: "P", description: null, projectType: "software", progressPct: null,
      members: [], productGoals: [], attachments: [],
      _count: { iceboxItems: 0, backlogItems: 0, sprints: 0 },
    })
    const out = await buildProjectContext("p1")
    expect(m.sprintFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1" })
    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(m.iceFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(m.sprintFindMany.mock.calls[0][0].include.items.where).toEqual({ pbItem: { deletedAt: null } })
    expect(m.projectFindUnique.mock.calls[0][0].include._count.select.backlogItems).toEqual({ where: { deletedAt: null } })
    expect(m.sprintFindMany.mock.calls[0][0].take).toBe(5)
    expect(m.pbiFindMany.mock.calls[0][0].take).toBe(30)
    expect(m.iceFindMany.mock.calls[0][0].take).toBe(20)
    expect(out).toContain("- 進捗 / Progress: 0%")
    expect(out).not.toContain("## メンバー")
    expect(out).not.toContain("## 添付ファイル")
  })

  it("renders all sections with truncation", async () => {
    m.projectFindUnique.mockResolvedValue({
      name: "Kanflow", description: "d".repeat(600), projectType: "software", progressPct: 40,
      members: [{ role: "po", user: { name: "Ann", email: "ann@example.com" } }],
      productGoals: [{ title: "G1", description: "desc" }, { title: "G2", description: null }],
      attachments: [{ originalName: "a.pdf", mimeType: "application/pdf", fileSize: 3072 }],
      _count: { iceboxItems: 2, backlogItems: 3, sprints: 1 },
    })
    m.sprintFindMany.mockResolvedValue([
      { sprintName: "S1", status: "active", startDate: d("2026-01-01"), endDate: d("2026-01-14"), capacity: 10, sprintGoal: "Goal", items: [{ status: "todo" }, { status: "todo" }, { status: "done" }] },
      { sprintName: "S0", status: "done", startDate: null, endDate: d("2025-12-31"), capacity: 5, sprintGoal: null, items: [] },
    ])
    m.pbiFindMany.mockResolvedValue([
      { displayId: 1, initiative: "Login", epic: "Auth", userStory: null, status: "ready", workloadScore: 3 },
      { displayId: 2, initiative: "", epic: null, userStory: "As a user\nI want", status: "not_ready", workloadScore: 0 },
      { displayId: 3, initiative: null, epic: null, userStory: null, status: "ready", workloadScore: 1 },
    ])
    m.iceFindMany.mockResolvedValue([
      { displayId: 5, author: "Bob", request: "Need export", background: "Audit", status: "open" },
      { displayId: 6, author: "Cy", request: "X", background: null, status: "open" },
    ])
    const out = await buildProjectContext("p1")
    expect(out).toContain("- 名前 / Name: Kanflow")
    expect(out).toContain(`- 説明 / Description: ${"d".repeat(500)}…`)
    expect(out).toContain("- 件数 / Counts: PBI=3, Sprint=1, Icebox=2")
    expect(out).toContain("- Ann <ann@example.com> [po]")
    expect(out).toContain("- G1 — desc")
    expect(out).toContain("- G2\n")
    expect(out).toContain("- S1 [active] 2026-01-01〜2026-01-14 | capacity=5".replace("5", "10") + " | tasks: todo:2, done:1 | goal: Goal")
    expect(out).toContain("- S0 [done] ?〜2025-12-31 | capacity=5 | tasks: 0")
    expect(out).toContain("- #1 [ready] (3) Login / Epic: Auth")
    expect(out).toContain("- #2 [not_ready] (0) As a user")
    expect(out).toContain("- #3 [ready] (1) (untitled)")
    expect(out).toContain("- #5 [open] by Bob: Need export (背景: Audit)")
    expect(out).toContain("- #6 [open] by Cy: X")
    expect(out).toContain("- a.pdf (application/pdf, 3 KB)")
  })

  it("exports a system prompt with language and numbers rules", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("Language rule")
    expect(CHAT_SYSTEM_PROMPT).toContain("Numbers rule")
  })
})
