import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../notifications.repository")
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())

const repo = await import("../notifications.repository")
const svc = await import("../notifications.service")
const realRepo = await vi.importActual<typeof import("../notifications.repository")>("../notifications.repository")
const { DEFAULT_DB, TX } = await import("@/services/__tests__/support")
const { fakeDb } = await import("@/services/__tests__/fake-db")
const { NOTIFICATION_TYPES } = await import("@/services/_shared/notifications")
const tr = await import("@/services/_shared/translations")

const AT = new Date("2026-10-01T09:00:00.000Z")
const NOW = new Date("2026-10-02T00:00:00.000Z")
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: "assigned",
  projectId: "p1",
  entityType: "sprint_task",
  entityId: "t1",
  payload: JSON.stringify({ entityLabel: "Task" }),
  readAt: null,
  createdAt: AT,
  project: { id: "p1", name: "P" },
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("DTO", () => {
  it("parses payload and serializes dates", () => {
    expect(svc.toNotificationDto(row("n", { readAt: NOW }))).toEqual({
      id: "n",
      type: "assigned",
      projectId: "p1",
      project: { id: "p1", name: "P" },
      entityType: "sprint_task",
      entityId: "t1",
      payload: { entityLabel: "Task" },
      readAt: NOW.toISOString(),
      createdAt: AT.toISOString(),
    })
    expect(svc.parsePayload(null)).toEqual({})
    expect(svc.parsePayload("nope")).toEqual({})
    expect(svc.parsePayload('"str"')).toEqual({})
  })
})

describe("notifications.service", () => {
  it("lists a page with the unread count", async () => {
    vi.mocked(repo.findNotifications).mockResolvedValue([row("b"), row("a")] as never)
    vi.mocked(repo.countUnread).mockResolvedValue(5)
    const out = await svc.listMyNotifications("u1", { limit: 1, unreadOnly: true })
    expect(repo.findNotifications).toHaveBeenCalledWith(DEFAULT_DB, "u1", { limit: 1, unreadOnly: true })
    expect(out.items.map((i) => i.id)).toEqual(["b"])
    expect(out.nextCursor).not.toBeNull()
    expect(out.unreadCount).toBe(5)
    expect(await svc.getUnreadCount("u1")).toEqual({ unreadCount: 5 })
  })

  it("reports unread counts per panel tab (A3-08)", async () => {
    vi.mocked(repo.findNotifications).mockResolvedValue([] as never)
    vi.mocked(repo.countUnread).mockImplementation(((_db: unknown, _u: string, group?: string) => Promise.resolve(group === "personal" ? 2 : 7)) as never)
    const out = await svc.listMyNotifications("u1", { limit: 5, unreadOnly: false, group: "personal", state: "unread" })
    expect(repo.findNotifications).toHaveBeenCalledWith(DEFAULT_DB, "u1", { limit: 5, unreadOnly: false, group: "personal", state: "unread" })
    expect(repo.countUnread).toHaveBeenCalledWith(DEFAULT_DB, "u1", "personal")
    expect(out.unreadByGroup).toEqual({ all: 7, personal: 2, other: 5 })
  })

  it("attaches the notified entity's translations so the sentence follows the UI language (A3-08)", async () => {
    vi.mocked(repo.findNotifications).mockResolvedValue([
      row("m", { type: "mentioned", entityType: "pbi", entityId: "b1", payload: JSON.stringify({ entityLabel: "#238 受入", entityType: "pbi", entityId: "b1" }) }),
      row("t"),
      row("x", { entityType: "member", entityId: "m1" }),
      row("d", { type: "due_soon", entityType: "plan_item", entityId: "pl1" }),
    ] as never)
    vi.mocked(repo.countUnread).mockResolvedValue(0)
    const pbi = { userStory: { ja: "受入", id: "Penerimaan", source: "ja", status: "done" } }
    const plan = { name: { ja: "調整", id: "Koordinasi", source: "id", status: "done" } }
    vi.mocked(tr.getI18nFor).mockImplementation(async (entity) =>
      (entity === "backlog_item" ? new Map([["b1", pbi]]) : entity === "plan_item" ? new Map([["pl1", plan]]) : new Map()) as never)
    const out = await svc.listMyNotifications("u1", { limit: 5, unreadOnly: false })
    expect(tr.getI18nFor).toHaveBeenCalledWith("backlog_item", ["b1"])
    expect(tr.getI18nFor).toHaveBeenCalledWith("sprint_task", ["t1"])
    expect(tr.getI18nFor).not.toHaveBeenCalledWith("member", expect.anything())
    expect(out.items[0].entityI18n).toEqual(pbi)
    expect(out.items[1].entityI18n).toBeUndefined()
    // Plan item due notices name the item in the viewer's language too.
    expect(tr.getI18nFor).toHaveBeenCalledWith("plan_item", ["pl1"])
    expect(out.items[3].entityI18n).toEqual(plan)
    vi.mocked(tr.getI18nFor).mockImplementation(async () => new Map())
  })

  it("attaches the project name translations to the listed items (F-06)", async () => {
    vi.mocked(repo.findNotifications).mockResolvedValue([row("a"), row("s", { projectId: null, project: null })] as never)
    vi.mocked(repo.countUnread).mockResolvedValue(0)
    const i18n = { name: { ja: "IoT パイロット", id: "Pilot IoT", source: "id", status: "done" } }
    vi.mocked(tr.getI18nFor).mockResolvedValueOnce(new Map([["p1", i18n]]) as never)
    const out = await svc.listMyNotifications("u1", { limit: 5, unreadOnly: false })
    expect(tr.getI18nFor).toHaveBeenCalledWith("project", ["p1"])
    expect(out.items[0].project).toEqual({ id: "p1", name: "P", i18n })
    expect(out.items[1].project).toBeNull()
  })

  it("markNotificationRead: success, already read (idempotent), foreign → 404", async () => {
    vi.mocked(repo.markRead).mockResolvedValueOnce({ count: 1 })
    await expect(svc.markNotificationRead("u1", "n1", NOW)).resolves.toBeUndefined()
    expect(repo.markRead).toHaveBeenCalledWith(DEFAULT_DB, "u1", "n1", NOW)
    expect(repo.findOwnNotificationId).not.toHaveBeenCalled()

    vi.mocked(repo.markRead).mockResolvedValueOnce({ count: 0 })
    vi.mocked(repo.findOwnNotificationId).mockResolvedValueOnce({ id: "n1" })
    await expect(svc.markNotificationRead("u1", "n1")).resolves.toBeUndefined()

    vi.mocked(repo.markRead).mockResolvedValueOnce({ count: 0 })
    vi.mocked(repo.findOwnNotificationId).mockResolvedValueOnce(null)
    await expect(svc.markNotificationRead("u1", "theirs")).rejects.toMatchObject({ status: 404 })
  })

  it("markAllNotificationsRead returns the count", async () => {
    vi.mocked(repo.markAllRead).mockResolvedValue({ count: 3 })
    expect(await svc.markAllNotificationsRead("u1", NOW)).toEqual({ updated: 3 })
    expect(repo.markAllRead).toHaveBeenCalledWith(DEFAULT_DB, "u1", NOW)
  })

  it("preferences: every type, missing = enabled; update upserts in one transaction", async () => {
    vi.mocked(repo.findPreferences).mockResolvedValue([{ type: "due_soon", enabled: false }, { type: "assigned", enabled: true }])
    const out = await svc.getNotificationPreferences("u1")
    expect(out.preferences).toHaveLength(NOTIFICATION_TYPES.length)
    expect(out.preferences.find((p) => p.type === "due_soon")).toEqual({ type: "due_soon", enabled: false })
    expect(out.preferences.find((p) => p.type === "overdue")).toEqual({ type: "overdue", enabled: true })

    await svc.updateNotificationPreferences("u1", { preferences: [{ type: "overdue", enabled: false }] })
    expect(repo.upsertPreference).toHaveBeenCalledWith(TX, "u1", "overdue", false)
  })
})

describe("notifications.repository", () => {
  it("list: mine, optional unread filter, hides trashed projects, newest first", async () => {
    const db = fakeDb()
    await realRepo.findNotifications(db.client, "u1", { limit: 10, unreadOnly: true })
    const args = db.fn("notification.findMany").mock.calls[0][0]
    expect(args.where).toEqual({
      recipientId: "u1",
      readAt: null,
      AND: [{ OR: [{ projectId: null }, { project: { deletedAt: null } }] }, {}],
    })
    expect(args.take).toBe(11)
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }])
  })

  it("list: tab and read-state filters (A3-08)", async () => {
    const db = fakeDb()
    await realRepo.findNotifications(db.client, "u1", { limit: 10, unreadOnly: false, group: "personal", state: "read" })
    const args = db.fn("notification.findMany").mock.calls[0][0]
    expect(args.where.readAt).toEqual({ not: null })
    expect(args.where.type).toEqual({ in: ["mentioned", "assigned", "comment"] })
    await realRepo.findNotifications(db.client, "u1", { limit: 10, unreadOnly: false, group: "other", state: "unread" })
    const other = db.fn("notification.findMany").mock.calls[1][0]
    expect(other.where.readAt).toBeNull()
    expect(other.where.type).toEqual({ notIn: ["mentioned", "assigned", "comment"] })
    await realRepo.countUnread(db.client, "u1", "personal")
    expect(db.fn("notification.count").mock.calls[0][0].where.type).toEqual({ in: ["mentioned", "assigned", "comment"] })
  })

  it("count / mark read are scoped to the recipient", async () => {
    const db = fakeDb()
    await realRepo.countUnread(db.client, "u1")
    expect(db.fn("notification.count")).toHaveBeenCalledWith({
      where: { recipientId: "u1", readAt: null, OR: [{ projectId: null }, { project: { deletedAt: null } }] },
    })
    await realRepo.markRead(db.client, "u1", "n1", NOW)
    expect(db.fn("notification.updateMany")).toHaveBeenCalledWith({
      where: { id: "n1", recipientId: "u1", readAt: null },
      data: { readAt: NOW },
    })
    await realRepo.markAllRead(db.client, "u1", NOW)
    expect(db.fn("notification.updateMany")).toHaveBeenLastCalledWith({ where: { recipientId: "u1", readAt: null }, data: { readAt: NOW } })
    await realRepo.findOwnNotificationId(db.client, "u1", "n1")
    expect(db.fn("notification.findFirst")).toHaveBeenCalledWith({ where: { id: "n1", recipientId: "u1" }, select: { id: true } })
  })

  it("preferences read / upsert", async () => {
    const db = fakeDb()
    await realRepo.findPreferences(db.client, "u1")
    expect(db.fn("notificationPreference.findMany")).toHaveBeenCalledWith({ where: { userId: "u1" }, select: { type: true, enabled: true } })
    await realRepo.upsertPreference(db.client, "u1", "assigned", false)
    expect(db.fn("notificationPreference.upsert")).toHaveBeenCalledWith({
      where: { userId_type: { userId: "u1", type: "assigned" } },
      create: { userId: "u1", type: "assigned", enabled: false },
      update: { enabled: false },
    })
  })
})
