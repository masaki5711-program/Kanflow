import { describe, expect, it } from "vitest"
import { dayToYmd, ymdToDay } from "../lib/date"
import {
  ROW_CENTER,
  ROW_HEIGHT,
  buildArrows,
  dayCenterX,
  dependencyPath,
  isDependencyViolated,
  itemAnchors,
  spanGeometry,
} from "../lib/geometry"
import { buildScale, chartRange, isPlanZoom, ZOOM_DAY_WIDTH } from "../lib/scale"
import { mkItem } from "./fixtures"

describe("chartRange", () => {
  it("covers every date plus today, padded and aligned to the zoom unit", () => {
    const items = [mkItem({ id: "a", plannedStart: "2026-10-07", plannedEnd: "2026-10-20", baselineEnd: "2026-11-02" })]
    const r = chartRange(items, "2026-10-01", "week")
    // today (10/01) - 14 days = 09/17 → aligned to Monday 09/14
    expect(dayToYmd(r.startDay)).toBe("2026-09-14")
    expect(r.startDay + r.days).toBeGreaterThan(ymdToDay("2026-11-02"))
    expect(r.days).toBeGreaterThanOrEqual(120)
  })

  it("month and quarter zoom align to month / quarter starts", () => {
    expect(dayToYmd(chartRange([], "2026-11-17", "month").startDay)).toBe("2026-10-01")
    expect(dayToYmd(chartRange([], "2026-11-17", "quarter").startDay)).toBe("2026-07-01")
  })

  it("isPlanZoom guards URL values", () => {
    expect(isPlanZoom("quarter")).toBe(true)
    expect(isPlanZoom("year")).toBe(false)
  })
})

describe("buildScale tiers", () => {
  const range = { startDay: ymdToDay("2026-09-28"), days: 14 }

  it("day zoom: months on top, day numbers + weekday initials with weekends below", () => {
    const s = buildScale(range, "day", "ja")
    expect(s.top.map((c) => c.label)).toEqual(["2026年9月", "2026年10月"])
    expect(s.top[0].width).toBe(3 * ZOOM_DAY_WIDTH.day)
    expect(s.bottom).toHaveLength(14)
    expect(s.bottom[3]).toMatchObject({ label: "1", sub: "木", x: 3 * 32, width: 32, weekend: false })
    expect(s.bottom[5].weekend).toBe(true)
    expect(s.weekendOffsets).toEqual([5, 6, 12, 13])
    expect(s.width).toBe(14 * 32)
  })

  it("week zoom: ISO week starts", () => {
    const s = buildScale({ startDay: ymdToDay("2026-10-01"), days: 14 }, "week", "ja")
    // first (partial) week starts on Thursday 10/01 but is labelled by its Monday
    expect(s.bottom.map((c) => c.label)).toEqual(["9/28", "10/5", "10/12"])
    expect(s.bottom[0].width).toBe(4 * 14)
    expect(buildScale(range, "week", "en").bottom[1].label).toBe("Oct 5")
  })

  it("month zoom: years + months; quarter zoom: years + quarters", () => {
    const m = buildScale({ startDay: ymdToDay("2026-11-01"), days: 92 }, "month", "en")
    expect(m.top.map((c) => c.label)).toEqual(["2026", "2027"])
    expect(m.bottom.map((c) => c.label)).toEqual(["Nov", "Dec", "Jan"])
    expect(m.weekendOffsets).toEqual([])
    const q = buildScale({ startDay: ymdToDay("2026-07-01"), days: 365 }, "quarter", "en")
    expect(q.bottom.map((c) => c.label)).toEqual(["Q3", "Q4", "Q1", "Q2"])
  })
})

describe("bar geometry", () => {
  const origin = ymdToDay("2026-10-01")

  it("includes the end day", () => {
    expect(spanGeometry("2026-10-01", "2026-10-01", origin, 10)).toEqual({ x: 0, width: 10 })
    expect(spanGeometry("2026-10-03", "2026-10-12", origin, 10)).toEqual({ x: 20, width: 100 })
    // across a month boundary
    expect(spanGeometry("2026-10-30", "2026-11-02", origin, 10).width).toBe(40)
    // end before start collapses to one day
    expect(spanGeometry("2026-10-05", "2026-10-01", origin, 10).width).toBe(10)
  })

  it("milestones sit at the centre of their day", () => {
    expect(dayCenterX("2026-10-02", origin, 10)).toBe(15)
    const ms = mkItem({ id: "m", isMilestone: true, plannedStart: "2026-10-02", plannedEnd: "2026-10-02" })
    expect(itemAnchors(ms, origin, 10)).toEqual({ startX: 15, endX: 15 })
    expect(itemAnchors(mkItem({ id: "a", plannedStart: "2026-10-01", plannedEnd: "2026-10-03" }), origin, 10)).toEqual({ startX: 0, endX: 30 })
  })
})

describe("dependencies", () => {
  const a = mkItem({ id: "a", plannedStart: "2026-10-01", plannedEnd: "2026-10-05" })
  const b = mkItem({ id: "b", plannedStart: "2026-10-06", plannedEnd: "2026-10-09" })
  const early = mkItem({ id: "c", plannedStart: "2026-10-05", plannedEnd: "2026-10-09" })
  const ms = mkItem({ id: "m", isMilestone: true, plannedStart: "2026-10-05", plannedEnd: "2026-10-05" })

  it("detects finish-to-start violations (end-inclusive)", () => {
    expect(isDependencyViolated(a, b)).toBe(false)
    expect(isDependencyViolated(a, early)).toBe(true)
    // milestones are instants
    expect(isDependencyViolated(a, ms)).toBe(false)
    expect(isDependencyViolated(ms, early)).toBe(false)
    expect(isDependencyViolated(b, ms)).toBe(true)
  })

  it("routes straight down when there is room, around otherwise", () => {
    expect(dependencyPath({ x: 50, y: 20 }, { x: 100, y: 60 })).toBe("M 50 20 H 58 V 60 H 100")
    expect(dependencyPath({ x: 50, y: 20 }, { x: 40, y: 60 })).toBe(`M 50 20 H 58 V ${60 - ROW_HEIGHT / 2} H 32 V 60 H 40`)
    expect(dependencyPath({ x: 50, y: 60 }, { x: 40, y: 20 })).toBe(`M 50 60 H 58 V ${20 + ROW_HEIGHT / 2} H 32 V 20 H 40`)
  })

  it("buildArrows uses row positions and skips hidden endpoints", () => {
    const byId = new Map([a, b, early].map((i) => [i.id, i]))
    const rows = new Map([["a", 0], ["b", 2], ["c", 1]])
    const deps = [
      { id: "d1", predecessorId: "a", successorId: "b" },
      { id: "d2", predecessorId: "a", successorId: "c" },
      { id: "d3", predecessorId: "a", successorId: "hidden" },
    ]
    const arrows = buildArrows(deps, byId, rows, ymdToDay("2026-10-01"), 10)
    expect(arrows).toHaveLength(2)
    expect(arrows[0]).toMatchObject({ id: "d1", violated: false })
    expect(arrows[0].d).toBe(dependencyPath({ x: 50, y: ROW_CENTER }, { x: 50, y: 2 * ROW_HEIGHT + ROW_CENTER }))
    expect(arrows[1].violated).toBe(true)
  })
})
