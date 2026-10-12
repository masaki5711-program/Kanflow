import { describe, expect, it } from "vitest"
import { durationOf, endFromDuration, endKeepingDuration, snapStart } from "../lib/duration"

describe("duration", () => {
  it("counts calendar and business days inclusively", () => {
    expect(durationOf("2026-10-13", "2026-10-19", false)).toBe(7)
    expect(durationOf("2026-10-13", "2026-10-19", true)).toBe(5) // 10/17-18 weekend
    expect(durationOf("2026-10-17", "2026-10-18", true)).toBe(1) // never below 1
  })

  it("derives the end from a duration", () => {
    expect(endFromDuration("2026-10-13", 7, false)).toBe("2026-10-19")
    expect(endFromDuration("2026-10-13", 5, true)).toBe("2026-10-19")
    expect(endFromDuration("2026-10-13", 0, false)).toBe("2026-10-13")
  })

  it("keeps the duration when the start moves", () => {
    expect(endKeepingDuration("2026-10-13", "2026-10-19", "2026-10-20", false)).toBe("2026-10-26")
    expect(endKeepingDuration("2026-10-13", "2026-10-19", "2026-10-20", true)).toBe("2026-10-26")
    expect(endKeepingDuration("2026-10-13", "2026-10-13", "2026-11-02", false)).toBe("2026-11-02")
  })

  it("snaps a weekend start forward only in business mode", () => {
    expect(snapStart("2026-10-17", true)).toBe("2026-10-19")
    expect(snapStart("2026-10-17", false)).toBe("2026-10-17")
  })
})
