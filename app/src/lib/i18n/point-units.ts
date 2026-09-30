/** Canonical point-unit keys stored in the database. */
export type PointUnitKey = "人日" | "人時" | "ポイント" | "SP"

export const POINT_UNIT_OPTIONS: PointUnitKey[] = ["SP", "ポイント", "人日", "人時"]

/** Default point unit for newly created projects. */
export const DEFAULT_POINT_UNIT: PointUnitKey = "SP"

/**
 * Scale of allowed values for a given point unit. Story-point-like scales
 * use Fibonacci (0, 1, 2, 3, 5, 8, 13, 21); man-days/hours use a regular
 * scale appropriate for time-boxed estimation. Direct free-form input is
 * disallowed — estimators pick from the scale.
 */
export function getPointScale(unit: string | null | undefined): number[] {
  switch (unit) {
    case "SP":
    case "ポイント":
      return [0, 1, 2, 3, 5, 8, 13, 21]
    case "人日":
      return [0, 1, 2, 3, 5, 8, 13]
    case "人時":
      return [0, 1, 2, 4, 8, 16, 24]
    default:
      return [0, 1, 2, 3, 5, 8, 13, 21]
  }
}

/**
 * Translate a stored pointUnit value to the current language.
 * Falls back to the stored string for custom/unknown values.
 */
export function formatPointUnit(
  unit: string | null | undefined,
  t: { pointUnitManDay: string; pointUnitManHour: string; pointUnitPoints: string; pointUnitSP: string }
): string {
  switch (unit) {
    case "人日": return t.pointUnitManDay
    case "人時": return t.pointUnitManHour
    case "ポイント": return t.pointUnitPoints
    case "SP": return t.pointUnitSP
    default: return unit ?? ""
  }
}
