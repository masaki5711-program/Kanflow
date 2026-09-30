import { describe, expect, it } from "vitest"
import {
  DEFAULT_SURVEILLANCE_SETTINGS,
  SURVEILLANCE_LIMITS,
  parseStoredSurveillanceSettings,
  serializeSurveillanceSettings,
  surveillanceSettingsSchema,
} from "@/lib/surveillance-settings"

describe("DEFAULT_SURVEILLANCE_SETTINGS", () => {
  it("equals the historical hard-coded thresholds", () => {
    expect(DEFAULT_SURVEILLANCE_SETTINGS).toEqual({
      enabled: true,
      stalledDays: 3,
      stalledTasksThreshold: 3,
      checkDailyScrum: true,
      dailyScrumSilentDays: 3,
      overCapacityTolerancePct: 0,
      sprintOverdueGraceDays: 0,
      notifyCritical: true,
    })
  })
})

describe("surveillanceSettingsSchema", () => {
  it("accepts a full valid object", () => {
    const input = { ...DEFAULT_SURVEILLANCE_SETTINGS, stalledDays: 5, overCapacityTolerancePct: 20 }
    expect(surveillanceSettingsSchema.parse(input)).toEqual(input)
  })

  it.each([
    ["stalledDays", 0],
    ["stalledDays", SURVEILLANCE_LIMITS.stalledDays.max + 1],
    ["stalledTasksThreshold", 0],
    ["dailyScrumSilentDays", 0],
    ["overCapacityTolerancePct", -1],
    ["overCapacityTolerancePct", 101],
    ["sprintOverdueGraceDays", -1],
    ["stalledDays", 1.5],
  ])("rejects %s = %s", (key, value) => {
    expect(surveillanceSettingsSchema.safeParse({ ...DEFAULT_SURVEILLANCE_SETTINGS, [key]: value }).success).toBe(false)
  })

  it("rejects unknown keys and missing keys", () => {
    expect(surveillanceSettingsSchema.safeParse({ ...DEFAULT_SURVEILLANCE_SETTINGS, extra: 1 }).success).toBe(false)
    const missing = Object.fromEntries(Object.entries(DEFAULT_SURVEILLANCE_SETTINGS).filter(([k]) => k !== "enabled"))
    expect(surveillanceSettingsSchema.safeParse(missing).success).toBe(false)
  })
})

describe("parseStoredSurveillanceSettings", () => {
  it("returns defaults for null / empty / malformed JSON / non-objects", () => {
    for (const raw of [null, undefined, "", "{bad", "[]", "42", "null"]) {
      expect(parseStoredSurveillanceSettings(raw)).toEqual(DEFAULT_SURVEILLANCE_SETTINGS)
    }
  })

  it("merges valid stored fields over defaults and drops invalid ones", () => {
    const raw = JSON.stringify({ stalledDays: 7, stalledTasksThreshold: -3, enabled: false, unknown: "x", notifyCritical: "yes" })
    expect(parseStoredSurveillanceSettings(raw)).toEqual({
      ...DEFAULT_SURVEILLANCE_SETTINGS,
      stalledDays: 7,
      enabled: false,
    })
  })

  it("returns a new object each call (defaults are never shared)", () => {
    const a = parseStoredSurveillanceSettings(null)
    const b = parseStoredSurveillanceSettings(null)
    expect(a).not.toBe(b)
    expect(a).not.toBe(DEFAULT_SURVEILLANCE_SETTINGS)
  })
})

describe("serializeSurveillanceSettings", () => {
  it("round-trips", () => {
    const s = { ...DEFAULT_SURVEILLANCE_SETTINGS, sprintOverdueGraceDays: 2 }
    expect(parseStoredSurveillanceSettings(serializeSurveillanceSettings(s))).toEqual(s)
  })
})
