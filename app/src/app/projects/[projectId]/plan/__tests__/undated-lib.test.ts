/** Client plan helpers with 日程未定 (undated) items. */
import { describe, expect, it } from "vitest"
import { buildArrows, isDependencyViolated, itemAnchors } from "../lib/geometry"
import { itemSpans, initialAnchorDay } from "../lib/viewport"
import { liveSpanDays } from "../lib/fit-view"
import { ymdToDay } from "../lib/date"
import { buildCreateInput, buildPatch, formFromItem, validateForm } from "../lib/plan-form"
import { normalizeItem } from "../lib/normalize"
import { mkItem } from "./fixtures"

const undated = mkItem({ id: "u", plannedStart: null, plannedEnd: null, scheduleState: "on_track", status: "in_progress" })
const dated = mkItem({ id: "d", plannedStart: "2026-10-01", plannedEnd: "2026-10-03" })
const flags = { datesDerived: false, statusDerived: false, statusManualUntilLinked: false }

describe("timeline geometry skips undated rows", () => {
  it("no anchors, no spans, no arrows, never a violation", () => {
    expect(itemAnchors(undated, 0, 10)).toBeNull()
    expect(itemSpans([undated, dated], ymdToDay("2026-10-01"), 10).map((s) => s.id)).toEqual(["d"])
    expect(isDependencyViolated(dated, undated)).toBe(false)
    const byId = new Map([undated, dated].map((i) => [i.id, i]))
    const rows = new Map([["u", 0], ["d", 1]])
    expect(buildArrows([{ id: "x", predecessorId: "d", successorId: "u" }], byId, rows, 0, 10)).toEqual([])
  })

  it("first-view anchor and fit range ignore undated items", () => {
    expect(initialAnchorDay([undated], "2026-10-10")).toBeNull()
    const today = "2026-10-10"
    expect(liveSpanDays([undated], today)).toEqual({ first: ymdToDay(today), last: ymdToDay(today) })
  })
})

describe("plan editor form with empty dates", () => {
  it("empty start and end = undated (valid); a start without an end is an error", () => {
    const form = formFromItem(undated)
    expect(form.plannedStart).toBe("")
    expect(validateForm(form, flags)).toEqual({})
    expect(validateForm({ ...form, plannedStart: "2026-10-01" }, flags)).toEqual({ plannedEndRequired: true })
    expect(validateForm({ ...form, plannedEnd: "2026-10-01" }, flags)).toEqual({ plannedStart: true })
    expect(validateForm({ ...form, isMilestone: true }, flags)).toEqual({})
  })

  it("sends null for cleared dates and both dates once set", () => {
    const cleared = buildPatch(dated, { ...formFromItem(dated), plannedStart: "", plannedEnd: "" })
    expect(cleared).toEqual({ plannedStart: null, plannedEnd: null })
    const set = buildPatch(undated, { ...formFromItem(undated), plannedStart: "2026-11-01", plannedEnd: "2026-11-05" })
    expect(set).toEqual({ plannedStart: "2026-11-01", plannedEnd: "2026-11-05" })
    expect(buildCreateInput({ ...formFromItem(undated), name: "x" })).toMatchObject({ plannedStart: null, plannedEnd: null })
  })

  it("normalizeItem keeps null dates and the template fields", () => {
    expect(normalizeItem({ id: "a", plannedStart: null, plannedEnd: null, durationDays: 5, templateApplicationId: "app1" })).toMatchObject({
      plannedStart: null,
      plannedEnd: null,
      durationDays: 5,
      templateApplicationId: "app1",
    })
  })
})
