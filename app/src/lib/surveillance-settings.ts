import { z } from "zod"

/**
 * Per-project AI surveillance thresholds (Project.surveillanceSettings, a
 * JSON string). Pure — safe to import from client components for form
 * validation. Null / missing / invalid stored values fall back field by field
 * to the defaults, which equal the thresholds that used to be hard-coded in
 * lib/surveillance.ts, so projects that never saved settings behave exactly
 * as before.
 */

export interface SurveillanceSettings {
  /** Include the project in the daily surveillance run at all. */
  enabled: boolean
  /** An in-progress task is "stalled" after this many days without an update. */
  stalledDays: number
  /** Warn when at least this many tasks of one sprint are stalled. */
  stalledTasksThreshold: number
  /** Check that active sprints get daily scrum notes. */
  checkDailyScrum: boolean
  /** Warn when the last daily scrum note is at least this many days old. */
  dailyScrumSilentDays: number
  /** Committed points may exceed the capacity by this percentage before a warning. */
  overCapacityTolerancePct: number
  /** Days past the sprint end date before an unfinished sprint is critical. */
  sprintOverdueGraceDays: number
  /** Notify the project's PO / SM when a report contains critical anomalies. */
  notifyCritical: boolean
}

export const DEFAULT_SURVEILLANCE_SETTINGS: Readonly<SurveillanceSettings> = Object.freeze({
  enabled: true,
  stalledDays: 3,
  stalledTasksThreshold: 3,
  checkDailyScrum: true,
  dailyScrumSilentDays: 3,
  overCapacityTolerancePct: 0,
  sprintOverdueGraceDays: 0,
  notifyCritical: true,
})

/** Inclusive bounds of the numeric fields (shared by the API schema and the form). */
export const SURVEILLANCE_LIMITS = {
  stalledDays: { min: 1, max: 30 },
  stalledTasksThreshold: { min: 1, max: 50 },
  dailyScrumSilentDays: { min: 1, max: 30 },
  overCapacityTolerancePct: { min: 0, max: 100 },
  sprintOverdueGraceDays: { min: 0, max: 30 },
} as const

type NumericKey = keyof typeof SURVEILLANCE_LIMITS

const intIn = (key: NumericKey) => z.number().int().min(SURVEILLANCE_LIMITS[key].min).max(SURVEILLANCE_LIMITS[key].max)

/** PUT body: every field required (the form always sends the full object). */
export const surveillanceSettingsSchema = z
  .object({
    enabled: z.boolean(),
    stalledDays: intIn("stalledDays"),
    stalledTasksThreshold: intIn("stalledTasksThreshold"),
    checkDailyScrum: z.boolean(),
    dailyScrumSilentDays: intIn("dailyScrumSilentDays"),
    overCapacityTolerancePct: intIn("overCapacityTolerancePct"),
    sprintOverdueGraceDays: intIn("sprintOverdueGraceDays"),
    notifyCritical: z.boolean(),
  })
  .strict()

const FIELD_SCHEMAS = surveillanceSettingsSchema.shape

/** Stored JSON → settings; each invalid or missing field takes its default. Never throws. */
export function parseStoredSurveillanceSettings(raw: string | null | undefined): SurveillanceSettings {
  const out: SurveillanceSettings = { ...DEFAULT_SURVEILLANCE_SETTINGS }
  if (!raw) return out
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out
  const source = parsed as Record<string, unknown>
  const merged: Record<string, unknown> = { ...out }
  for (const key of Object.keys(FIELD_SCHEMAS) as (keyof SurveillanceSettings)[]) {
    const result = FIELD_SCHEMAS[key].safeParse(source[key])
    if (result.success) merged[key] = result.data
  }
  return merged as unknown as SurveillanceSettings
}

export function serializeSurveillanceSettings(settings: SurveillanceSettings): string {
  return JSON.stringify(settings)
}
