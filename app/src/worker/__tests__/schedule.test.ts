import { describe, expect, test, vi } from "vitest"
import { describeConfig, formatDailyTimes, loadWorkerConfig, nextRunAt, parseRetentionDays, parseSchedule } from "../config"
import { DailyScheduler } from "../scheduler"
import { parseArgs } from "../cli"

describe("parseSchedule", () => {
  test("defaults to 06:30 when unset", () => {
    expect(parseSchedule(undefined)).toEqual([{ hour: 6, minute: 30 }])
    expect(parseSchedule("  ")).toEqual([{ hour: 6, minute: 30 }])
  })

  test("parses, sorts and dedupes multiple times", () => {
    expect(parseSchedule("18:00, 6:05,18:00")).toEqual([
      { hour: 6, minute: 5 },
      { hour: 18, minute: 0 },
    ])
  })

  test("off disables; all-invalid falls back to the default", () => {
    expect(parseSchedule("off")).toEqual([])
    expect(parseSchedule("none")).toEqual([])
    expect(parseSchedule("25:00,abc")).toEqual([{ hour: 6, minute: 30 }])
  })

  test("formatDailyTimes round-trips", () => {
    expect(formatDailyTimes(parseSchedule("6:05,18:00"))).toBe("06:05,18:00")
    expect(formatDailyTimes([])).toBe("off")
  })
})

describe("nextRunAt", () => {
  const times = parseSchedule("06:30,18:00")

  test("later today", () => {
    expect(nextRunAt(new Date(2026, 8, 23, 5, 0), times)).toEqual(new Date(2026, 8, 23, 6, 30))
    expect(nextRunAt(new Date(2026, 8, 23, 6, 30, 0, 1), times)).toEqual(new Date(2026, 8, 23, 18, 0))
  })

  test("exactly at a slot → the next one (strictly after)", () => {
    expect(nextRunAt(new Date(2026, 8, 23, 18, 0), times)).toEqual(new Date(2026, 8, 24, 6, 30))
  })

  test("rolls over month end", () => {
    expect(nextRunAt(new Date(2026, 8, 30, 23, 0), times)).toEqual(new Date(2026, 9, 1, 6, 30))
  })

  test("empty schedule → null", () => {
    expect(nextRunAt(new Date(), [])).toBeNull()
  })
})

describe("DailyScheduler", () => {
  test("fires once when the slot is reached and computes the next slot", async () => {
    let now = new Date(2026, 8, 23, 6, 29)
    const run = vi.fn(async () => undefined)
    const s = new DailyScheduler({ name: "t", times: parseSchedule("06:30"), run, now: () => now })
    expect(s.tick()).toBe(false)
    now = new Date(2026, 8, 23, 6, 30, 5)
    expect(s.tick()).toBe(true)
    expect(s.tick()).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
    expect(s.nextAt()).toEqual(new Date(2026, 8, 24, 6, 30))
    await s.stop()
  })

  test("does not start a second run while one is still going", async () => {
    let now = new Date(2026, 8, 23, 6, 31)
    let finish: () => void = () => undefined
    const run = vi.fn(() => new Promise<void>((r) => (finish = r)))
    const warn = vi.fn()
    const s = new DailyScheduler({
      name: "t",
      times: parseSchedule("06:30,06:40"),
      run,
      now: () => now,
      log: { info: vi.fn(), warn, error: vi.fn() },
    })
    // constructed at 06:31 → next slot 06:40
    now = new Date(2026, 8, 23, 6, 40)
    expect(s.tick()).toBe(true)
    now = new Date(2026, 8, 24, 6, 30)
    expect(s.tick()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(s.isRunning()).toBe(true)
    finish()
    await s.stop()
    expect(s.isRunning()).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  test("a failing run is logged, not thrown", async () => {
    const error = vi.fn()
    let now = new Date(2026, 8, 23, 6, 0)
    const s = new DailyScheduler({
      name: "t",
      times: parseSchedule("06:30"),
      run: async () => {
        throw new Error("ollama down")
      },
      now: () => now,
      log: { info: vi.fn(), warn: vi.fn(), error },
    })
    now = new Date(2026, 8, 23, 7, 0)
    s.tick()
    await s.stop()
    expect(error).toHaveBeenCalledWith("t: scheduled run failed", { error: "ollama down" })
  })
})

describe("worker config", () => {
  test("retention days default 90, invalid ignored", () => {
    expect(parseRetentionDays(undefined)).toBe(90)
    expect(parseRetentionDays("30")).toBe(30)
    expect(parseRetentionDays("0")).toBe(90)
    expect(parseRetentionDays("x")).toBe(90)
  })

  test("translation runs in the worker only in external mode", () => {
    expect(loadWorkerConfig({ NODE_ENV: "production" }).runTranslation).toBe(true)
    expect(loadWorkerConfig({ NODE_ENV: "production", AI_TRANSLATION_WORKER: "inprocess" }).runTranslation).toBe(false)
    expect(loadWorkerConfig({ NODE_ENV: "production", AI_TRANSLATION_WORKER: "off" }).runTranslation).toBe(false)
  })

  test("describeConfig never includes the token itself", () => {
    const d = JSON.stringify(describeConfig(loadWorkerConfig({ NODE_ENV: "production", INTERNAL_API_TOKEN: "very-secret" })))
    expect(d).not.toContain("very-secret")
    expect(d).toContain('"tokenConfigured":true')
  })

  test("cli args", () => {
    expect(parseArgs(["--dry-run"])).toMatchObject({ dryRun: true, surveillanceNow: false, unknown: [] })
    expect(parseArgs(["--surveillance-now", "--bogus"])).toMatchObject({ surveillanceNow: true, unknown: ["--bogus"] })
  })
})
