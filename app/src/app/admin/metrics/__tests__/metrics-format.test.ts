import { describe, expect, it } from "vitest"
import { chartRows, formatDuration, formatMs, formatPercent } from "../metrics-format"

describe("metrics formatting", () => {
  it("formatMs", () => {
    expect(formatMs(null)).toBe("—")
    expect(formatMs(12.4)).toBe("12 ms")
    expect(formatMs(1234)).toBe("1.2 s")
    expect(formatMs(65_000)).toBe("65 s")
  })

  it("formatDuration", () => {
    expect(formatDuration(null)).toBe("—")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(12 * 60 + 5)).toBe("12m")
    expect(formatDuration(5 * 3600 + 12 * 60)).toBe("5h 12m")
    expect(formatDuration(3 * 86400 + 4 * 3600)).toBe("3d 4h")
  })

  it("formatPercent", () => {
    expect(formatPercent(0)).toBe("0.0%")
    expect(formatPercent(0.005)).toBe("0.50%")
    expect(formatPercent(0.123)).toBe("12.3%")
  })

  it("chartRows keeps series and labels time", () => {
    const rows = chartRows(
      [{
        takenAt: "2026-10-05T03:05:00.000Z", pid: 1, rpm: 2, requests: 10, errors: 0, errorRate: 0, p50: 5, p95: 40,
        aiActive: 1, aiQueued: 2, aiWaitP95: 900, aiJobsQueued: 0, aiJobsRunning: 0, translationPending: 7,
        translationOldestSec: 60, workerAgeSec: 5, dbLatencyMs: 1,
      }],
      "en"
    )
    expect(rows[0]).toMatchObject({ rpm: 2, p95: 40, aiQueued: 2, translationPending: 7 })
    expect(rows[0].time).toMatch(/\d{2}:\d{2}/)
  })
})
