import { describe, expect, it } from "vitest"
import { dayToYmd, ymdToDay } from "../lib/date"
import { formatCompactRange, formatGridDate } from "../lib/date-format"
import { chainOf, downstreamOf, successorBlocks, upstreamOf } from "../lib/dependency-rules"
import { PRINT_WIDTH, fullPlanRange, printLayout, visibleRange } from "../lib/print"
import { TRAILING_GUTTER_PX, ZOOM_DAY_WIDTH, buildScale, chartRange, zoomForDayWidth } from "../lib/scale"
import { TIER_LABEL_INSET, clampPillX, estimateTextWidth, labelFits, tierLabelInset, todayPillBox } from "../lib/scale-labels"
import { buildFlatTree } from "../lib/tree"
import {
  LEAD_DAYS,
  MAX_ANCHOR_LAG_DAYS,
  TODAY_LEAD_DAYS,
  initialAnchorDay,
  isUnfinished,
  itemSpans,
  offscreenSummary,
  revealScrollLeft,
  todaySide,
} from "../lib/viewport"
import { initialScrollLeft } from "../hooks/use-plan-scroll"
import { mkItem } from "./fixtures"

describe("F-01 initial view and off-screen indicators", () => {
  const today = "2026-09-30"
  const overdue = mkItem({ id: "o", plannedStart: "2026-06-15", plannedEnd: "2026-07-10", scheduleState: "delayed", status: "in_progress" })
  const done = mkItem({ id: "d", plannedStart: "2026-05-01", plannedEnd: "2026-05-20", status: "done", scheduleState: "done" })
  const held = mkItem({ id: "h", plannedStart: "2026-04-01", plannedEnd: "2026-04-10", status: "on_hold", scheduleState: "on_hold" })
  const future = mkItem({ id: "f", plannedStart: "2026-11-01", plannedEnd: "2026-11-10" })

  it("anchors at min(today, earliest unfinished start) − 3 days; done / paused work is ignored", () => {
    expect(isUnfinished(done)).toBe(false)
    expect(isUnfinished(held)).toBe(false)
    // a window wide enough to show today from the anchor (e.g. quarter zoom) keeps the open-work anchor
    expect(initialAnchorDay([done, held, overdue, future], today, 400)).toBe(ymdToDay("2026-06-15") - LEAD_DAYS)
    expect(initialAnchorDay([future], today)).toBe(ymdToDay(today) - LEAD_DAYS)
    expect(initialAnchorDay([done], today)).toBeNull()
  })

  it("N-02: an anchor > 60 days before today that would hide today starts at today − 14 instead", () => {
    // June work, today 9/30, week zoom (≈ 47 visible days): today would be off-screen
    expect(initialAnchorDay([overdue], today, 47)).toBe(ymdToDay(today) - TODAY_LEAD_DAYS)
    expect(initialAnchorDay([overdue], today)).toBe(ymdToDay(today) - TODAY_LEAD_DAYS)
    // phone (≈ 12 visible days): today lands in the first third of the window
    expect(initialAnchorDay([overdue], today, 12)).toBe(ymdToDay(today) - 4)
    // ≤ 60 days behind: the anchor rule stays (the "今日 ▶" pill points at today)
    const recent = mkItem({ id: "r", plannedStart: "2026-08-15", plannedEnd: "2026-09-10", status: "in_progress" })
    expect(ymdToDay(today) - (ymdToDay("2026-08-15") - LEAD_DAYS)).toBeLessThanOrEqual(MAX_ANCHOR_LAG_DAYS)
    expect(initialAnchorDay([recent], today, 12)).toBe(ymdToDay("2026-08-15") - LEAD_DAYS)
    // the older work then sits left of the view → the "◀ n 件" pill counts it
    const startDay = ymdToDay("2026-05-25")
    const spans = itemSpans([overdue], startDay, 14)
    const viewStart = (ymdToDay(today) - TODAY_LEAD_DAYS - startDay) * 14
    expect(offscreenSummary(spans, viewStart, viewStart + 660).before).toBe(1)
  })

  it("N-02: todaySide tells which edge today lies beyond", () => {
    expect(todaySide(50, 100, 400)).toBe("before")
    expect(todaySide(500, 100, 400)).toBe("after")
    expect(todaySide(200, 100, 400)).toBeNull()
  })

  it("initial scrollLeft puts the anchor at the timeline's left edge (today at 1/3 when nothing is open)", () => {
    const geo = { startDay: ymdToDay("2026-06-01"), dayWidth: 14, todayX: 1000, clientWidth: 1200, gridWidth: 300 }
    expect(initialScrollLeft(ymdToDay("2026-06-12"), geo)).toBe(11 * 14)
    expect(initialScrollLeft(ymdToDay("2026-05-20"), geo)).toBe(0)
    expect(initialScrollLeft(null, geo)).toBe(1000 - 300)
  })

  it("counts marks left / right of the visible window and picks the nearest for reveal", () => {
    const startDay = ymdToDay("2026-06-01")
    const spans = itemSpans([overdue, future, mkItem({ id: "m", isMilestone: true, plannedStart: "2026-10-01", plannedEnd: "2026-10-01" })], startDay, 14)
    const view = { start: ymdToDay("2026-09-01") - startDay, end: ymdToDay("2026-10-15") - startDay }
    const off = offscreenSummary(spans, view.start * 14, view.end * 14)
    expect(off).toMatchObject({ before: 1, after: 1 })
    expect(off.nearestBefore?.id).toBe("o")
    expect(off.nearestAfter?.id).toBe("f")
    expect(offscreenSummary(spans, 0, 1e6)).toMatchObject({ before: 0, after: 0, nearestBefore: null, nearestAfter: null })
  })

  it("reveal: short marks start at 1/3 of the window, long ones near the left edge", () => {
    expect(revealScrollLeft({ x: 900, width: 100 }, 600)).toBe(700)
    expect(revealScrollLeft({ x: 900, width: 500 }, 600)).toBe(884)
    expect(revealScrollLeft({ x: 50, width: 10 }, 600)).toBe(0)
  })
})

describe("F-04 print layout", () => {
  const items = [
    mkItem({ id: "a", plannedStart: "2026-05-18", plannedEnd: "2026-06-29" }),
    mkItem({ id: "b", plannedStart: "2026-10-01", plannedEnd: "2026-10-20", baselineEnd: "2026-10-25" }),
  ]

  it("the whole plan (incl. today and October) fits the page width", () => {
    const range = fullPlanRange(items, "2026-09-30")
    expect(dayToYmd(range.startDay)).toBe("2026-05-16")
    expect(dayToYmd(range.startDay + range.days - 1)).toBe("2026-10-27")
    const fit = printLayout(range, 330, "all")
    expect(fit.range.days * fit.dayWidth).toBeLessThanOrEqual(PRINT_WIDTH - 330)
    expect(fit.range.startDay + fit.range.days).toBeGreaterThan(ymdToDay("2026-10-27"))
    expect(fit.zoom).toBe(zoomForDayWidth(fit.dayWidth))
  })

  it("the visible period prints exactly the scrolled window, scaled to the page", () => {
    const range = visibleRange(ymdToDay("2026-05-11"), 14, 14 * 140, 14 * 42)
    expect(dayToYmd(range.startDay)).toBe("2026-09-28")
    expect(range.days).toBe(42)
    const fit = printLayout(range, 330, "visible")
    expect(fit.dayWidth * 42).toBeCloseTo(PRINT_WIDTH - 330)
    expect(fit.range).toEqual(range)
  })

  it("zoom tiers follow the fitted day width; buildScale honours it", () => {
    expect([30, 10, 3, 1].map(zoomForDayWidth)).toEqual(["day", "week", "month", "quarter"])
    const s = buildScale({ startDay: ymdToDay("2026-10-01"), days: 31 }, "month", "en", 10)
    expect(s.width).toBe(310)
    expect(s.bottom[0]).toMatchObject({ label: "Oct", x: 0, width: 310 })
  })
})

describe("F-16 trailing gutter", () => {
  it("the chart range leaves room right of the last date for chips and names", () => {
    const items = [mkItem({ id: "a", plannedStart: "2026-10-01", plannedEnd: "2027-06-01" })]
    for (const zoom of ["day", "week", "month", "quarter"] as const) {
      const r = chartRange(items, "2026-10-01", zoom)
      const endPx = (r.startDay + r.days - ymdToDay("2027-06-01") - 1) * ZOOM_DAY_WIDTH[zoom]
      expect(endPx).toBeGreaterThanOrEqual(TRAILING_GUTTER_PX - ZOOM_DAY_WIDTH[zoom])
    }
  })
})

describe("F-05 today pill vs month labels", () => {
  it("moves a covered label right of the pill; others keep the normal inset", () => {
    const pill = todayPillBox(200, "今日 09/30(水)")
    expect(pill.right - pill.left).toBe(estimateTextWidth("今日 09/30(水)") + 14)
    // October cell starts one day after today: its label would sit under the pill
    const inset = tierLabelInset(207, "2026年10月", pill)
    expect(207 + inset).toBeGreaterThan(pill.right)
    // September cell starts far left: untouched
    expect(tierLabelInset(-200, "2026年9月", pill)).toBe(TIER_LABEL_INSET)
    expect(tierLabelInset(0, "2026年", null)).toBe(TIER_LABEL_INSET)
  })

  it("N-07: the today pill is kept inside the visible timeline while today is in it", () => {
    const label = "今日 09/30(水)"
    const half = (estimateTextWidth(label) + 14) / 2
    const view = { left: 1000, width: 600 }
    // today 2px left of the right edge: the pill shifts inward instead of being clipped
    const x = clampPillX(1598, label, view)!
    expect(x + half).toBeLessThanOrEqual(view.left + view.width)
    expect(clampPillX(1002, label, view)! - half).toBeGreaterThanOrEqual(view.left)
    // mid-view: unchanged; off-screen: hidden (the edge pill takes over); no view (print): unchanged
    expect(clampPillX(1300, label, view)).toBe(1300)
    expect(clampPillX(2000, label, view)).toBeNull()
    expect(clampPillX(990, label, view)).toBeNull()
    expect(clampPillX(1598, label, null)).toBe(1598)
    // a 64px phone peek cannot hold the pill: only the today line shows
    expect(clampPillX(1030, label, { left: 1000, width: 64 })).toBeNull()
  })
})

describe("N-06 scale labels that do not fit are left out (print)", () => {
  it("labelFits compares the estimated text width with the cell", () => {
    expect(labelFits(10, "5月", 14)).toBe(false)
    expect(labelFits(60, "5月", 14)).toBe(true)
    expect(labelFits(20, "2026年", 16)).toBe(false)
    expect(labelFits(200, "2026年", 16)).toBe(true)
  })
})

describe("F-06 compact grid dates", () => {
  it("never needs a second line", () => {
    expect(formatCompactRange("2026-10-01", "2026-10-07", "ja")).toBe("10/01–10/07")
    expect(formatCompactRange("2026-10-01", "2026-10-07", "en")).toBe("Oct 1–7")
    expect(formatCompactRange("2026-10-28", "2026-11-03", "en")).toBe("Oct 28–Nov 3")
    expect(formatCompactRange("2026-10-01", "2026-10-07", "id")).toBe("1–7 Okt")
    expect(formatCompactRange("2026-10-28", "2026-11-03", "id")).toBe("28 Okt–3 Nov")
    expect(formatCompactRange("2026-12-28", "2027-01-03", "ja")).toBe("2026/12/28–2027/01/03")
    expect(formatCompactRange("2026-12-28", "2027-01-03", "en")).toBe("Dec 28, 2026–Jan 3, 2027")
    expect(formatCompactRange("2026-10-05", "2026-10-05", "ja")).toBe("10/05(月)")
    expect(formatGridDate("2026-10-15", "ja")).toBe("10/15(木)")
    expect(formatGridDate("2026-10-15", "en")).toBe("Oct 15")
    expect(formatGridDate("2026-10-15", "id")).toBe("15 Okt")
  })
})

describe("F-11 successor rules", () => {
  const items = [
    mkItem({ id: "P" }),
    mkItem({ id: "P1", parentId: "P" }),
    mkItem({ id: "A" }),
    mkItem({ id: "B" }),
    mkItem({ id: "C" }),
    mkItem({ id: "D" }),
  ]
  const deps = [
    { id: "1", predecessorId: "A", successorId: "B" },
    { id: "2", predecessorId: "B", successorId: "C" },
  ]

  it("upstream = everything that transitively precedes the item", () => {
    expect([...upstreamOf(deps, "C")].sort()).toEqual(["A", "B"])
    expect(upstreamOf([...deps, { id: "3", predecessorId: "C", successorId: "A" }], "A").has("A")).toBe(true)
  })

  it("blocks cycles, parent/child pairs, existing successors and itself", () => {
    const c = successorBlocks(items, deps, "C")
    expect(c.get("A")).toBe("cycle")
    expect(c.get("B")).toBe("cycle")
    expect(c.get("C")).toBe("self")
    expect(c.has("D")).toBe(false)
    expect(successorBlocks(items, deps, "A").get("B")).toBe("existing")
    expect(successorBlocks(items, deps, "P").get("P1")).toBe("hierarchy")
    expect(successorBlocks(items, deps, "P1").get("P")).toBe("hierarchy")
  })

  it("downstream = everything that transitively follows the item", () => {
    expect([...downstreamOf(deps, "A")].sort()).toEqual(["B", "C"])
    expect([...downstreamOf(deps, "C")]).toEqual([])
    expect(downstreamOf([...deps, { id: "3", predecessorId: "C", successorId: "A" }], "A").has("A")).toBe(true)
  })

  it("chainOf: the item plus everything it precedes and follows; null without links or an id", () => {
    expect([...chainOf(deps, "B")!].sort()).toEqual(["A", "B", "C"])
    expect([...chainOf(deps, "A")!].sort()).toEqual(["A", "B", "C"])
    expect(chainOf(deps, "D")).toBeNull()
    expect(chainOf(deps, null)).toBeNull()
    expect(chainOf([], "A")).toBeNull()
  })
})

describe("F-18 row moves", () => {
  it("up / down / indent / outdent only when they apply", () => {
    const rows = buildFlatTree(
      [
        mkItem({ id: "M", isMilestone: true, sortOrder: 1 }),
        mkItem({ id: "A", sortOrder: 2 }),
        mkItem({ id: "A1", parentId: "A", sortOrder: 1 }),
        mkItem({ id: "B", sortOrder: 3 }),
      ],
      new Set(),
    )
    const moves = Object.fromEntries(rows.map((r) => [r.item.id, r.moves]))
    expect(moves.M).toEqual({ up: false, down: true, indent: false, outdent: false })
    // the previous sibling is a milestone: no indent under it
    expect(moves.A).toEqual({ up: true, down: true, indent: false, outdent: false })
    expect(moves.A1).toEqual({ up: false, down: false, indent: false, outdent: true })
    expect(moves.B).toEqual({ up: true, down: false, indent: true, outdent: false })
  })
})
