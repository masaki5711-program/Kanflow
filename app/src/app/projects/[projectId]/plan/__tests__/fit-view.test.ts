import { describe, expect, it } from "vitest"
import { ymdToDay } from "../lib/date"
import { anyBarInView, firstViewTarget, fitTarget, liveSpanDays, zoomToFit } from "../lib/fit-view"
import {
  AUTO_NAME_MAX,
  AUTO_NAME_MIN,
  NAME_CELL_CHROME,
  NAME_COLUMN_WIDTH,
  autoNameWidth,
  defaultNameWidth,
  estimateTextWidth,
  resolveNameWidth,
} from "../lib/grid-layout"
import { DEFAULT_COLUMNS } from "../lib/prefs"
import { ZOOM_DAY_WIDTH, chartRange } from "../lib/scale"
import { LEAD_DAYS } from "../lib/viewport"
import { mkItem } from "./fixtures"

const today = "2026-09-30"
/** Visible timeline at 1440 px: chart box 1136 − default grid (240 + period + progress). */
const VISIBLE = 1136 - 472

describe("A3-09 first view: fit everything when the anchored window is empty", () => {
  // The pilot: every unfinished item ended by 07/03, today is 09/30.
  const old = [
    mkItem({ id: "a", plannedStart: "2026-06-01", plannedEnd: "2026-06-20", status: "in_progress", scheduleState: "delayed" }),
    mkItem({ id: "b", plannedStart: "2026-06-10", plannedEnd: "2026-07-03", status: "not_started", scheduleState: "delayed" }),
  ]

  it("the live span covers unfinished items and today (all items when nothing is live)", () => {
    expect(liveSpanDays(old, today)).toEqual({ first: ymdToDay("2026-06-01"), last: ymdToDay(today) })
    const done = mkItem({ id: "d", plannedStart: "2026-01-05", plannedEnd: "2026-02-01", status: "done", scheduleState: "done" })
    expect(liveSpanDays([...old, done], today).first).toBe(ymdToDay("2026-06-01"))
    expect(liveSpanDays([done], today)).toEqual({ first: ymdToDay("2026-01-05"), last: ymdToDay(today) })
  })

  it("zoomToFit picks the most detailed zoom that shows the span", () => {
    expect(zoomToFit(20, 700)).toBe("day")
    expect(zoomToFit(45, 700)).toBe("week")
    expect(zoomToFit(130, 700)).toBe("month")
    expect(zoomToFit(300, 700)).toBe("quarter")
    expect(zoomToFit(5000, 700)).toBe("quarter")
  })

  it("an all-overdue plan opens zoomed out with every bar and today on screen", () => {
    const target = firstViewTarget(old, old, today, "week", VISIBLE, true)
    expect(target.zoom).toBe("month")
    const dw = ZOOM_DAY_WIDTH.month
    const { startDay } = chartRange(old, today, "month")
    expect(anyBarInView(old, startDay, dw, target.left, VISIBLE)).toBe(true)
    // every live bar and today fit inside [left, left + visible)
    expect((ymdToDay("2026-06-01") - startDay) * dw).toBeGreaterThanOrEqual(target.left)
    expect((ymdToDay(today) + 1 - startDay) * dw).toBeLessThanOrEqual(target.left + VISIBLE)
  })

  it("keeps the usual anchor when that window already shows a bar", () => {
    const running = [mkItem({ id: "r", plannedStart: "2026-09-20", plannedEnd: "2026-10-20", status: "in_progress" })]
    const target = firstViewTarget(running, running, today, "week", VISIBLE, true)
    const { startDay } = chartRange(running, today, "week")
    expect(target).toEqual({ zoom: "week", left: (ymdToDay("2026-09-20") - LEAD_DAYS - startDay) * ZOOM_DAY_WIDTH.week })
  })

  it("after the first view a zoom change keeps the user's zoom and only scrolls to the live work", () => {
    const target = firstViewTarget(old, old, today, "week", VISIBLE, false)
    expect(target.zoom).toBe("week")
    const { startDay } = chartRange(old, today, "week")
    expect(anyBarInView(old, startDay, ZOOM_DAY_WIDTH.week, target.left, VISIBLE)).toBe(true)
  })

  it("fitTarget centres a short span and never scrolls before 0", () => {
    const short = [mkItem({ id: "s", plannedStart: "2026-09-28", plannedEnd: "2026-10-02" })]
    const target = fitTarget(short, short, today, VISIBLE)
    expect(target.zoom).toBe("day")
    expect(target.left).toBeGreaterThanOrEqual(0)
    const { startDay } = chartRange(short, today, "day")
    const barX = (ymdToDay("2026-09-28") - startDay) * ZOOM_DAY_WIDTH.day
    // centred: equal room left and right of the span (clamped at the chart start)
    const spanW = (5 + LEAD_DAYS * 2) * ZOOM_DAY_WIDTH.day
    expect(target.left).toBe(Math.max(0, Math.round(barX - LEAD_DAYS * ZOOM_DAY_WIDTH.day - (VISIBLE - spanW) / 2)))
    // with earlier (done) items widening the chart range, the centring is not clamped
    const wide = [mkItem({ id: "d", plannedStart: "2026-08-01", plannedEnd: "2026-08-05", status: "done", scheduleState: "done" }), ...short]
    const centred = fitTarget(wide, short, today, VISIBLE)
    const wideStart = chartRange(wide, today, "day").startDay
    const wideBarX = (ymdToDay("2026-09-28") - wideStart) * ZOOM_DAY_WIDTH.day
    expect(centred.left).toBe(Math.round(wideBarX - LEAD_DAYS * ZOOM_DAY_WIDTH.day - (VISIBLE - spanW) / 2))
    // forced zoom keeps it
    expect(fitTarget(short, short, today, VISIBLE, "month").zoom).toBe("month")
  })
})

describe("A4-06 name column auto width", () => {
  const measure = (text: string) => text.length * 10

  it("fits the longest name incl. indent and chrome, clamped to [200, 360]", () => {
    expect(AUTO_NAME_MIN).toBe(200)
    expect(AUTO_NAME_MAX).toBe(360)
    expect(autoNameWidth([{ depth: 0, text: "Alpha", bold: false, milestone: false }], measure)).toBe(AUTO_NAME_MIN)
    const mid = autoNameWidth([{ depth: 2, text: "x".repeat(15), bold: false, milestone: false }], measure)
    expect(mid).toBe(150 + 28 + NAME_CELL_CHROME)
    expect(autoNameWidth([{ depth: 0, text: "x".repeat(80), bold: true, milestone: false }], measure)).toBe(AUTO_NAME_MAX)
  })

  it("estimates CJK wider than latin text", () => {
    expect(estimateTextWidth("現状の条件マッピング", 14)).toBe(140)
    expect(estimateTextWidth("abcde", 10)).toBeCloseTo(30)
  })

  it("the auto width is the wide-screen default; a splitter value still wins; tablets keep their rule", () => {
    expect(defaultNameWidth(1136, DEFAULT_COLUMNS, { compact: false, auto: 320 })).toBe(320)
    expect(defaultNameWidth(1136, DEFAULT_COLUMNS, { compact: false, auto: null })).toBe(NAME_COLUMN_WIDTH)
    expect(defaultNameWidth(720, [], { compact: false, tablet: true, auto: 320 })).toBeLessThanOrEqual(NAME_COLUMN_WIDTH)
    expect(resolveNameWidth(null, { compact: false, auto: 320, containerWidth: 1136, columns: DEFAULT_COLUMNS })).toBe(320)
    expect(resolveNameWidth(250, { compact: false, auto: 320, containerWidth: 1136, columns: DEFAULT_COLUMNS })).toBe(250)
  })
})
