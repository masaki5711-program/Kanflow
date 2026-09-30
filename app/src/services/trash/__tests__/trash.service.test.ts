import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../trash.repository")
vi.mock("@/services/backlog/backlog.repository")
vi.mock("@/services/icebox/icebox.repository")
vi.mock("@/services/projects/projects.repository")
vi.mock("@/services/backlog/backlog.service", () => ({ restoreBacklogItem: vi.fn(), purgeBacklogItem: vi.fn() }))
vi.mock("@/services/icebox/icebox.service", () => ({ restoreIceboxItem: vi.fn(), purgeIceboxItem: vi.fn() }))
vi.mock("@/services/plan/plan.trash", () => ({ listTrashedPlanRoots: vi.fn(async () => []), restorePlanItem: vi.fn(), purgePlanItem: vi.fn() }))

const repo = await import("../trash.repository")
const backlogRepo = await import("@/services/backlog/backlog.repository")
const iceboxRepo = await import("@/services/icebox/icebox.repository")
const projectsRepo = await import("@/services/projects/projects.repository")
const backlog = await import("@/services/backlog/backlog.service")
const icebox = await import("@/services/icebox/icebox.service")
const planTrash = await import("@/services/plan/plan.trash")
const tr = await import("@/services/_shared/translations")
const { ACTOR, DEFAULT_DB } = await import("@/services/__tests__/support")
const svc = await import("../trash.service")
const { parseTrashEntityType } = await import("../trash.schemas")

const NOW = new Date("2026-10-10T00:00:00Z")
const d = (iso: string) => new Date(iso)

describe("trash.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map() as never)
    vi.mocked(repo.findUserNames).mockResolvedValue(new Map([["u1", "Alice"]]))
  })

  it("lists trashed PBIs and Icebox items merged newest first, with who / when / purge date", async () => {
    vi.mocked(backlogRepo.findTrashedBacklogItems).mockResolvedValue([
      { id: "b1", displayId: 3, initiative: "", userStory: "Story", status: "ready", deletedAt: d("2026-10-05T00:00:00Z"), deletedById: "u1" },
    ])
    vi.mocked(iceboxRepo.findTrashedIceboxItems).mockResolvedValue([
      { id: "i1", displayId: 9, request: "Req", status: "unreviewed", deletedAt: d("2026-10-08T00:00:00Z"), deletedById: "gone" },
    ])
    const out = await svc.listProjectTrash("p1", { now: NOW, retentionDays: 30 })
    expect(backlogRepo.findTrashedBacklogItems).toHaveBeenCalledWith(DEFAULT_DB, "p1")
    expect(repo.findUserNames).toHaveBeenCalledWith(DEFAULT_DB, ["u1", "gone"])
    expect(out.retentionDays).toBe(30)
    expect(out.items).toEqual([
      {
        entityType: "icebox_item",
        id: "i1",
        displayId: 9,
        title: "Req",
        titleField: "request",
        status: "unreviewed",
        deletedAt: "2026-10-08T00:00:00.000Z",
        deletedBy: { id: "gone", name: null },
        purgeAt: "2026-11-07T00:00:00.000Z",
        i18n: {},
      },
      {
        entityType: "backlog_item",
        id: "b1",
        displayId: 3,
        title: "Story",
        titleField: "userStory",
        status: "ready",
        deletedAt: "2026-10-05T00:00:00.000Z",
        deletedBy: { id: "u1", name: "Alice" },
        purgeAt: "2026-11-04T00:00:00.000Z",
        i18n: {},
      },
    ])
  })

  it("uses the initiative as the PBI title when present and tolerates an unknown deleter", async () => {
    vi.mocked(backlogRepo.findTrashedBacklogItems).mockResolvedValue([
      { id: "b1", displayId: 1, initiative: "Init", userStory: "S", status: "ready", deletedAt: d("2026-10-05T00:00:00Z"), deletedById: null },
    ])
    vi.mocked(iceboxRepo.findTrashedIceboxItems).mockResolvedValue([])
    const out = await svc.listProjectTrash("p1", { now: NOW, retentionDays: 7 })
    expect(out.items[0]).toMatchObject({ title: "Init", titleField: "initiative", deletedBy: null })
  })

  it("lists trashed plan subtrees (no display number, name title, subtree size)", async () => {
    vi.mocked(backlogRepo.findTrashedBacklogItems).mockResolvedValue([])
    vi.mocked(iceboxRepo.findTrashedIceboxItems).mockResolvedValue([])
    vi.mocked(planTrash.listTrashedPlanRoots).mockResolvedValueOnce([
      { id: "pl1", name: "Phase 1", status: "in_progress", deletedAt: d("2026-10-06T00:00:00Z"), deletedById: "u1", subtreeCount: 4 },
    ])
    const out = await svc.listProjectTrash("p1", { now: NOW, retentionDays: 30 })
    expect(tr.getI18nFor).toHaveBeenCalledWith("plan_item", ["pl1"])
    expect(out.items).toEqual([
      {
        entityType: "plan_item",
        id: "pl1",
        displayId: null,
        title: "Phase 1",
        titleField: "name",
        status: "in_progress",
        deletedAt: "2026-10-06T00:00:00.000Z",
        deletedBy: { id: "u1", name: "Alice" },
        purgeAt: "2026-11-05T00:00:00.000Z",
        i18n: {},
        subtreeCount: 4,
      },
    ])
  })

  it("dispatches restore / purge by entity type", async () => {
    await svc.restoreTrashItem("p1", "plan_item", "pl1", ACTOR)
    await svc.purgeTrashItem("p1", "plan_item", "pl1", ACTOR)
    expect(planTrash.restorePlanItem).toHaveBeenCalledWith("p1", "pl1", ACTOR)
    expect(planTrash.purgePlanItem).toHaveBeenCalledWith("p1", "pl1", ACTOR)
    await svc.restoreTrashItem("p1", "backlog_item", "b1", ACTOR)
    await svc.restoreTrashItem("p1", "icebox_item", "i1", ACTOR)
    await svc.purgeTrashItem("p1", "backlog_item", "b1", ACTOR)
    await svc.purgeTrashItem("p1", "icebox_item", "i1", ACTOR)
    expect(backlog.restoreBacklogItem).toHaveBeenCalledWith("p1", "b1", ACTOR)
    expect(icebox.restoreIceboxItem).toHaveBeenCalledWith("p1", "i1", ACTOR)
    expect(backlog.purgeBacklogItem).toHaveBeenCalledWith("p1", "b1", ACTOR)
    expect(icebox.purgeIceboxItem).toHaveBeenCalledWith("p1", "i1", ACTOR)
  })

  it("lists trashed projects for the admin trash", async () => {
    vi.mocked(projectsRepo.findTrashedProjects).mockResolvedValue([
      {
        id: "p9",
        name: "Old",
        status: "active",
        deletedAt: d("2026-10-01T00:00:00Z"),
        deletedById: "u1",
        _count: { backlogItems: 4, iceboxItems: 2, sprints: 1 },
      },
    ])
    const out = await svc.listTrashedProjects({ now: NOW, retentionDays: 30 })
    expect(out).toEqual({
      retentionDays: 30,
      projects: [
        {
          id: "p9",
          name: "Old",
          status: "active",
          deletedAt: "2026-10-01T00:00:00.000Z",
          deletedBy: { id: "u1", name: "Alice" },
          purgeAt: "2026-10-31T00:00:00.000Z",
          counts: { backlogItems: 4, iceboxItems: 2, sprints: 1 },
          i18n: {},
        },
      ],
    })
  })
})

describe("parseTrashEntityType", () => {
  it("accepts the project trash entity types only", () => {
    expect(parseTrashEntityType("backlog_item")).toBe("backlog_item")
    expect(parseTrashEntityType("plan_item")).toBe("plan_item")
    expect(parseTrashEntityType("icebox_item")).toBe("icebox_item")
    expect(parseTrashEntityType("project")).toBeNull()
    expect(parseTrashEntityType("")).toBeNull()
  })
})
