"use client"

import { useCallback, useSyncExternalStore } from "react"
import { useRawPref, writePref } from "./use-project-list-prefs"

/** localStorage key: epoch ms until which the dormant-project banner stays hidden. */
export const DORMANT_REMINDER_KEY = "kanflow:dormantReminderSnoozedUntil"
/** Dismissing the banner hides it for this long (a roughly monthly reminder). */
export const DORMANT_REMINDER_SNOOZE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** True while a stored snooze is still in the future. Invalid / missing values never snooze. */
export function isReminderSnoozed(raw: string | null, now: Date): boolean {
  if (!raw) return false
  const until = Number(raw)
  return Number.isFinite(until) && now.getTime() < until
}

/** Stored value for "hide for 30 days from now". */
export function snoozeValue(now: Date, days = DORMANT_REMINDER_SNOOZE_DAYS): string {
  return String(now.getTime() + days * DAY_MS)
}

const noopSubscribe = () => () => {}

/**
 * Banner snooze state. Hidden during SSR / hydration (the stored snooze is only
 * known in the browser), so a snoozed banner never flashes in.
 */
export function useDormantReminder(now: Date) {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  const raw = useRawPref(DORMANT_REMINDER_KEY)
  const snooze = useCallback(() => writePref(DORMANT_REMINDER_KEY, snoozeValue(new Date())), [])
  return { visible: hydrated && !isReminderSnoozed(raw, now), snooze }
}
