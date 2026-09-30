import { ValidationError } from "./errors"

export const INVALID_DATE_MESSAGE = "日付が不正です"

/** Parse a date string; throws ValidationError("日付が不正です") when invalid. */
export function parseDateOrThrow(value: string): Date {
  const d = new Date(value)
  if (isNaN(d.getTime())) throw new ValidationError(INVALID_DATE_MESSAGE, {}, "INVALID_DATE")
  return d
}

/** `undefined` stays undefined, empty / null becomes null, otherwise `new Date(v)` (unchecked, as before). */
export function optionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value ? new Date(value) : null
}
