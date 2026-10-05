import { describe, expect, it } from "vitest"
import { isPunchOverdue, metricOnTarget, nextMilestone, summarizeBoard, summarizeBudget, summarizeChecks, type StageLike } from "../summary"

const stage = (over: Partial<StageLike> = {}): StageLike => ({
  id: "s1",
  name: "仕様決定",
  status: "not_started",
  scheduleState: "not_started",
  plannedEnd: null,
  isMilestone: false,
  steps: [],
  ...over,
})

describe("summarizeChecks (検収完了 rule)", () => {
  it("is complete only when every check passed (条件付き合格 counts as passed)", () => {
    expect(summarizeChecks([{ result: "passed" }, { result: "conditional" }])).toEqual({ total: 2, passed: 2, conditional: 1, failed: 0, pending: 0, complete: true })
  })

  it("is not complete with a pending or failed check, nor without any check", () => {
    expect(summarizeChecks([{ result: "passed" }, { result: null }]).complete).toBe(false)
    expect(summarizeChecks([{ result: "passed" }, { result: "failed" }])).toMatchObject({ failed: 1, pending: 0, complete: false })
    expect(summarizeChecks([]).complete).toBe(false)
  })
})

describe("nextMilestone", () => {
  it("returns the first not-done milestone among stages and their steps, in plan order", () => {
    const stages = [
      stage({ id: "a", status: "done", steps: [{ id: "a1", name: "立会", status: "done", plannedEnd: "2026-10-01", isMilestone: true }] }),
      stage({ id: "b", name: "試運転", steps: [{ id: "b1", name: "工場検査", status: "not_started", plannedEnd: "2026-11-05", isMilestone: true }] }),
      stage({ id: "c", name: "立会検収", isMilestone: true, plannedEnd: "2026-12-01" }),
    ]
    expect(nextMilestone(stages)).toEqual({ stageId: "b", id: "b1", name: "工場検査", date: "2026-11-05" })
  })

  it("falls back to the first open stage, and null when everything is done", () => {
    expect(nextMilestone([stage({ id: "a", status: "done" }), stage({ id: "b", name: "発注" })])).toEqual({ stageId: "b", id: "b", name: "発注", date: null })
    expect(nextMilestone([stage({ status: "done" })])).toBeNull()
  })
})

describe("summarizeBoard", () => {
  it("counts stages (done / late / undated), punch (open / overdue), documents and budget", () => {
    const s = summarizeBoard(
      {
        stages: [stage({ status: "done", plannedEnd: "2026-09-01" }), stage({ id: "b", scheduleState: "delayed", plannedEnd: "2026-09-30" }), stage({ id: "c" })],
        checks: [{ result: "passed" }],
        punchItems: [
          { status: "open", dueDate: "2026-10-01" },
          { status: "in_progress", dueDate: "2026-10-02" },
          { status: "done", dueDate: "2026-09-01" },
          { status: "open", dueDate: null },
        ],
        documents: [{ status: "received" }, { status: "pending" }],
        budgetEnabled: true,
        budgetLines: [{ plannedYen: 1000, actualYen: 1200 }, { plannedYen: 500, actualYen: null }],
      },
      "2026-10-02",
    )
    expect(s.stages).toMatchObject({ total: 3, done: 1, late: 1, undated: 1 })
    expect(s.checks.complete).toBe(true)
    expect(s.punch).toEqual({ total: 4, open: 3, overdue: 1, done: 1 })
    expect(s.documents).toEqual({ received: 1, total: 2 })
    expect(s.budget).toEqual({ enabled: true, planned: 1500, actual: 1200, variance: -300 })
  })

  it("budget variance is null without any amount", () => {
    expect(summarizeBudget(false, [{ plannedYen: null, actualYen: null }])).toEqual({ enabled: false, planned: 0, actual: 0, variance: null })
  })
})

describe("small rules", () => {
  it("a punch item is overdue only when not done and past its due day", () => {
    expect(isPunchOverdue({ status: "open", dueDate: "2026-10-01" }, "2026-10-02")).toBe(true)
    expect(isPunchOverdue({ status: "open", dueDate: "2026-10-02" }, "2026-10-02")).toBe(false)
    expect(isPunchOverdue({ status: "done", dueDate: "2026-01-01" }, "2026-10-02")).toBe(false)
  })

  it("metricOnTarget honours the direction", () => {
    expect(metricOnTarget("decrease", 1.2, 1.5)).toBe(true)
    expect(metricOnTarget("increase", 1.2, 1.5)).toBe(false)
    expect(metricOnTarget("decrease", 1, null)).toBeNull()
  })
})
