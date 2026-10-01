import type { Project } from "./types"

/** A project with no activity for this many days is flagged "dormant" (archive candidate). */
export const DORMANT_DAYS = 60

const DAY_MS = 24 * 60 * 60 * 1000

function toTime(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const time = (value instanceof Date ? value : new Date(value)).getTime()
  return Number.isNaN(time) ? null : time
}

/** Epoch ms of the last meaningful activity (falls back to updatedAt, then createdAt); null when unknown. */
export function lastActivityTime(p: Project): number | null {
  return toTime(p.lastActivityAt) ?? toTime(p.updatedAt) ?? toTime(p.createdAt)
}

/** Whole days since the last activity, or null when it is unknown. */
export function daysSinceActivity(p: Project, now: Date): number | null {
  const last = lastActivityTime(p)
  return last === null ? null : Math.max(0, Math.floor((now.getTime() - last) / DAY_MS))
}

/** Days idle when the (active) project is dormant, else null. Archived projects are never "dormant". */
export function dormantDays(p: Project, now: Date, threshold = DORMANT_DAYS): number | null {
  if (p.status === "archived") return null
  const days = daysSinceActivity(p, now)
  return days !== null && days >= threshold ? days : null
}
