import { afterEach, describe, expect, it, vi } from "vitest"
import {
  addDays,
  barKeyAction,
  buildFlatTree,
  chartBounds,
  clampDate,
  daysBetween,
  formatYmd,
  shiftPlanDates,
  startOfUtcDay,
  statusBadgeColor,
  statusBarColor,
  ZOOM_DAY_WIDTH,
  type PlanItem,
} from "../lib/plan-utils"

function item(p: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    projectId: "p1",
    parentId: null,
    name: p.id,
    description: null,
    plannedStart: "2026-03-10T00:00:00.000Z",
    plannedEnd: "2026-03-20T00:00:00.000Z",
    actualStart: null,
    actualEnd: null,
    progressPct: 0,
    color: null,
    status: "not_started",
    sortOrder: 0,
    isMilestone: false,
    notes: null,
    ...p,
  }
}

describe("date helpers", () => {
  it("startOfUtcDay truncates to UTC midnight", () => {
    expect(startOfUtcDay(new Date("2026-03-10T23:59:59.999Z")).toISOString()).toBe("2026-03-10T00:00:00.000Z")
  })

  it("daysBetween rounds and is signed", () => {
    const a = new Date("2026-03-10T00:00:00Z")
    expect(daysBetween(a, new Date("2026-03-17T00:00:00Z"))).toBe(7)
    expect(daysBetween(a, new Date("2026-03-09T00:00:00Z"))).toBe(-1)
    expect(daysBetween(a, new Date("2026-03-10T13:00:00Z"))).toBe(1)
    expect(daysBetween(a, a)).toBe(0)
  })

  it("addDays adds (and subtracts) whole days without mutating", () => {
    const a = new Date("2026-03-10T00:00:00Z")
    expect(addDays(a, 3).toISOString()).toBe("2026-03-13T00:00:00.000Z")
    expect(addDays(a, -10).toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(a.toISOString()).toBe("2026-03-10T00:00:00.000Z")
  })

  it("clampDate returns min / max / the date itself", () => {
    const min = new Date("2026-01-01T00:00:00Z")
    const max = new Date("2026-12-31T00:00:00Z")
    const mid = new Date("2026-06-01T00:00:00Z")
    expect(clampDate(new Date("2025-01-01T00:00:00Z"), min, max)).toBe(min)
    expect(clampDate(new Date("2027-01-01T00:00:00Z"), min, max)).toBe(max)
    expect(clampDate(mid, min, max)).toBe(mid)
  })

  it("formatYmd zero-pads and accepts Date or ISO string (local time)", () => {
    expect(formatYmd(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(formatYmd(new Date(2026, 10, 25, 12).toISOString())).toBe("2026-11-25")
  })
})

describe("buildFlatTree", () => {
  const items = [
    item({ id: "b", sortOrder: 2 }),
    item({ id: "a", sortOrder: 1 }),
    item({ id: "a2", parentId: "a", sortOrder: 2 }),
    item({ id: "a1", parentId: "a", sortOrder: 1 }),
    item({ id: "a1x", parentId: "a1", sortOrder: 0 }),
  ]

  it("returns depth-first rows ordered by sortOrder with depth and hasChildren", () => {
    const rows = buildFlatTree(items, new Set())
    expect(rows.map((r) => [r.item.id, r.depth, r.hasChildren])).toEqual([
      ["a", 0, true],
      ["a1", 1, true],
      ["a1x", 2, false],
      ["a2", 1, false],
      ["b", 0, false],
    ])
  })

  it("skips descendants of collapsed items but keeps the collapsed row", () => {
    const rows = buildFlatTree(items, new Set(["a1"]))
    expect(rows.map((r) => r.item.id)).toEqual(["a", "a1", "a2", "b"])
    expect(rows[1].hasChildren).toBe(true)
    expect(buildFlatTree(items, new Set(["a"])).map((r) => r.item.id)).toEqual(["a", "b"])
  })

  it("returns [] for no items and ignores orphans whose parent is missing", () => {
    expect(buildFlatTree([], new Set())).toEqual([])
    expect(buildFlatTree([item({ id: "o", parentId: "missing" })], new Set())).toEqual([])
  })

  it("does not mutate the input order", () => {
    const input = [item({ id: "y", sortOrder: 2 }), item({ id: "x", sortOrder: 1 })]
    buildFlatTree(input, new Set())
    expect(input.map((i) => i.id)).toEqual(["y", "x"])
  })
})

describe("chartBounds", () => {
  afterEach(() => vi.useRealTimers())

  it("falls back to -7 / +28 days around today when there are no items", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-15T10:00:00Z"))
    const { min, max } = chartBounds([])
    expect(min.toISOString()).toBe("2026-05-08T00:00:00.000Z")
    expect(max.toISOString()).toBe("2026-06-12T00:00:00.000Z")
  })

  it("pads planned range by 3 days before and 7 after", () => {
    const { min, max } = chartBounds([
      item({ id: "a", plannedStart: "2026-03-10T05:00:00Z", plannedEnd: "2026-03-20T00:00:00Z" }),
      item({ id: "b", plannedStart: "2026-03-12T00:00:00Z", plannedEnd: "2026-03-25T00:00:00Z" }),
    ])
    expect(min.toISOString()).toBe("2026-03-07T00:00:00.000Z")
    expect(max.toISOString()).toBe("2026-04-01T00:00:00.000Z")
  })

  it("widens the window for actual dates outside the plan", () => {
    const { min, max } = chartBounds([
      item({ id: "a", actualStart: "2026-03-01T00:00:00Z", actualEnd: "2026-04-10T00:00:00Z" }),
      item({ id: "b", actualStart: "2026-03-15T00:00:00Z", actualEnd: "2026-03-16T00:00:00Z" }),
    ])
    expect(min.toISOString()).toBe("2026-02-26T00:00:00.000Z")
    expect(max.toISOString()).toBe("2026-04-17T00:00:00.000Z")
  })
})

describe("status colours", () => {
  it.each([
    ["done", "bg-emerald-700", "bg-emerald-100 text-emerald-700"],
    ["in_progress", "bg-blue-700", "bg-blue-100 text-blue-700"],
    ["delayed", "bg-rose-700", "bg-rose-100 text-rose-700"],
    ["on_hold", "bg-amber-700", "bg-amber-100 text-amber-700"],
    ["not_started", "bg-slate-500", "bg-gray-100 text-gray-700"],
    ["unknown", "bg-slate-500", "bg-gray-100 text-gray-700"],
  ])("%s", (status, bar, badge) => {
    expect(statusBarColor(status)).toBe(bar)
    expect(statusBadgeColor(status)).toBe(badge)
  })

  it("zoom widths shrink from day to month", () => {
    expect(ZOOM_DAY_WIDTH.day).toBeGreaterThan(ZOOM_DAY_WIDTH.week)
    expect(ZOOM_DAY_WIDTH.week).toBeGreaterThan(ZOOM_DAY_WIDTH.month)
  })
})

describe("barKeyAction", () => {
  it.each([
    ["Enter", false, { kind: "open" }],
    [" ", false, { kind: "open" }],
    ["ArrowLeft", false, { kind: "move", deltaDays: -1 }],
    ["ArrowRight", false, { kind: "move", deltaDays: 1 }],
    ["ArrowLeft", true, { kind: "resize", deltaDays: -1 }],
    ["ArrowRight", true, { kind: "resize", deltaDays: 1 }],
  ])("%s (shift=%s)", (key, shift, expected) => {
    expect(barKeyAction(key, shift)).toEqual(expected)
  })

  it("ignores other keys", () => {
    expect(barKeyAction("ArrowUp", false)).toBeNull()
    expect(barKeyAction("a", true)).toBeNull()
  })
})

describe("shiftPlanDates", () => {
  const start = new Date("2026-03-10T00:00:00Z")
  const end = new Date("2026-03-12T00:00:00Z")

  it("moves both ends", () => {
    const r = shiftPlanDates(start, end, "move", -1)!
    expect(r.start.toISOString()).toBe("2026-03-09T00:00:00.000Z")
    expect(r.end.toISOString()).toBe("2026-03-11T00:00:00.000Z")
  })

  it("resizes only the end", () => {
    const r = shiftPlanDates(start, end, "resize", 1)!
    expect(r.start).toBe(start)
    expect(r.end.toISOString()).toBe("2026-03-13T00:00:00.000Z")
  })

  it("allows shrinking down to a same-day range", () => {
    const r = shiftPlanDates(start, addDays(start, 1), "resize", -1)!
    expect(r.end.getTime()).toBe(start.getTime())
  })

  it("never lets the end fall before the start", () => {
    expect(shiftPlanDates(start, start, "resize", -1)).toBeNull()
  })
})
