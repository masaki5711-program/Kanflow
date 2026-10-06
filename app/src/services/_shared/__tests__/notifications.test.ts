import { beforeEach, describe, expect, it, vi } from "vitest"

const warn = vi.fn()
vi.mock("@/lib/logger", () => {
  const log = { debug() {}, info() {}, warn: (...a: unknown[]) => warn(...a), error() {}, child: () => log }
  return { logger: log }
})

const publishAfterCommit = vi.fn()
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: (...a: unknown[]) => publishAfterCommit(...a) }))

const n = await import("../notifications")
const { fakeDb } = await import("@/services/__tests__/fake-db")

const user = (id: string, enabled?: boolean) => ({
  id,
  notificationPrefs: enabled === undefined ? [] : [{ enabled }],
})

describe("candidateRecipients", () => {
  it("dedupes, drops blanks and the actor", () => {
    expect(n.candidateRecipients(["a", "b", "a", "", "me"], "me")).toEqual(["a", "b"])
    expect(n.candidateRecipients(["a"], null)).toEqual(["a"])
  })
})

describe("notify", () => {
  beforeEach(() => {
    warn.mockClear()
    publishAfterCommit.mockClear()
  })

  it("publishes one 'notification' real-time event to the eligible recipients (ids only, no payload)", async () => {
    const db = fakeDb({ "user.findMany": [user("a"), user("b", false)], "notification.createMany": { count: 1 } })
    await n.notify(db.client, { recipientIds: ["a", "b"], actorId: "me", type: "mentioned", projectId: "p1", entityType: "pbi", entityId: "b1", payload: { excerpt: "secret" } })
    expect(publishAfterCommit).toHaveBeenCalledTimes(1)
    expect(publishAfterCommit).toHaveBeenCalledWith({ type: "notification", userIds: ["a"], projectId: "p1", entityType: "pbi", entityId: "b1", action: "mentioned", actorId: "me" })
  })

  it("publishes nothing when no row was created (all duplicates / nobody eligible)", async () => {
    const db = fakeDb({ "user.findMany": [user("a")], "notification.createMany": { count: 0 } })
    await n.notify(db.client, { recipientIds: ["a"], type: "assigned", dedupeKey: "k" })
    expect(publishAfterCommit).not.toHaveBeenCalled()
  })

  it("inserts one row per eligible recipient with skipDuplicates", async () => {
    const db = fakeDb({
      "user.findMany": [user("a"), user("b", true), user("c", false)],
      "notification.createMany": { count: 2 },
    })
    const out = await n.notify(db.client, {
      recipientIds: ["a", "b", "c", "d", "actor"],
      actorId: "actor",
      type: "assigned",
      projectId: "p1",
      entityType: "sprint_task",
      entityId: "t1",
      payload: { entityLabel: "Task" },
      dedupeKey: "k1",
    })
    expect(out).toBe(2)
    expect(db.fn("user.findMany")).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b", "c", "d"] }, isActive: true },
      select: { id: true, notificationPrefs: { where: { type: "assigned" }, select: { enabled: true } } },
    })
    const arg = db.fn("notification.createMany").mock.calls[0][0]
    expect(arg.skipDuplicates).toBe(true)
    expect(arg.data.map((r: { recipientId: string }) => r.recipientId)).toEqual(["a", "b"])
    expect(arg.data[0]).toEqual({
      recipientId: "a",
      type: "assigned",
      projectId: "p1",
      entityType: "sprint_task",
      entityId: "t1",
      payload: JSON.stringify({ entityLabel: "Task" }),
      dedupeKey: "k1",
    })
  })

  it("does nothing when only the actor is a recipient", async () => {
    const db = fakeDb()
    expect(await n.notify(db.client, { recipientIds: ["me"], actorId: "me", type: "assigned" })).toBe(0)
    expect(db.fn("user.findMany")).not.toHaveBeenCalled()
  })

  it("does not insert when nobody is eligible; nullable fields default to null", async () => {
    const db = fakeDb({ "user.findMany": [user("a", false)] })
    expect(await n.notify(db.client, { recipientIds: ["a"], type: "overdue" })).toBe(0)
    expect(db.fn("notification.createMany")).not.toHaveBeenCalled()

    const db2 = fakeDb({ "user.findMany": [user("a")], "notification.createMany": { count: 1 } })
    await n.notify(db2.client, { recipientIds: ["a"], type: "overdue" })
    expect(db2.fn("notification.createMany").mock.calls[0][0].data[0]).toMatchObject({
      projectId: null,
      entityType: null,
      entityId: null,
      payload: null,
      dedupeKey: null,
    })
  })

  it("never throws: lookup failure → 0", async () => {
    const db = fakeDb()
    db.fn("user.findMany").mockRejectedValueOnce(new Error("down"))
    expect(await n.notify(db.client, { recipientIds: ["a"], type: "assigned" })).toBe(0)
    expect(warn).toHaveBeenCalledWith("notification recipient lookup failed", expect.anything())
  })

  it("a failing channel does not stop the others", async () => {
    const db = fakeDb({ "user.findMany": [user("a")], "notification.createMany": { count: 1 } })
    const broken = { name: "email", deliver: vi.fn(async () => Promise.reject(new Error("smtp"))) }
    const out = await n.notify(db.client, { recipientIds: ["a"], type: "assigned" }, [broken, n.inAppChannel])
    expect(out).toBe(1)
    expect(broken.deliver).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith("notification delivery failed", expect.objectContaining({ channel: "email" }))
  })

  it("inAppChannel skips an empty batch", async () => {
    const db = fakeDb()
    expect(await n.inAppChannel.deliver(db.client, [])).toBe(0)
    expect(db.fn("notification.createMany")).not.toHaveBeenCalled()
  })
})

describe("projectMemberIds", () => {
  it("filters by role when given", async () => {
    const db = fakeDb({ "projectMember.findMany": [{ userId: "a" }, { userId: "b" }] })
    expect(await n.projectMemberIds(db.client, "p1", ["po", "sm"])).toEqual(["a", "b"])
    expect(db.fn("projectMember.findMany")).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p1", role: { in: ["po", "sm"] } }, select: { userId: true } })
    )
    await n.projectMemberIds(db.client, "p1")
    expect(db.fn("projectMember.findMany").mock.calls[1][0].where).toEqual({ projectId: "p1" })
  })

  it("returns [] on failure", async () => {
    const db = fakeDb()
    db.fn("projectMember.findMany").mockRejectedValueOnce(new Error("x"))
    expect(await n.projectMemberIds(db.client, "p1")).toEqual([])
  })
})

describe("resolveAssigneeUserIds / newlyAssignedUserIds", () => {
  const members = [
    { userId: "u-taro", user: { name: "Taro Yamada" } },
    { userId: "u-hana", user: { name: "Hanako" } },
  ]

  it("resolves names against project members", async () => {
    const db = fakeDb({ "projectMember.findMany": members })
    expect(await n.resolveAssigneeUserIds(db.client, "p1", "taro yamada, Nobody")).toEqual(["u-taro"])
    expect(await n.resolveAssigneeUserIds(db.client, "p1", "  ")).toEqual([])
  })

  it("returns [] on failure", async () => {
    const db = fakeDb()
    db.fn("projectMember.findMany").mockRejectedValueOnce(new Error("x"))
    expect(await n.resolveAssigneeUserIds(db.client, "p1", "Hanako")).toEqual([])
  })

  it("only users that were not assigned before", async () => {
    const db = fakeDb({ "projectMember.findMany": members })
    expect(await n.newlyAssignedUserIds(db.client, "p1", "Hanako", "Taro Yamada")).toEqual(["u-taro"])
    expect(await n.newlyAssignedUserIds(db.client, "p1", null, "Hanako")).toEqual(["u-hana"])
  })

  it("no lookup when unassigned or unchanged", async () => {
    const db = fakeDb({ "projectMember.findMany": members })
    expect(await n.newlyAssignedUserIds(db.client, "p1", "Hanako", null)).toEqual([])
    expect(await n.newlyAssignedUserIds(db.client, "p1", "Hanako", "Hanako")).toEqual([])
    expect(db.fn("projectMember.findMany")).not.toHaveBeenCalled()
  })
})
