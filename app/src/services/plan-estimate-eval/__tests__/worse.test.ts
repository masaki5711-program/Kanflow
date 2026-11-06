/** The pure parts of the real-actuals backtest: the gate's approval step and "worse" (plan 12 §5 / §8 item 6). */
import { describe, expect, it, vi } from "vitest"

// Pure functions only: no database client is opened.
vi.mock("@/services/_shared/db", () => ({ defaultDb: {} }))

import { decideGate, withApproval, type EvalRecord } from "@/services/plan-estimate-run/gate"
import { isWorse, WORSE_RATIO_STEP } from "../eval.service"

const passing: EvalRecord = { n: 7, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 }

describe("withApproval", () => {
  it("a passing backtest without an approval stays off with not_approved", () => {
    expect(withApproval(decideGate(passing), false)).toEqual({ on: false, reason: "not_approved" })
  })
  it("a passing, approved backtest is on", () => {
    expect(withApproval(decideGate(passing), true)).toEqual({ on: true, reason: null })
  })
  it("an approval does not turn a failing backtest on; its own reason is kept", () => {
    expect(withApproval(decideGate({ ...passing, n: 2 }), true)).toEqual({ on: false, reason: "not_enough_actuals" })
    expect(withApproval(decideGate(null), true)).toEqual({ on: false, reason: "no_backtest" })
  })
})

describe("isWorse", () => {
  it("nothing before → not worse", () => {
    expect(isWorse(null, { ...passing, n: 1 })).toBe(false)
  })
  it("passing → failing is worse", () => {
    expect(isWorse(passing, { ...passing, mape: 0.39 })).toBe(true)
  })
  it("the error ratio rising by the step is worse even when both fail", () => {
    const before = { ...passing, mape: 0.36 } // ratio 0.9, failing
    expect(decideGate(before).on).toBe(false)
    expect(isWorse(before, { ...passing, mape: 0.36 + WORSE_RATIO_STEP * 0.4 })).toBe(true)
  })
  it("a small rise, an improvement or too few projects are not worse", () => {
    expect(isWorse(passing, { ...passing, mape: 0.12 })).toBe(false)
    expect(isWorse({ ...passing, mape: 0.3 }, { ...passing, mape: 0.2 })).toBe(false)
    expect(isWorse({ ...passing, n: 3, mape: 0.3 }, { ...passing, n: 3, mape: 0.4 })).toBe(false)
  })
})
