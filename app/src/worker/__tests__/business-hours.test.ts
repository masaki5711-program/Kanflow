import { describe, expect, it } from "vitest"
import {
  BusinessHoursLimiter,
  combineAdmissions,
  describeBusinessHours,
  isWithinBusinessHours,
  parseBusinessDays,
  parseBusinessHours,
} from "../business-hours"

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
// 2026-09-23 is a Wednesday.
const wed = (h: number, m = 0, s = 0) => new Date(2026, 8, 23, h, m, s)
const idle = { lastTickAt: 0, lastResult: null }

describe("parseBusinessHours", () => {
  it("defaults to 08:00-17:30 Mon-Fri at 6 per minute", () => {
    const bh = parseBusinessHours(env({}))
    expect(describeBusinessHours(bh)).toEqual({ window: "08:00-17:30", days: "1,2,3,4,5", ratePerMin: 6 })
  })

  it("reads a custom window, days and rate", () => {
    const bh = parseBusinessHours(env({ WORKER_BUSINESS_HOURS: "07:30-19:00", WORKER_BUSINESS_DAYS: "1-6", WORKER_BUSINESS_HOURS_RATE: "0" }))
    expect(describeBusinessHours(bh)).toEqual({ window: "07:30-19:00", days: "1,2,3,4,5,6", ratePerMin: 0 })
  })

  it("off / none disables the throttle", () => {
    expect(parseBusinessHours(env({ WORKER_BUSINESS_HOURS: "off" }))).toBeNull()
    expect(parseBusinessHours(env({ WORKER_BUSINESS_HOURS: "NONE" }))).toBeNull()
    expect(describeBusinessHours(null)).toBe("off")
  })

  it("falls back to the defaults for invalid values", () => {
    const bh = parseBusinessHours(env({ WORKER_BUSINESS_HOURS: "18:00-08:00", WORKER_BUSINESS_HOURS_RATE: "-3" }))
    expect(describeBusinessHours(bh)).toEqual({ window: "08:00-17:30", days: "1,2,3,4,5", ratePerMin: 6 })
    expect(describeBusinessHours(parseBusinessHours(env({ WORKER_BUSINESS_HOURS: "garbage" })))).toMatchObject({ window: "08:00-17:30" })
  })

  it("parses day lists and ignores junk", () => {
    expect([...parseBusinessDays("1,3,7")]).toEqual([1, 3, 7])
    expect([...parseBusinessDays("x,9")].sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe("isWithinBusinessHours", () => {
  const bh = parseBusinessHours(env({}))!
  it("is inside on a weekday between start (inclusive) and end (exclusive)", () => {
    expect(isWithinBusinessHours(bh, wed(8, 0))).toBe(true)
    expect(isWithinBusinessHours(bh, wed(17, 29))).toBe(true)
    expect(isWithinBusinessHours(bh, wed(17, 30))).toBe(false)
    expect(isWithinBusinessHours(bh, wed(7, 59))).toBe(false)
  })
  it("is outside on the weekend", () => {
    expect(isWithinBusinessHours(bh, new Date(2026, 8, 26, 10, 0))).toBe(false) // Saturday
    expect(isWithinBusinessHours(bh, new Date(2026, 8, 27, 10, 0))).toBe(false) // Sunday
  })
})

describe("BusinessHoursLimiter", () => {
  const bh = parseBusinessHours(env({ WORKER_BUSINESS_HOURS_RATE: "4" }))

  it("admits freely outside the window", () => {
    const l = new BusinessHoursLimiter(bh)
    expect(l.admit(wed(20), { lastTickAt: wed(20).getTime() - 1, lastResult: { processed: 50 } })).toEqual({ allow: true })
  })

  it("caps the batch to the remaining per-minute budget, then refuses", () => {
    const l = new BusinessHoursLimiter(bh)
    expect(l.admit(wed(10), idle)).toEqual({ allow: true, batch: 4 })
    const t1 = wed(10, 0, 10).getTime()
    expect(l.admit(wed(10, 0, 11), { lastTickAt: t1, lastResult: { processed: 3 } })).toEqual({ allow: true, batch: 1 })
    const t2 = wed(10, 0, 20).getTime()
    expect(l.admit(wed(10, 0, 21), { lastTickAt: t2, lastResult: { processed: 1 } })).toEqual({ allow: false, reason: "business-hours-rate" })
    expect(l.used(wed(10, 0, 21).getTime())).toBe(4)
  })

  it("counts each tick once and ignores empty ticks", () => {
    const l = new BusinessHoursLimiter(bh)
    const tick = { lastTickAt: wed(10, 0, 5).getTime(), lastResult: { processed: 2 } }
    l.admit(wed(10, 0, 6), tick)
    l.admit(wed(10, 0, 7), tick)
    l.admit(wed(10, 0, 8), { lastTickAt: wed(10, 0, 8).getTime(), lastResult: { processed: 0 } })
    expect(l.used(wed(10, 0, 9).getTime())).toBe(2)
  })

  it("frees budget after a rolling minute", () => {
    const l = new BusinessHoursLimiter(bh)
    l.admit(wed(10, 0, 1), { lastTickAt: wed(10, 0, 0).getTime(), lastResult: { processed: 4 } })
    expect(l.admit(wed(10, 0, 30), idle).allow).toBe(false)
    expect(l.admit(wed(10, 1, 1), idle)).toEqual({ allow: true, batch: 4 })
  })

  it("rate 0 pauses background translation inside the window", () => {
    const l = new BusinessHoursLimiter(parseBusinessHours(env({ WORKER_BUSINESS_HOURS_RATE: "0" })))
    expect(l.admit(wed(9), idle)).toEqual({ allow: false, reason: "business-hours-rate" })
    expect(l.admit(wed(18), idle)).toEqual({ allow: true })
  })

  it("is a no-op when disabled", () => {
    const l = new BusinessHoursLimiter(null)
    expect(l.enabled).toBe(false)
    expect(l.admit(wed(10), { lastTickAt: 1, lastResult: { processed: 99 } })).toEqual({ allow: true })
  })
})

describe("combineAdmissions", () => {
  it("both must allow; the smaller batch wins", () => {
    expect(combineAdmissions({ allow: true }, { allow: true })).toEqual({ allow: true })
    expect(combineAdmissions({ allow: true, batch: 1 }, { allow: true, batch: 3 })).toEqual({ allow: true, batch: 1 })
    expect(combineAdmissions({ allow: true }, { allow: true, batch: 2 })).toEqual({ allow: true, batch: 2 })
    expect(combineAdmissions({ allow: false, reason: "peer-busy" }, { allow: true })).toEqual({ allow: false, reason: "peer-busy" })
    expect(combineAdmissions({ allow: true, batch: 2 }, { allow: false, reason: "business-hours-rate" })).toEqual({
      allow: false,
      reason: "business-hours-rate",
    })
  })
})
