// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { normalizePlanData } from "../lib/normalize"
import { DEFAULT_PREFS, loadPrefs, parsePrefs, prefsKey, savePrefs } from "../lib/prefs"
import { barFillClass, itemBadge, milestoneClass, scheduleLabel, sprintBandClass, statusLabel } from "../lib/status"
import { installMemoryStorage, mkItem } from "./fixtures"

const t = getTranslations("en")

describe("normalizePlanData", () => {
  it("reads the contract shape and derives hasChildren locally", () => {
    const data = normalizePlanData({
      today: "2026-10-01",
      items: [
        { id: "p", name: "P", plannedStart: "2026-10-01", plannedEnd: "2026-10-05", status: "in_progress", scheduleState: "at_risk", version: 3 },
        { id: "c", parentId: "p", name: "C", plannedStart: "2026-10-02", plannedEnd: "2026-10-01", progressPct: 140 },
      ],
      dependencies: [
        { id: "d", predecessorId: "p", successorId: "c" },
        { id: "x", predecessorId: "p", successorId: "gone" },
      ],
    })
    expect(data.today).toBe("2026-10-01")
    expect(data.items[0]).toMatchObject({ hasChildren: true, scheduleState: "at_risk", version: 3, progressMode: "manual" })
    // end before start is clamped; progress clamped to 100
    expect(data.items[1]).toMatchObject({ plannedEnd: "2026-10-02", progressPct: 100, hasChildren: false, scheduleState: "not_started" })
    expect(data.dependencies.map((d) => d.id)).toEqual(["d"])
  })

  it("accepts the legacy array with ISO dates and a stored 'delayed' status", () => {
    const data = normalizePlanData(
      [
        { id: "a", name: "A", plannedStart: "2026-03-10T00:00:00.000Z", plannedEnd: "2026-03-20T00:00:00.000Z", status: "delayed" },
        { id: "b", name: "B", plannedStart: "bad", status: "done" },
        { id: "c", name: "C", plannedStart: "2026-03-10", status: "weird" },
        null,
      ],
      new Date(2026, 9, 1, 12),
    )
    expect(data.today).toBe("2026-10-01")
    expect(data.items[0]).toMatchObject({ plannedStart: "2026-03-10", status: "in_progress", scheduleState: "delayed" })
    expect(data.items[1]).toMatchObject({ plannedStart: "2026-10-01", scheduleState: "done" })
    expect(data.items[2]).toMatchObject({ status: "not_started" })
    expect(normalizePlanData(null).items).toEqual([])
  })

  it("maps in_progress without a schedule state to on_track", () => {
    expect(normalizePlanData([{ id: "a", status: "in_progress", plannedStart: "2026-10-01" }]).items[0].scheduleState).toBe("on_track")
    expect(normalizePlanData([{ id: "b", status: "on_hold", plannedStart: "2026-10-01" }]).items[0].scheduleState).toBe("on_hold")
    expect(normalizePlanData({ items: [{ id: "c", status: "on_hold", scheduleState: "on_hold", plannedStart: "2026-10-01" }] }).items[0].scheduleState).toBe("on_hold")
  })
})

describe("prefs (localStorage)", () => {
  let storage: Storage
  beforeEach(() => {
    storage = installMemoryStorage()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("parses defensively", () => {
    expect(parsePrefs(null)).toBe(DEFAULT_PREFS)
    expect(parsePrefs("{bad")).toBe(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ collapsed: ["a", 1], hiddenColumns: ["owner", "nope"], gridCollapsed: true }))).toEqual({
      collapsed: ["a"],
      hiddenColumns: ["owner"],
      gridCollapsed: true,
    })
  })

  it("round-trips and survives storage failures", () => {
    savePrefs("p1", { collapsed: ["x"], hiddenColumns: [], gridCollapsed: false })
    expect(window.localStorage.getItem(prefsKey("p1"))).toContain("x")
    expect(loadPrefs("p1").collapsed).toEqual(["x"])
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    // blocked storage: defaults, then an in-memory copy for this page session
    expect(loadPrefs("p1")).toBe(DEFAULT_PREFS)
    expect(() => savePrefs("p1", { ...DEFAULT_PREFS, collapsed: ["y"] })).not.toThrow()
    expect(loadPrefs("p1").collapsed).toEqual(["y"])
  })
})

describe("status presentation", () => {
  it("labels and tones", () => {
    expect(statusLabel(t, "in_progress")).toBe(t.planStatusInProgress)
    expect(statusLabel(t, "done")).toBe(t.planStatusDone)
    expect(statusLabel(t, "on_hold")).toBe(t.planStatusOnHold)
    expect(statusLabel(t, "not_started")).toBe(t.planStatusNotStarted)
    expect(scheduleLabel(t, "at_risk")).toBe(t.planScheduleAtRisk)
    expect(scheduleLabel(t, "on_track")).toBe(t.planScheduleOnTrack)
    expect(scheduleLabel(t, "delayed")).toBe(t.planStatusDelayed)
    expect(scheduleLabel(t, "done")).toBe(t.planStatusDone)
    expect(scheduleLabel(t, "not_started")).toBe(t.planStatusNotStarted)
    expect(scheduleLabel(t, "on_hold")).toBe(t.planStatusOnHold)
    expect(itemBadge(t, mkItem({ id: "a", status: "on_hold", scheduleState: "on_hold" }))).toEqual({ label: t.planStatusOnHold, tone: "neutral" })
    expect(itemBadge(t, mkItem({ id: "a", status: "on_hold", scheduleState: "delayed" }))).toEqual({ label: t.planStatusOnHold, tone: "neutral" })
    expect(itemBadge(t, mkItem({ id: "a", scheduleState: "delayed" })).tone).toBe("danger")
  })

  it("fills use kit tokens", () => {
    expect(barFillClass({ status: "in_progress", scheduleState: "delayed" })).toBe("bg-danger")
    expect(barFillClass({ status: "in_progress", scheduleState: "at_risk" })).toBe("bg-warning")
    expect(barFillClass({ status: "on_hold", scheduleState: "on_track" })).toContain("plan-hatch")
    expect(milestoneClass({ scheduleState: "done" })).toBe("text-success")
    expect(milestoneClass({ scheduleState: "delayed" })).toBe("text-danger")
    expect(milestoneClass({ scheduleState: "at_risk" })).toBe("text-warning")
    expect(milestoneClass({ scheduleState: "on_track" })).toBe("text-plan-milestone")
    expect(barFillClass({ status: "on_hold", scheduleState: "on_hold" })).toBe("bg-fg-muted plan-hatch")
    expect(milestoneClass({ scheduleState: "on_hold" })).toBe("text-fg-muted")
    expect(sprintBandClass("s1")).toBe(sprintBandClass("s1"))
    expect(sprintBandClass("s1")).toMatch(/^bg-chart-/)
  })
})
