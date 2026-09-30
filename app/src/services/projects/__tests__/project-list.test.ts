import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  userSection: { findMany: vi.fn() },
  project: { findMany: vi.fn(), count: vi.fn() },
}))
const getI18nFor = vi.hoisted(() => vi.fn())
vi.mock("@/services/_shared/db", () => ({ defaultDb: db }))
vi.mock("@/services/_shared/translations", () => ({ getI18nFor }))

const svc = await import("../project-list")

const member = { userId: "u1", isAdmin: false, sectionIds: [] }

const row = (id: string, fav: boolean) => ({
  id,
  name: id,
  members: [],
  sections: [{ section: { id: "s1", name: "Sec" } }],
  favoritedBy: fav ? [{ userId: "u1" }] : [],
  aiReports: [],
  _count: { iceboxItems: 0, backlogItems: 0, sprints: 0, aiReports: 0 },
})

describe("project list scope", () => {
  beforeEach(() => vi.clearAllMocks())

  it("members see their own projects", () => {
    expect(svc.projectListWhere(member, "archived")).toEqual({ members: { some: { userId: "u1" } }, status: "archived", deletedAt: null })
  })

  it("admins see every live project", () => {
    expect(svc.projectListWhere({ ...member, isAdmin: true }, "active")).toEqual({ status: "active", deletedAt: null })
  })

  it("section managers also see their sections' projects", () => {
    expect(svc.projectListWhere({ ...member, sectionIds: ["a"] }, "active")).toEqual({
      status: "active",
      deletedAt: null,
      OR: [{ members: { some: { userId: "u1" } } }, { sections: { some: { sectionId: { in: ["a"] } } } }],
    })
  })

  it("loads sections only for section managers", async () => {
    db.userSection.findMany.mockResolvedValue([{ sectionId: "a" }])
    expect(await svc.loadProjectListScope({ id: "u1", role: "section_manager" })).toEqual({ userId: "u1", isAdmin: false, sectionIds: ["a"] })
    expect(await svc.loadProjectListScope({ id: "u1", role: "admin" })).toEqual({ userId: "u1", isAdmin: true, sectionIds: [] })
    expect(db.userSection.findMany).toHaveBeenCalledTimes(1)
  })

  it("counts without loading rows", async () => {
    db.project.count.mockResolvedValue(3)
    expect(await svc.countProjectList(member, "archived")).toBe(3)
    expect(db.project.count).toHaveBeenCalledWith({ where: svc.projectListWhere(member, "archived") })
  })

  it("the card include filters trashed children and the viewer's favorite", () => {
    const include = svc.projectListInclude("u9")
    expect(include.favoritedBy).toEqual({ where: { userId: "u9" }, select: { userId: true } })
    expect(include._count.select.backlogItems).toEqual({ where: { deletedAt: null } })
    expect(include._count.select.iceboxItems).toEqual({ where: { deletedAt: null } })
  })
})

describe("listArchivedProjects", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns flattened archived projects with i18n, newest first", async () => {
    db.project.findMany.mockResolvedValue([row("p9", true), row("p8", false)])
    getI18nFor.mockResolvedValue(new Map([["p9", { name: { en: "Nine" } }]]))
    const out = await svc.listArchivedProjects({ id: "u1", role: "member" })
    expect(db.project.findMany).toHaveBeenCalledWith({
      where: { members: { some: { userId: "u1" } }, status: "archived", deletedAt: null },
      include: svc.projectListInclude("u1"),
      orderBy: { updatedAt: "desc" },
    })
    expect(getI18nFor).toHaveBeenCalledWith("project", ["p9", "p8"])
    expect(out[0]).toMatchObject({ id: "p9", isFavorite: true, sections: [{ id: "s1", name: "Sec" }], i18n: { name: { en: "Nine" } } })
    expect(out[1]).toMatchObject({ isFavorite: false, i18n: {} })
  })
})
