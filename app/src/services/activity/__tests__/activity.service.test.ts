import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../activity.repository")

const repo = await import("../activity.repository")
const svc = await import("../activity.service")
const realRepo = await vi.importActual<typeof import("../activity.repository")>("../activity.repository")
const { DEFAULT_DB } = await import("@/services/__tests__/support")
const { fakeDb } = await import("@/services/__tests__/fake-db")
const { decodeCursor, encodeCursor } = await import("@/services/_shared/cursor")

const AT = new Date("2026-10-01T09:00:00.000Z")
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  projectId: "p1",
  entityType: "pbi",
  entityId: "b1",
  action: "update",
  actorId: "u1",
  actorName: "Old Name",
  diff: JSON.stringify({ changes: { status: { from: "a", to: "b" } }, label: "Story", meta: { displayId: 3 } }),
  createdAt: AT,
  actor: { id: "u1", name: "Alice" },
  ...over,
})

describe("parseDiff / toActivityDto", () => {
  it("parses the stored diff and prefers the live actor", () => {
    expect(svc.toActivityDto(row("a"))).toEqual({
      id: "a",
      projectId: "p1",
      entityType: "pbi",
      entityId: "b1",
      action: "update",
      actor: { id: "u1", name: "Alice" },
      changes: { status: { from: "a", to: "b" } },
      label: "Story",
      meta: { displayId: 3 },
      createdAt: AT.toISOString(),
    })
  })

  it("falls back to the stored actor name; system rows have no actor", () => {
    expect(svc.toActivityDto(row("a", { actor: null })).actor).toEqual({ id: "u1", name: "Old Name" })
    expect(svc.toActivityDto(row("a", { actor: null, actorId: null, actorName: null })).actor).toBeNull()
  })

  it("tolerates missing / malformed diff and keeps project in the user feed", () => {
    expect(svc.parseDiff(null)).toEqual({})
    expect(svc.parseDiff("{")).toEqual({})
    expect(svc.parseDiff("[1]")).toEqual({})
    const dto = svc.toActivityDto(row("a", { diff: null, project: { id: "p1", name: "P" } }))
    expect(dto).toMatchObject({ changes: null, label: null, meta: null, project: { id: "p1", name: "P" } })
  })
})

describe("activity.service pages", () => {
  beforeEach(() => vi.clearAllMocks())

  it("project feed: limit + 1 probe → nextCursor", async () => {
    vi.mocked(repo.findProjectActivity).mockResolvedValue([row("c"), row("b"), row("a")] as never)
    const page = await svc.listProjectActivity("p1", { limit: 2, entityType: "pbi" })
    expect(repo.findProjectActivity).toHaveBeenCalledWith(DEFAULT_DB, "p1", { limit: 2, entityType: "pbi" })
    expect(page.items.map((i) => i.id)).toEqual(["c", "b"])
    expect(decodeCursor(page.nextCursor!)).toEqual({ createdAt: AT, id: "b" })
  })

  it("entity history and user feed", async () => {
    vi.mocked(repo.findEntityActivity).mockResolvedValue([row("a")] as never)
    expect((await svc.listEntityActivity("p1", { entityType: "sprint", entityId: "s1" }, { limit: 10 })).nextCursor).toBeNull()
    expect(repo.findEntityActivity).toHaveBeenCalledWith(DEFAULT_DB, "p1", "sprint", "s1", { limit: 10 })

    vi.mocked(repo.findUserActivity).mockResolvedValue([] as never)
    expect(await svc.listUserActivity("u1", { limit: 10 })).toEqual({ items: [], nextCursor: null })
    expect(repo.findUserActivity).toHaveBeenCalledWith(DEFAULT_DB, "u1", { limit: 10 })
  })
})

describe("withEntityLabels", () => {
  beforeEach(() => vi.clearAllMocks())

  it("looks up names of entries logged without a label, once per type", async () => {
    vi.mocked(repo.findEntityLabelRows).mockResolvedValue({
      pbis: [{ id: "b1", displayId: 12, initiative: "Login", userStory: "As a user" }, { id: "b2", displayId: 13, initiative: null, userStory: "" }],
      tasks: [{ id: "t1", taskName: "Write docs" }],
      sprints: [],
      planItems: [],
    } as never)
    const bare = (id: string, entityType: string, entityId: string) => svc.toActivityDto(row(id, { entityType, entityId, action: "move", diff: null }))
    const items = [bare("a", "pbi", "b1"), bare("b", "pbi", "b1"), bare("c", "pbi", "b2"), bare("d", "sprint_task", "t1"), bare("e", "sprint", "gone"), svc.toActivityDto(row("f"))]
    const out = await svc.withEntityLabels("p1", items)
    expect(out.map((i) => i.label)).toEqual(["Login", "Login", "#13", "Write docs", null, "Story"])
    expect(repo.findEntityLabelRows).toHaveBeenCalledWith(DEFAULT_DB, "p1", { pbi: ["b1", "b2"], sprint_task: ["t1"], sprint: ["gone"], plan_item: [] })
  })

  it("skips the lookup when every entry has a label", async () => {
    const items = [svc.toActivityDto(row("a"))]
    expect(await svc.withEntityLabels("p1", items)).toEqual(items)
    expect(repo.findEntityLabelRows).not.toHaveBeenCalled()
  })
})

describe("activity.repository", () => {
  const cursor = encodeCursor({ createdAt: AT, id: "x" })
  const keyset = { OR: [{ createdAt: { lt: AT } }, { createdAt: AT, id: { lt: "x" } }] }
  const order = [{ createdAt: "desc" }, { id: "desc" }]

  it("project feed filters by project, type and cursor", async () => {
    const db = fakeDb()
    await realRepo.findProjectActivity(db.client, "p1", { limit: 20, entityType: "pbi", cursor })
    expect(db.fn("activityLog.findMany")).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p1", entityType: "pbi", ...keyset }, orderBy: order, take: 21 })
    )
    await realRepo.findProjectActivity(db.client, "p1", { limit: 5 })
    expect(db.fn("activityLog.findMany").mock.calls[1][0].where).toEqual({ projectId: "p1" })
  })

  it("entity history is scoped to the project", async () => {
    const db = fakeDb()
    await realRepo.findEntityActivity(db.client, "p1", "pbi", "b1", { limit: 5 })
    expect(db.fn("activityLog.findMany").mock.calls[0][0].where).toEqual({ projectId: "p1", entityType: "pbi", entityId: "b1" })
  })

  it("user feed: own actions in live projects, with the project name", async () => {
    const db = fakeDb()
    await realRepo.findUserActivity(db.client, "u1", { limit: 5, cursor })
    const args = db.fn("activityLog.findMany").mock.calls[0][0]
    expect(args.where).toEqual({ actorId: "u1", project: { deletedAt: null }, ...keyset })
    expect(args.select.project).toEqual({ select: { id: true, name: true } })
  })
})

describe("withMemberNames (S-12)", () => {
  beforeEach(() => vi.clearAllMocks())

  const member = (id: string, diff: Record<string, unknown>, action = "create") =>
    svc.toActivityDto(row(id, { entityType: "member", entityId: `m-${id}`, action, diff: JSON.stringify(diff) }))

  it("fills meta.userName of member entries logged without it, from the user id label (one query)", async () => {
    vi.mocked(repo.findUserNames).mockResolvedValue([{ id: "u7", name: "Budi" }] as never)
    const items = [
      member("a", { label: "u7" }, "delete"),
      member("b", { label: "u7", meta: { userName: "Kept" } }),
      member("c", { label: "u-gone" }),
      member("d", { label: "u7", meta: { other: 1 } }, "update"),
      svc.toActivityDto(row("e")),
    ]
    const out = await svc.withMemberNames(items)
    expect(out.map((i) => i.meta?.userName ?? null)).toEqual(["Budi", "Kept", null, "Budi", null])
    expect(out[3].meta).toEqual({ other: 1, userName: "Budi" })
    expect(repo.findUserNames).toHaveBeenCalledTimes(1)
    expect(repo.findUserNames).toHaveBeenCalledWith(DEFAULT_DB, ["u7", "u-gone"])
    expect(items[0].meta).toBeNull()
  })

  it("skips the lookup when every member entry is named", async () => {
    const items = [member("a", { label: "u7", meta: { userName: "Budi" } }), svc.toActivityDto(row("b"))]
    expect(await svc.withMemberNames(items)).toEqual(items)
    expect(repo.findUserNames).not.toHaveBeenCalled()
  })

  it("the project feed names members", async () => {
    vi.mocked(repo.findProjectActivity).mockResolvedValue([row("a", { entityType: "member", entityId: "m1", action: "create", diff: JSON.stringify({ label: "u7" }) })] as never)
    vi.mocked(repo.findUserNames).mockResolvedValue([{ id: "u7", name: "Budi" }] as never)
    const page = await svc.listProjectActivity("p1", { limit: 20 })
    expect(page.items[0].meta).toEqual({ userName: "Budi" })
  })
})

describe("activity.repository findUserNames", () => {
  it("selects id and name of the given users", async () => {
    const db = fakeDb()
    await realRepo.findUserNames(db.client, ["u1", "u2"])
    expect(db.fn("user.findMany")).toHaveBeenCalledWith({ where: { id: { in: ["u1", "u2"] } }, select: { id: true, name: true } })
  })
})
