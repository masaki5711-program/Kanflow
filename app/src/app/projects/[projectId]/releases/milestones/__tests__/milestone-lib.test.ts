import { describe, expect, it } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { parseYen } from "../budget-section"
import { filterPunch, visibleTabs } from "../milestone-types"
import { punchPatch } from "../punch-form"
import { schedulePatch, scheduleForm } from "../stage-schedule"
import { chartGeometry } from "../trend-chart"
import { screenUploads } from "../use-uploads"
import { punch, stage } from "./ms-fixtures"

const t = getTranslations("ja")

describe("schedulePatch", () => {
  it("sends only changed fields with the version; both planned dates together", () => {
    const s = stage({ plannedStart: "2026-10-01", plannedEnd: "2026-10-05", version: 4 })
    expect(schedulePatch(s, scheduleForm(s))).toBeNull()
    expect(schedulePatch(s, { ...scheduleForm(s), plannedEnd: "2026-10-09" })).toEqual({ plannedStart: "2026-10-01", plannedEnd: "2026-10-09", version: 4 })
    expect(schedulePatch(s, { ...scheduleForm(s), plannedStart: "", plannedEnd: "" })).toEqual({ plannedStart: null, plannedEnd: null, version: 4 })
    expect(schedulePatch(s, { ...scheduleForm(s), status: "done" })).toEqual({ status: "done", version: 4 })
  })

  it("never sends derived planned dates / status of a stage with steps", () => {
    const s = stage({ hasChildren: true, plannedStart: "2026-10-01", plannedEnd: "2026-10-05" })
    expect(schedulePatch(s, { ...scheduleForm(s), plannedEnd: "2026-11-01", status: "done" })).toBeNull()
    expect(schedulePatch(s, { ...scheduleForm(s), actualStart: "2026-10-02" })).toEqual({ actualStart: "2026-10-02", version: 1 })
  })
})

describe("small UI rules", () => {
  it("visibleTabs follows the switches (推移 also when a metric exists)", () => {
    const settings = { checkLabel: null, budgetEnabled: false, trendEnabled: false }
    expect(visibleTabs({ settings, metrics: [] })).toEqual(["checks", "punch", "docs"])
    expect(visibleTabs({ settings: { ...settings, budgetEnabled: true }, metrics: [{} as never] })).toEqual(["checks", "punch", "docs", "budget", "trend"])
  })

  it("filterPunch: open / overdue / mine", () => {
    const items = [punch({ id: "a", dueDate: "2026-10-01" }), punch({ id: "b", status: "done", dueDate: "2026-01-01" }), punch({ id: "c", assigneeId: "me" })]
    expect(filterPunch(items, "open", "2026-10-02", "me").map((p) => p.id)).toEqual(["a", "c"])
    expect(filterPunch(items, "overdue", "2026-10-02", "me").map((p) => p.id)).toEqual(["a"])
    expect(filterPunch(items, "mine", "2026-10-02", "me").map((p) => p.id)).toEqual(["c"])
  })

  it("punchPatch: member, typed name or nobody", () => {
    const base = { title: " t ", detail: "", dueDate: "", planItemId: "" }
    expect(punchPatch({ ...base, assignee: "u2", assigneeName: "" })).toEqual({ title: "t", detail: null, dueDate: null, planItemId: null, assigneeId: "u2" })
    expect(punchPatch({ ...base, assignee: "__other__", assigneeName: "メーカー 佐藤" })).toMatchObject({ assigneeId: null, assigneeName: "メーカー 佐藤" })
    expect(punchPatch({ ...base, assignee: "", assigneeName: "" })).toMatchObject({ assigneeId: null, assigneeName: null })
  })

  it("parseYen accepts grouped / full-width numbers and blanks", () => {
    expect(parseYen("12,000,000")).toBe(12_000_000)
    expect(parseYen("１２００円")).toBe(1200)
    expect(parseYen("")).toBeNull()
    expect(parseYen("abc")).toBeUndefined()
  })

  it("screenUploads refuses non-images for photos and keeps within the room", () => {
    const png = new File(["x"], "a.png", { type: "image/png" })
    const pdf = new File(["x"], "b.pdf", { type: "application/pdf" })
    const photos = screenUploads([png, pdf, png], 1, true, t)
    expect(photos.accepted).toHaveLength(1)
    expect(photos.errors).toEqual(["b.pdf は画像ではありません", "写真は 1 枚までです"])
    expect(screenUploads([pdf], 5, false, t).accepted).toHaveLength(1)
  })

  it("chartGeometry spans the values, target and baseline", () => {
    const g = chartGeometry({ points: [{ month: "2026-07", value: 2, recordedByName: null }, { month: "2026-08", value: 1, recordedByName: null }], targetValue: 0.5, baselineValue: 3 })
    expect(g.points).toHaveLength(2)
    expect(g.points[0].x).toBeLessThan(g.points[1].x)
    expect(g.points[0].y).toBeLessThan(g.points[1].y)
    expect(g.targetY).toBeGreaterThan(g.points[1].y)
    expect(g.baselineY).toBeLessThan(g.points[0].y)
  })
})
