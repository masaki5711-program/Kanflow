import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  userSection: { findMany: vi.fn() },
  project: { findMany: vi.fn(), count: vi.fn() },
  activityLog: { groupBy: vi.fn(), findMany: vi.fn() },
}))
const getI18nFor = vi.hoisted(() => vi.fn())
vi.mock("@/services/_shared/db", () => ({ defaultDb: db }))
vi.mock("@/services/_shared/translations", () => ({ getI18nFor }))

const svc = await import("../project-list")
const activity = await import("@/services/_shared/activity")

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
    db.activityLog.groupBy.mockResolvedValue([])
    db.activityLog.findMany.mockResolvedValue([])
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

describe("project list meta (dates, permission)", () => {
  beforeEach(() => vi.clearAllMocks())

  const fullRow = (id: string, over: Record<string, unknown> = {}) => ({
    ...row(id, false),
    createdAt: new Date("2026-04-12T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    members: [] as { userId: string; role: string }[],
    ...over,
  })

  it("aggregates the latest activity of all listed projects in ONE grouped query", async () => {
    db.activityLog.groupBy.mockResolvedValue([
      { projectId: "p1", _max: { createdAt: new Date("2026-09-20T00:00:00Z") } },
      { projectId: "p2", _max: { createdAt: null } },
    ])
    const out = await svc.loadLastActivity(["p1", "p2"])
    expect(db.activityLog.groupBy).toHaveBeenCalledTimes(1)
    expect(db.activityLog.groupBy).toHaveBeenCalledWith({
      by: ["projectId"],
      where: { projectId: { in: ["p1", "p2"] } },
      _max: { createdAt: true },
    })
    expect(out.get("p1")).toEqual(new Date("2026-09-20T00:00:00Z"))
    expect(out.has("p2")).toBe(false)
  })

  it("skips the queries for an empty list", async () => {
    expect((await svc.loadLastActivity([])).size).toBe(0)
    expect((await svc.loadArchivedAt([])).size).toBe(0)
    expect(db.activityLog.groupBy).not.toHaveBeenCalled()
    expect(db.activityLog.findMany).not.toHaveBeenCalled()
  })

  it("finds the latest active→archived status change per project", async () => {
    db.activityLog.findMany.mockResolvedValue([
      { projectId: "p1", createdAt: new Date("2026-09-30T00:00:00Z") },
      { projectId: "p1", createdAt: new Date("2026-08-01T00:00:00Z") },
      { projectId: "p2", createdAt: new Date("2026-07-01T00:00:00Z") },
    ])
    const out = await svc.loadArchivedAt(["p1", "p2"])
    expect(db.activityLog.findMany).toHaveBeenCalledWith({
      where: {
        projectId: { in: ["p1", "p2"] },
        entityType: "project",
        entityId: { in: ["p1", "p2"] },
        diff: { contains: '"status":{"from":"active","to":"archived"}' },
      },
      orderBy: { createdAt: "desc" },
      select: { projectId: true, createdAt: true },
    })
    expect(out.get("p1")).toEqual(new Date("2026-09-30T00:00:00Z"))
    expect(out.get("p2")).toEqual(new Date("2026-07-01T00:00:00Z"))
  })

  it("last activity is the later of the newest log row and Project.updatedAt", () => {
    const r = fullRow("p1")
    expect(svc.lastActivityOf(r, new Date("2026-09-20T00:00:00Z"))).toEqual(new Date("2026-09-20T00:00:00Z"))
    expect(svc.lastActivityOf(r, new Date("2026-01-01T00:00:00Z"))).toEqual(r.updatedAt)
    expect(svc.lastActivityOf(r, undefined)).toEqual(r.updatedAt)
  })

  it.each([
    ["admin", { ...member, isAdmin: true }, [], true],
    ["PO", member, [{ userId: "u1", role: "po" }], true],
    ["SM", member, [{ userId: "u1", role: "sm" }], true],
    ["Dev", member, [{ userId: "u1", role: "dev" }], false],
    ["section manager (not member)", { ...member, sectionIds: ["s1"] }, [], false],
    ["someone else's PO role", member, [{ userId: "u2", role: "po" }], false],
  ])("canUpdate for %s", (_label, scope, members, expected) => {
    expect(svc.viewerCanUpdate(fullRow("p1", { members }), scope)).toBe(expected)
  })

  it("loadProjectListMeta combines activity, archive date (archived only) and permission", async () => {
    db.activityLog.groupBy.mockResolvedValue([{ projectId: "p1", _max: { createdAt: new Date("2026-09-20T00:00:00Z") } }])
    db.activityLog.findMany.mockResolvedValue([{ projectId: "p1", createdAt: new Date("2026-09-25T00:00:00Z") }])
    const rows = [fullRow("p1", { members: [{ userId: "u1", role: "po" }] })]

    const active = await svc.loadProjectListMeta(rows, member, "active")
    expect(db.activityLog.findMany).not.toHaveBeenCalled()
    expect(active.get("p1")).toEqual({ lastActivityAt: new Date("2026-09-20T00:00:00Z"), archivedAt: null, canUpdate: true })

    const archived = await svc.loadProjectListMeta(rows, member, "archived")
    expect(archived.get("p1")?.archivedAt).toEqual(new Date("2026-09-25T00:00:00Z"))
  })

  it("toProjectListItem exposes the meta (defaults without it)", () => {
    const r = fullRow("p1")
    const meta = { lastActivityAt: new Date("2026-09-20T00:00:00Z"), archivedAt: null, canUpdate: true }
    expect(svc.toProjectListItem(r as never, undefined, meta)).toMatchObject(meta)
    expect(svc.toProjectListItem(r as never, undefined)).toMatchObject({ lastActivityAt: r.updatedAt, archivedAt: null, canUpdate: false })
  })

  it("listArchivedProjects attaches the meta", async () => {
    db.project.findMany.mockResolvedValue([fullRow("p9", { members: [{ userId: "u1", role: "sm" }] })])
    getI18nFor.mockResolvedValue(new Map())
    db.activityLog.groupBy.mockResolvedValue([])
    db.activityLog.findMany.mockResolvedValue([{ projectId: "p9", createdAt: new Date("2026-09-25T00:00:00Z") }])
    const [item] = await svc.listArchivedProjects({ id: "u1", role: "member" })
    expect(item).toMatchObject({ canUpdate: true, archivedAt: new Date("2026-09-25T00:00:00Z"), lastActivityAt: new Date("2026-09-01T00:00:00Z") })
  })
})

describe("archive log contract", () => {
  it("ARCHIVED_DIFF matches what logUpdate stores for an active → archived update", () => {
    const changes = activity.diffFields({ status: "active", name: "P" }, { status: "archived" }, activity.TRACKED_FIELDS.project)
    expect(activity.classifyUpdate(changes)).toBe("status_change")
    expect(activity.serializeDiff({ changes, label: "P" })).toContain(svc.ARCHIVED_DIFF)
  })
})
