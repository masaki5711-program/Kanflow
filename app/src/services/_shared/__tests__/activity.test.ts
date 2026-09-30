import { beforeEach, describe, expect, it, vi } from "vitest"

const warn = vi.fn()
vi.mock("@/lib/logger", () => {
  const log = { debug() {}, info() {}, warn: (...a: unknown[]) => warn(...a), error() {}, child: () => log }
  return { logger: log }
})

const act = await import("../activity")
const { fakeDb } = await import("@/services/__tests__/fake-db")
const { ACTOR } = await import("@/services/__tests__/support")

describe("diffFields", () => {
  it("returns only the changed listed fields", () => {
    const out = act.diffFields({ a: 1, b: "x", c: true }, { a: 2, b: "x", c: true, d: 9 }, ["a", "b", "c"])
    expect(out).toEqual({ a: { from: 1, to: 2 } })
  })

  it("skips fields that are absent / undefined in after", () => {
    expect(act.diffFields({ a: 1 }, { b: 2 }, ["a"])).toEqual({})
    expect(act.diffFields({ a: 1 }, { a: undefined }, ["a"])).toEqual({})
  })

  it("normalizes dates and treats undefined before as null", () => {
    const d = new Date("2026-10-01T00:00:00.000Z")
    expect(act.diffFields({ at: new Date(d) }, { at: d }, ["at"])).toEqual({})
    expect(act.diffFields(null, { at: d }, ["at"])).toEqual({ at: { from: null, to: d.toISOString() } })
  })

  it("stores a changed marker for long text on either side", () => {
    const long = "x".repeat(act.LONG_TEXT_THRESHOLD + 1)
    expect(act.diffFields({ d: "short" }, { d: long }, ["d"])).toEqual({ d: { changed: true } })
    expect(act.diffFields({ d: long }, { d: null }, ["d"])).toEqual({ d: { changed: true } })
    const edge = "y".repeat(act.LONG_TEXT_THRESHOLD)
    expect(act.diffFields({ d: "a" }, { d: edge }, ["d"])).toEqual({ d: { from: "a", to: edge } })
  })
})

describe("normalizeValue", () => {
  it("maps values to JSON-safe scalars", () => {
    expect(act.normalizeValue(undefined)).toBeNull()
    expect(act.normalizeValue(new Date("bad"))).toBeNull()
    expect(act.normalizeValue({ a: 1 })).toBe('{"a":1}')
    expect(act.normalizeValue(false)).toBe(false)
  })
})

describe("classifyUpdate", () => {
  it("status only (with completion comment) → status_change", () => {
    expect(act.classifyUpdate({ status: { from: "todo", to: "done" } })).toBe("status_change")
    expect(act.classifyUpdate({ status: { from: "a", to: "b" }, completionComment: { from: null, to: "ok" } })).toBe("status_change")
  })

  it("assignee only → assign", () => {
    expect(act.classifyUpdate({ assignee: { from: null, to: "Bob" } })).toBe("assign")
    expect(act.classifyUpdate({ assignedPo: { from: "A", to: "B" } })).toBe("assign")
  })

  it("anything else → update", () => {
    expect(act.classifyUpdate({})).toBe("update")
    expect(act.classifyUpdate({ completionComment: { from: null, to: "x" } })).toBe("update")
    expect(act.classifyUpdate({ status: { from: "a", to: "b" }, assignee: { from: null, to: "B" } })).toBe("update")
  })
})

describe("labelOf / serializeDiff", () => {
  it("takes the first line of the label field, cut", () => {
    expect(act.labelOf("pbi", { userStory: "  As a user\nmore" })).toBe("As a user")
    expect(act.labelOf("pbi", { initiative: "Login page", userStory: "As a user" })).toBe("Login page")
    expect(act.labelOf("pbi", { initiative: "  ", userStory: "As a user" })).toBe("As a user")
    expect(act.labelOf("sprint", { sprintName: "" })).toBeUndefined()
    expect(act.labelOf("goal", null)).toBeUndefined()
    const label = act.labelOf("plan_item", { name: "n".repeat(500) })
    expect(label).toHaveLength(act.LABEL_MAX)
    expect(label?.endsWith("…")).toBe(true)
  })

  it("drops empty parts and returns null for nothing", () => {
    expect(act.serializeDiff(null)).toBeNull()
    expect(act.serializeDiff({ changes: {}, meta: {} })).toBeNull()
    expect(JSON.parse(act.serializeDiff({ label: "L", meta: { a: 1 } })!)).toEqual({ label: "L", meta: { a: 1 } })
  })

  it("reduces an oversized diff to changed markers", () => {
    const changes = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`f${i}`, { from: "a".repeat(400), to: "b".repeat(400) }])
    )
    const out = JSON.parse(act.serializeDiff({ changes, label: "L" })!)
    expect(out.label).toBe("L")
    expect(out.changes.f0).toEqual({ changed: true })
    expect(Object.keys(out.changes)).toHaveLength(60)
  })
})

describe("logActivity", () => {
  beforeEach(() => warn.mockClear())

  it("writes one row with actor fields and the serialized diff", async () => {
    const db = fakeDb()
    await act.logActivity(db.client, {
      projectId: "p1",
      entityType: "pbi",
      entityId: "b1",
      action: "update",
      actor: ACTOR,
      diff: { changes: { status: { from: "a", to: "b" } } },
    })
    expect(db.fn("activityLog.create")).toHaveBeenCalledWith({
      data: {
        projectId: "p1",
        entityType: "pbi",
        entityId: "b1",
        action: "update",
        actorId: "u1",
        actorName: "Alice",
        diff: JSON.stringify({ changes: { status: { from: "a", to: "b" } } }),
      },
    })
  })

  it("records the system actor as null", async () => {
    const db = fakeDb()
    await act.logActivity(db.client, { projectId: "p1", entityType: "sprint", entityId: "s", action: "delete", actor: null })
    expect(db.fn("activityLog.create").mock.calls[0][0].data).toMatchObject({ actorId: null, actorName: null, diff: null })
  })

  it("never throws: a failed write is logged", async () => {
    const db = fakeDb()
    db.fn("activityLog.create").mockRejectedValueOnce(new Error("db down"))
    await expect(
      act.logActivity(db.client, { projectId: "p1", entityType: "pbi", entityId: "b", action: "create", actor: ACTOR })
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith("activity log write failed", expect.objectContaining({ error: "db down" }))
  })
})

describe("logCreate / logDelete / logUpdate", () => {
  const ref = { projectId: "p1", entityType: "sprint_task" as const, entityId: "t1", actor: ACTOR }
  const stored = (db: ReturnType<typeof fakeDb>) => JSON.parse(db.fn("activityLog.create").mock.calls[0][0].data.diff)

  it("logCreate stores the non-empty tracked fields and a label", async () => {
    const db = fakeDb()
    await act.logCreate(db.client, { ...ref, row: { id: "t1", taskName: "Write", assignee: null, status: "todo", sortOrder: 3 }, meta: { sprintId: "s1" } })
    expect(db.fn("activityLog.create").mock.calls[0][0].data.action).toBe("create")
    expect(stored(db)).toEqual({
      changes: { taskName: { from: null, to: "Write" }, status: { from: null, to: "todo" } },
      label: "Write",
      meta: { sprintId: "s1" },
    })
  })

  it("logDelete stores removed values; unknown row → label-less bare delete", async () => {
    const db = fakeDb()
    await act.logDelete(db.client, { ...ref, row: { taskName: "Write", status: "done" } })
    expect(stored(db)).toEqual({
      changes: { taskName: { from: "Write", to: null }, status: { from: "done", to: null } },
      label: "Write",
    })
    const db2 = fakeDb()
    await act.logDelete(db2.client, { ...ref, row: null })
    expect(db2.fn("activityLog.create").mock.calls[0][0].data).toMatchObject({ action: "delete", diff: null })
  })

  it("logUpdate classifies and returns the changes", async () => {
    const db = fakeDb()
    const changes = await act.logUpdate(db.client, {
      ...ref,
      before: { taskName: "W", assignee: "A", status: "todo" },
      after: { taskName: "W", assignee: "B", status: "todo" },
    })
    expect(changes).toEqual({ assignee: { from: "A", to: "B" } })
    expect(db.fn("activityLog.create").mock.calls[0][0].data.action).toBe("assign")
  })

  it("logUpdate records nothing when nothing changed", async () => {
    const db = fakeDb()
    const changes = await act.logUpdate(db.client, { ...ref, before: { status: "todo" }, after: { status: "todo" } })
    expect(changes).toEqual({})
    expect(db.fn("activityLog.create")).not.toHaveBeenCalled()
  })

  it("logUpdate with an unknown before records a bare update", async () => {
    const db = fakeDb()
    expect(await act.logUpdate(db.client, { ...ref, before: null, after: { taskName: "W" } })).toEqual({})
    expect(db.fn("activityLog.create").mock.calls[0][0].data.action).toBe("update")
    expect(stored(db)).toEqual({ label: "W" })
  })
})

describe("loadSnapshot", () => {
  it.each([
    ["pbi", "productBacklogItem"],
    ["sprint_task", "sprintBacklogItem"],
    ["sprint", "sprint"],
    ["icebox", "iceboxItem"],
    ["goal", "productGoal"],
    ["release", "releaseBacklogItem"],
    ["plan_item", "planItem"],
    ["member", "projectMember"],
    ["project", "project"],
  ] as const)("%s reads %s by id", async (type, model) => {
    const db = fakeDb({ [`${model}.findUnique`]: { id: "x", k: 1 } })
    await expect(act.loadSnapshot(db.client, type, "x")).resolves.toEqual({ id: "x", k: 1 })
    expect(db.fn(`${model}.findUnique`)).toHaveBeenCalledWith({ where: { id: "x" } })
  })

  it("returns null instead of throwing", async () => {
    const db = fakeDb()
    db.fn("sprint.findUnique").mockRejectedValueOnce(new Error("boom"))
    await expect(act.loadSnapshot(db.client, "sprint", "x")).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith("activity snapshot read failed", expect.anything())
  })
})
