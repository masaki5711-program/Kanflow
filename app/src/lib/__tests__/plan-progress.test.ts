import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const pp = await import("@/lib/plan-progress")

const d = (key: string) => new Date(`${key}T00:00:00.000Z`)

describe("plan dates", () => {
  it("toDateKey rounds to the nearest UTC midnight (legacy JST-midnight rows)", () => {
    expect(pp.toDateKey(d("2026-03-01"))).toBe("2026-03-01")
    // JST midnight of 2026-03-02 stored as 15:00 UTC of 03-01
    expect(pp.toDateKey(new Date("2026-03-01T15:00:00.000Z"))).toBe("2026-03-02")
    expect(pp.toDateKey(new Date("2026-03-01T11:59:59.000Z"))).toBe("2026-03-01")
    expect(pp.toDateKeyOrNull(null)).toBeNull()
  })

  it("tokyoDateKey uses UTC+9 (the day flips at 15:00 UTC)", () => {
    expect(pp.tokyoDateKey(new Date("2026-09-30T14:59:59.999Z"))).toBe("2026-09-30")
    expect(pp.tokyoDateKey(new Date("2026-09-30T15:00:00.000Z"))).toBe("2026-10-01")
    expect(pp.tokyoDateKey(new Date("2026-12-31T15:30:00.000Z"))).toBe("2027-01-01")
  })

  it("dateFromKey accepts only real calendar days", () => {
    expect(pp.dateFromKey("2026-02-28")?.toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(pp.dateFromKey("2026-02-30")).toBeNull()
    expect(pp.dateFromKey("2026-2-3")).toBeNull()
    expect(pp.dateFromKey("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z")
  })

  it("normalizePlanDate: YYYY-MM-DD as given, date-times by their Tokyo calendar day", () => {
    expect(pp.normalizePlanDate("2026-04-01")?.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(pp.normalizePlanDate(" 2026-04-01 ")?.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(pp.normalizePlanDate("2026-04-01T00:00:00+09:00")?.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(pp.normalizePlanDate("2026-03-31T15:00:00.000Z")?.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(pp.normalizePlanDate("2026-04-01T00:00:00.000Z")?.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(pp.normalizePlanDate("x")).toBeNull()
    expect(pp.normalizePlanDate("2026-13-01")).toBeNull()
    expect(pp.normalizePlanDate("April 1, 2026")).toBeNull()
  })

  it("inclusiveDays and baselineVarianceDays", () => {
    expect(pp.inclusiveDays(d("2026-01-01"), d("2026-01-01"))).toBe(1)
    expect(pp.inclusiveDays(d("2026-01-01"), d("2026-01-10"))).toBe(10)
    expect(pp.inclusiveDays(new Date("2025-12-31T15:00:00Z"), d("2026-01-10"))).toBe(10)
    expect(pp.baselineVarianceDays(d("2026-01-15"), d("2026-01-10"))).toBe(5)
    expect(pp.baselineVarianceDays(d("2026-01-05"), d("2026-01-10"))).toBe(-5)
    expect(pp.baselineVarianceDays(d("2026-01-05"), null)).toBeNull()
  })
})

describe("statusToProgress", () => {
  it("maps statuses (legacy delayed = in progress)", () => {
    expect(["not_started", "in_progress", "done", "on_hold", "delayed", "?"].map(pp.statusToProgress)).toEqual([0, 50, 100, 0, 50, 0])
  })
})

describe("deriveLinkedLeaf", () => {
  const pbi = (status: string, points: number, inSprint = false) => ({ status, points, inSprint })

  it("null without PBIs", () => {
    expect(pp.deriveLinkedLeaf([])).toBeNull()
  })

  it("progress by points", () => {
    expect(pp.deriveLinkedLeaf([pbi("completed", 3), pbi("ready", 5, true)])).toEqual({ progressPct: 38, status: "in_progress" })
  })

  it("progress by count when no points are set", () => {
    expect(pp.deriveLinkedLeaf([pbi("completed", 0), pbi("ready", 0), pbi("not_ready", 0)])).toEqual({ progressPct: 33, status: "in_progress" })
  })

  it("done only when every PBI is completed", () => {
    expect(pp.deriveLinkedLeaf([pbi("completed", 2), pbi("completed", 0)])).toEqual({ progressPct: 100, status: "done" })
  })

  it("in_progress when a PBI is in a sprint, not_started otherwise", () => {
    expect(pp.deriveLinkedLeaf([pbi("ready", 5, true), pbi("ready", 5)])).toEqual({ progressPct: 0, status: "in_progress" })
    expect(pp.deriveLinkedLeaf([pbi("ready", 5), pbi("not_ready", 1)])).toEqual({ progressPct: 0, status: "not_started" })
  })

  it("ignores negative points", () => {
    expect(pp.deriveLinkedLeaf([pbi("completed", -4), pbi("ready", 0)])?.progressPct).toBe(50)
  })
})

describe("rollupChildren", () => {
  const child = (start: string, end: string, progressPct: number, status: string, isMilestone = false) => ({
    plannedStart: d(start),
    plannedEnd: d(end),
    progressPct,
    status,
    isMilestone,
  })

  it("weights progress by planned calendar days", () => {
    const r = pp.rollupChildren([child("2026-01-01", "2026-01-10", 100, "done"), child("2026-01-11", "2026-02-09", 0, "not_started")])
    // 10 days @100 + 30 days @0 → 25
    expect(r.progressPct).toBe(25)
    expect(r.status).toBe("in_progress")
    expect(r.plannedStart.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(r.plannedEnd.toISOString()).toBe("2026-02-09T00:00:00.000Z")
  })

  it("milestones weigh 0 next to real work", () => {
    const r = pp.rollupChildren([child("2026-01-01", "2026-01-04", 50, "in_progress"), child("2026-01-05", "2026-01-05", 0, "not_started", true)])
    expect(r.progressPct).toBe(50)
    expect(r.plannedEnd.toISOString()).toBe("2026-01-05T00:00:00.000Z")
  })

  it("equal weights when every child is a milestone", () => {
    const r = pp.rollupChildren([child("2026-01-01", "2026-01-01", 100, "done", true), child("2026-03-01", "2026-03-01", 0, "not_started", true)])
    expect(r.progressPct).toBe(50)
  })

  it("status rules", () => {
    const s = (...st: string[]) => pp.rollupChildren(st.map((x) => child("2026-01-01", "2026-01-02", 0, x))).status
    expect(s("done", "done")).toBe("done")
    expect(s("on_hold", "on_hold")).toBe("on_hold")
    expect(s("on_hold", "done")).toBe("in_progress")
    expect(s("not_started", "in_progress")).toBe("in_progress")
    expect(s("not_started", "on_hold")).toBe("not_started")
    expect(s("not_started")).toBe("not_started")
  })
})

describe("computeScheduleState", () => {
  const item = (start: string, end: string, progressPct: number, status = "in_progress") => ({
    plannedStart: d(start),
    plannedEnd: d(end),
    progressPct,
    status,
  })

  it("done wins over everything", () => {
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-02", 0, "done"), "2026-05-01")).toBe("done")
  })

  it("delayed only after the planned end day (the end day itself is not late)", () => {
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 95), "2026-01-10")).toBe("on_track")
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 95), "2026-01-11")).toBe("delayed")
  })

  it("legacy JST-midnight end dates are compared by calendar day", () => {
    const legacy = { ...item("2026-01-01", "2026-01-10", 100, "in_progress"), plannedEnd: new Date("2026-01-09T15:00:00Z") }
    expect(pp.computeScheduleState(legacy, "2026-01-10")).toBe("on_track")
  })

  it("at_risk when progress trails the elapsed share by more than 15 points", () => {
    // 10-day window, today = day 5 → elapsed 50%
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 34), "2026-01-05")).toBe("at_risk")
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 35), "2026-01-05")).toBe("on_track")
  })

  it("a one-day item (milestone) due today is not at risk until the day has passed", () => {
    expect(pp.computeScheduleState(item("2026-01-05", "2026-01-05", 0, "not_started"), "2026-01-05")).toBe("not_started")
    expect(pp.computeScheduleState(item("2026-01-05", "2026-01-05", 0, "in_progress"), "2026-01-05")).toBe("on_track")
    expect(pp.computeScheduleState(item("2026-01-05", "2026-01-05", 0, "not_started"), "2026-01-06")).toBe("delayed")
  })

  it("not_started before the window when nothing happened; on_track when already worked on", () => {
    expect(pp.computeScheduleState(item("2026-02-01", "2026-02-10", 0, "not_started"), "2026-01-15")).toBe("not_started")
    expect(pp.computeScheduleState(item("2026-02-01", "2026-02-10", 0, "in_progress"), "2026-01-15")).toBe("on_track")
  })

  it("on_hold is reported as on_hold (never delayed / at_risk); done still wins", () => {
    expect(pp.computeScheduleState(item("2026-02-01", "2026-02-10", 0, "on_hold"), "2026-01-15")).toBe("on_hold")
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 0, "on_hold"), "2026-01-05")).toBe("on_hold")
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 20, "on_hold"), "2026-03-01")).toBe("on_hold")
    expect(pp.SCHEDULE_STATES).toContain("on_hold")
  })

  it("an unstarted item early in its window is not_started, later at_risk", () => {
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 0, "not_started"), "2026-01-01")).toBe("not_started")
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-10", 0, "not_started"), "2026-01-02")).toBe("at_risk")
  })

  it("milestone before its day is not started", () => {
    expect(pp.computeScheduleState(item("2026-01-05", "2026-01-05", 0, "not_started"), "2026-01-04")).toBe("not_started")
  })

  it("invalid today falls back to on_track", () => {
    expect(pp.computeScheduleState(item("2026-01-01", "2026-01-02", 50), "bad")).toBe("on_track")
  })
})

describe("computePlanRecalc", () => {
  const node = (id: string, parentId: string | null, over: Partial<import("@/lib/plan-progress").PlanCalcNode> = {}) => ({
    id,
    parentId,
    status: "not_started",
    progressPct: 0,
    progressMode: "manual",
    plannedStart: d("2026-01-01"),
    plannedEnd: d("2026-01-10"),
    isMilestone: false,
    ...over,
  })

  it("recomputes a leaf and its ancestors deepest-first, only changed fields", () => {
    const nodes = [
      node("root", null, { plannedStart: d("2026-01-01"), plannedEnd: d("2026-01-20") }),
      node("mid", "root", { plannedStart: d("2026-01-01"), plannedEnd: d("2026-01-20") }),
      node("a", "mid", { status: "done", plannedEnd: d("2026-01-10") }),
      node("b", "mid", { plannedStart: d("2026-01-11"), plannedEnd: d("2026-01-20") }),
    ]
    const { updates } = pp.computePlanRecalc(nodes, new Map(), ["a"])
    expect(updates).toEqual([
      { id: "a", progressPct: 100 },
      { id: "mid", progressPct: 50, status: "in_progress" },
      { id: "root", progressPct: 50, status: "in_progress" },
    ])
  })

  it("rolls up parent dates", () => {
    const nodes = [node("p", null), node("c1", "p", { plannedStart: d("2025-12-01"), plannedEnd: d("2025-12-05") }), node("c2", "p", { plannedEnd: d("2026-02-01") })]
    const { updates } = pp.computePlanRecalc(nodes, new Map(), ["p"])
    expect(updates).toEqual([{ id: "p", plannedStart: d("2025-12-01"), plannedEnd: d("2026-02-01") }])
  })

  it("linked leaves take PBI progress; without PBIs they behave as manual", () => {
    const nodes = [node("l", null, { progressMode: "linked" }), node("m", null, { progressMode: "linked", status: "done" })]
    const linked = new Map([["l", [{ status: "completed", points: 1, inSprint: true }, { status: "ready", points: 3, inSprint: false }]]])
    const { updates } = pp.computePlanRecalc(nodes, linked, "all")
    expect(updates).toEqual([
      { id: "l", progressPct: 25, status: "in_progress" },
      { id: "m", progressPct: 100 },
    ])
  })

  it("manual leaves ignore linked PBIs", () => {
    const linked = new Map([["x", [{ status: "completed", points: 1, inSprint: true }]]])
    expect(pp.computePlanRecalc([node("x", null)], linked, ["x"]).updates).toEqual([])
  })

  it("ignores unknown start ids and children of missing (trashed) parents", () => {
    expect(pp.computePlanRecalc([node("a", "gone", { status: "done", progressPct: 100 })], new Map(), ["a", "missing"]).updates).toEqual([])
  })

  it("is cycle-safe", () => {
    const nodes = [node("a", "b"), node("b", "a")]
    expect(() => pp.computePlanRecalc(nodes, new Map(), ["a"])).not.toThrow()
  })
})

describe("persistence", () => {
  const db = {
    planItem: { findMany: vi.fn(), update: vi.fn() },
    productBacklogItem: { findMany: vi.fn() },
  }
  beforeEach(() => {
    vi.clearAllMocks()
    db.productBacklogItem.findMany.mockResolvedValue([])
  })
  const row = (id: string, parentId: string | null, status: string, progressPct: number) => ({
    id,
    parentId,
    status,
    progressPct,
    progressMode: "manual",
    plannedStart: d("2026-01-01"),
    plannedEnd: d("2026-01-02"),
    isMilestone: false,
  })

  it("recalcPlanProgress reads only live rows once and writes changed rows without a version bump", async () => {
    db.planItem.findMany.mockResolvedValue([row("p", null, "not_started", 0), row("c", "p", "done", 100)])
    await pp.recalcPlanProgress("proj", ["c", null], db as never)
    expect(db.planItem.findMany).toHaveBeenCalledTimes(1)
    expect(db.planItem.findMany.mock.calls[0][0].where).toEqual({ projectId: "proj", deletedAt: null })
    expect(db.planItem.update).toHaveBeenCalledWith({ where: { id: "p" }, data: { progressPct: 100, status: "done" } })
    await pp.recalcPlanProgress("proj", [], db as never)
    expect(db.planItem.findMany).toHaveBeenCalledTimes(1)
  })

  it("loadLinkedPbis groups live PBIs and flags sprint membership", async () => {
    db.productBacklogItem.findMany.mockResolvedValue([
      { planItemId: "l", status: "ready", workloadScore: 2, sprintItems: [{ id: "t" }] },
      { planItemId: "l", status: "completed", workloadScore: 1, sprintItems: [] },
    ])
    const map = await pp.loadLinkedPbis(db as never, ["l"])
    expect(map.get("l")).toEqual([
      { status: "ready", points: 2, inSprint: true },
      { status: "completed", points: 1, inSprint: false },
    ])
    expect(db.productBacklogItem.findMany.mock.calls[0][0].where).toEqual({ planItemId: { in: ["l"] }, deletedAt: null })
    await expect(pp.loadLinkedPbis(db as never, [])).resolves.toEqual(new Map())
  })

  it("recalcPlanForPbis → recalcPlanItems groups by project", async () => {
    db.productBacklogItem.findMany.mockResolvedValueOnce([{ planItemId: "a" }, { planItemId: "b" }])
    db.planItem.findMany
      .mockResolvedValueOnce([{ id: "a", projectId: "p1" }, { id: "b", projectId: "p2" }])
      .mockResolvedValue([])
    await pp.recalcPlanForPbis(["pbi1", "pbi2"], db as never)
    expect(db.planItem.findMany).toHaveBeenCalledTimes(3)
    expect(db.planItem.findMany.mock.calls[1][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(db.planItem.findMany.mock.calls[2][0].where).toEqual({ projectId: "p2", deletedAt: null })
    vi.clearAllMocks()
    await pp.recalcPlanForPbis([], db as never)
    await pp.recalcPlanItems([null, undefined], db as never)
    expect(db.planItem.findMany).not.toHaveBeenCalled()
  })
})
