import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const rules = await import("../plan.rules")
const { day } = await import("./plan-fixtures")

const existing = (over: Partial<import("../plan.rules").ExistingDates> = {}): import("../plan.rules").ExistingDates => ({
  plannedStart: day("2026-01-01"),
  plannedEnd: day("2026-01-10"),
  actualStart: null,
  actualEnd: null,
  isMilestone: false,
  ...over,
})

describe("plan.rules", () => {
  it("planDateOrThrow / optionalPlanDate", () => {
    expect(rules.planDateOrThrow("2026-03-04")).toEqual(day("2026-03-04"))
    expect(() => rules.planDateOrThrow("2026-02-31")).toThrow(expect.objectContaining({ code: "INVALID_DATE" }))
    expect(rules.optionalPlanDate(undefined)).toBeUndefined()
    expect(rules.optionalPlanDate(null)).toBeNull()
    expect(rules.optionalPlanDate("")).toBeNull()
  })

  it("resolveCreateDates validates the range and collapses milestones", () => {
    expect(rules.resolveCreateDates({ plannedStart: "2026-01-01", plannedEnd: "2026-01-01" })).toEqual({ plannedStart: day("2026-01-01"), plannedEnd: day("2026-01-01") })
    expect(() => rules.resolveCreateDates({ plannedStart: "2026-01-02", plannedEnd: "2026-01-01" })).toThrow(expect.objectContaining({ code: "PLAN_INVALID_RANGE" }))
    expect(rules.resolveCreateDates({ plannedStart: "2026-01-02", plannedEnd: "2026-01-01", isMilestone: true })).toEqual({
      plannedStart: day("2026-01-01"),
      plannedEnd: day("2026-01-01"),
    })
  })

  describe("buildPlanUpdate", () => {
    it("includes only provided fields", () => {
      expect(rules.buildPlanUpdate({}, existing(), false)).toEqual({})
      expect(rules.buildPlanUpdate({ name: "x", actualStart: null, actualEnd: "", plannedStart: "2026-01-02", ownerId: null }, existing(), false)).toEqual({
        name: "x",
        actualStart: null,
        actualEnd: null,
        plannedStart: day("2026-01-02"),
        ownerId: null,
      })
    })

    it("validates the merged planned range", () => {
      expect(() => rules.buildPlanUpdate({ plannedStart: "2026-01-11" }, existing(), false)).toThrow(expect.objectContaining({ code: "PLAN_INVALID_RANGE" }))
      expect(rules.buildPlanUpdate({ plannedStart: "2026-01-11", plannedEnd: "2026-01-20" }, existing(), false)).toEqual({
        plannedStart: day("2026-01-11"),
        plannedEnd: day("2026-01-20"),
      })
    })

    it("validates the merged actual range", () => {
      expect(() => rules.buildPlanUpdate({ actualEnd: "2026-01-01" }, existing({ actualStart: day("2026-01-05") }), false)).toThrow(
        expect.objectContaining({ code: "PLAN_INVALID_RANGE" })
      )
      expect(() => rules.buildPlanUpdate({ actualStart: "bad" }, existing(), false)).toThrow(expect.objectContaining({ code: "INVALID_DATE" }))
    })

    it("parents reject different planned dates but accept the same ones", () => {
      expect(() => rules.buildPlanUpdate({ plannedEnd: "2026-02-01" }, existing(), true)).toThrow(expect.objectContaining({ code: "PLAN_PARENT_DATES_DERIVED" }))
      expect(rules.buildPlanUpdate({ plannedStart: "2026-01-01", plannedEnd: "2026-01-10", name: "n" }, existing(), true)).toEqual({ name: "n" })
    })

    it("a legacy JST-midnight parent date is the same calendar day", () => {
      const legacy = existing({ plannedEnd: day("2026-01-10") })
      expect(rules.buildPlanUpdate({ plannedEnd: "2026-01-10T00:00:00+09:00" }, legacy, true)).toEqual({})
    })

    it("turning into a milestone collapses to the end date; a milestone moves as one day", () => {
      expect(rules.buildPlanUpdate({ isMilestone: true }, existing(), false)).toEqual({
        isMilestone: true,
        plannedStart: day("2026-01-10"),
        plannedEnd: day("2026-01-10"),
      })
      const ms = existing({ plannedStart: day("2026-01-10"), isMilestone: true })
      expect(rules.buildPlanUpdate({ plannedStart: "2026-01-15" }, ms, false)).toEqual({ plannedStart: day("2026-01-15"), plannedEnd: day("2026-01-15") })
      expect(rules.buildPlanUpdate({ name: "m" }, ms, false)).toEqual({ name: "m" })
    })

    it("status 'delayed' was already mapped by the schema; other fields pass through", () => {
      expect(rules.buildPlanUpdate({ status: "on_hold", color: "#fff", sortOrder: 2, progressMode: "manual", notes: null, description: "d", isMilestone: false, parentId: null }, existing(), false)).toEqual({
        status: "on_hold",
        color: "#fff",
        sortOrder: 2,
        progressMode: "manual",
        notes: null,
        description: "d",
        isMilestone: false,
        parentId: null,
      })
    })
  })

  it("assertValidReorder / assertValidParent", () => {
    const tree = [
      { id: "r", parentId: null },
      { id: "a", parentId: "r" },
      { id: "a1", parentId: "a" },
    ]
    expect(() => rules.assertValidReorder(tree, [{ id: "a1", parentId: null, sortOrder: 0 }])).not.toThrow()
    expect(() => rules.assertValidReorder(tree, [{ id: "a", parentId: "a", sortOrder: 0 }])).toThrow(expect.objectContaining({ code: "PLAN_SELF_PARENT" }))
    expect(() => rules.assertValidReorder(tree, [{ id: "a", parentId: "a1", sortOrder: 0 }])).toThrow(expect.objectContaining({ code: "PLAN_CYCLE" }))
    expect(() => rules.assertValidReorder(tree, [{ id: "a1", parentId: "r", sortOrder: 0 }, { id: "a", parentId: "a1", sortOrder: 0 }])).not.toThrow()
    expect(() => rules.assertValidParent(tree, "a", "zz")).toThrow(expect.objectContaining({ code: "PLAN_PARENT_NOT_FOUND" }))
    expect(() => rules.assertValidParent(tree, "a1", "r")).not.toThrow()
  })

  it("collectTrashBatch follows only descendants with the same deletedAt", () => {
    const t1 = new Date("2026-10-01T00:00:00Z")
    const t0 = new Date("2026-09-01T00:00:00Z")
    const rows = [
      { id: "r", parentId: null, deletedAt: t1 },
      { id: "a", parentId: "r", deletedAt: t1 },
      { id: "a1", parentId: "a", deletedAt: t1 },
      { id: "old", parentId: "r", deletedAt: t0 },
      { id: "live", parentId: "r", deletedAt: null },
    ]
    expect(rules.collectTrashBatch(rows, "r").toSorted()).toEqual(["a", "a1", "r"])
    expect(rules.collectTrashBatch(rows, "old")).toEqual(["old"])
    expect(rules.collectTrashBatch(rows, "live")).toEqual([])
    expect(rules.collectTrashBatch(rows, "missing")).toEqual([])
  })
})
