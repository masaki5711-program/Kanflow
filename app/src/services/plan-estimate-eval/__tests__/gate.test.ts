/** The pure parts of the per-lineage gate: freshness and approval on top of the backtest (plan 12 §5 / §8 item 6). */
import { describe, expect, it, vi } from "vitest"

// Pure functions only: no database client is opened.
vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

import { decideGate, withApproval, withFreshness, type EvalRecord } from "@/services/plan-estimate-run/gate"

const passing: EvalRecord = { n: 7, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 }
const full = (record: EvalRecord | null, current: boolean, approved: boolean) => withApproval(withFreshness(decideGate(record), current), approved)

describe("the gate on top of the backtest", () => {
  it("passing, current and approved → on", () => {
    expect(full(passing, true, true)).toEqual({ on: true, reason: null })
  })
  it("a passing record of older snapshots fails closed, even approved (backtest_outdated)", () => {
    expect(full(passing, false, true)).toEqual({ on: false, reason: "backtest_outdated" })
  })
  it("a passing, current record without an approval → not_approved", () => {
    expect(full(passing, true, false)).toEqual({ on: false, reason: "not_approved" })
  })
  it("a failing record keeps its own reason, whatever the freshness and approval", () => {
    expect(full({ ...passing, n: 2 }, true, true)).toEqual({ on: false, reason: "not_enough_actuals" })
    expect(full({ ...passing, mape: 0.39 }, false, true)).toEqual({ on: false, reason: "not_better_than_template" })
    expect(full(null, true, true)).toEqual({ on: false, reason: "no_backtest" })
  })
})
