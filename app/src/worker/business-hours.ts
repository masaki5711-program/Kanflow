import type { WorkerAdmission } from "@/lib/translation/worker"

/**
 * Business-hours throttle for BACKGROUND translation (pure except the clock
 * passed in).
 *
 * During office hours people use Kanflow's chat/AI and the BankMasalah app
 * shares the same Ollama instance; every model reload costs 8-10 s. So while
 * the window is open the worker translates at most `ratePerMin` rows per
 * rolling minute (0 = none at all) instead of draining the queue flat out.
 * User-triggered AI calls are never affected, and outside the window the
 * normal gate rules apply unchanged.
 *
 * WORKER_BUSINESS_HOURS       "HH:MM-HH:MM" local time (default 08:00-17:30);
 *                             "off" / "none" disables the throttle.
 * WORKER_BUSINESS_DAYS        ISO weekdays, "1-5" (default, Mon-Fri) or "1,2,3,4,5,6".
 * WORKER_BUSINESS_HOURS_RATE  max background translations per minute inside
 *                             the window (default 6; 0 pauses them).
 */

export interface BusinessHours {
  /** Minutes since local midnight, start inclusive, end exclusive. */
  startMin: number
  endMin: number
  /** ISO weekdays 1 (Mon) .. 7 (Sun). */
  days: ReadonlySet<number>
  ratePerMin: number
}

export const DEFAULT_BUSINESS_HOURS = "08:00-17:30"
export const DEFAULT_BUSINESS_DAYS = "1-5"
export const DEFAULT_BUSINESS_RATE = 6
const WINDOW_MS = 60_000

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null
  return h * 60 + min
}

export function parseBusinessDays(raw: string | undefined): Set<number> {
  const src = raw?.trim() || DEFAULT_BUSINESS_DAYS
  const days = new Set<number>()
  for (const part of src.split(",")) {
    const range = /^([1-7])\s*-\s*([1-7])$/.exec(part.trim())
    if (range) {
      for (let d = Number(range[1]); d <= Number(range[2]); d++) days.add(d)
      continue
    }
    if (/^[1-7]$/.test(part.trim())) days.add(Number(part.trim()))
  }
  return days.size > 0 ? days : parseBusinessDays(DEFAULT_BUSINESS_DAYS)
}

function parseRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_BUSINESS_RATE
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_BUSINESS_RATE
}

/** null = throttle disabled. Invalid ranges fall back to the default window. */
export function parseBusinessHours(env: NodeJS.ProcessEnv): BusinessHours | null {
  const raw = env.WORKER_BUSINESS_HOURS?.trim().toLowerCase()
  if (raw === "off" || raw === "none" || raw === "false" || raw === "0") return null
  const [a, b] = (raw || DEFAULT_BUSINESS_HOURS).split("-")
  let startMin = a === undefined ? null : parseHm(a)
  let endMin = b === undefined ? null : parseHm(b)
  if (startMin === null || endMin === null || endMin <= startMin) {
    startMin = parseHm(DEFAULT_BUSINESS_HOURS.split("-")[0]) as number
    endMin = parseHm(DEFAULT_BUSINESS_HOURS.split("-")[1]) as number
  }
  return { startMin, endMin, days: parseBusinessDays(env.WORKER_BUSINESS_DAYS), ratePerMin: parseRate(env.WORKER_BUSINESS_HOURS_RATE) }
}

export function isWithinBusinessHours(bh: BusinessHours, now: Date): boolean {
  const isoDay = now.getDay() === 0 ? 7 : now.getDay()
  if (!bh.days.has(isoDay)) return false
  const min = now.getHours() * 60 + now.getMinutes()
  return min >= bh.startMin && min < bh.endMin
}

export function describeBusinessHours(bh: BusinessHours | null): Record<string, unknown> | "off" {
  if (!bh) return "off"
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  return { window: `${hm(bh.startMin)}-${hm(bh.endMin)}`, days: [...bh.days].sort().join(","), ratePerMin: bh.ratePerMin }
}

/** What the translation loop reported for its last tick (see workerStatus()). */
export interface TickReport {
  lastTickAt: number
  lastResult: { processed: number } | null
}

/**
 * Rolling-minute budget. The translation loop asks for admission at the
 * start of every tick; the rows the PREVIOUS tick actually translated are
 * recorded then (empty ticks cost nothing), so an idle queue never burns
 * the budget.
 */
export class BusinessHoursLimiter {
  private readonly spent: Array<{ at: number; rows: number }> = []
  private lastSeenTickAt = 0

  constructor(private readonly bh: BusinessHours | null) {}

  get enabled(): boolean {
    return this.bh !== null
  }

  /** Record the last completed tick once. */
  observe(report: TickReport): void {
    if (!report.lastTickAt || report.lastTickAt === this.lastSeenTickAt) return
    this.lastSeenTickAt = report.lastTickAt
    const rows = report.lastResult?.processed ?? 0
    if (rows > 0) this.spent.push({ at: report.lastTickAt, rows })
  }

  /** Rows translated in the rolling minute before `nowMs`. */
  used(nowMs: number): number {
    while (this.spent.length > 0 && this.spent[0].at <= nowMs - WINDOW_MS) this.spent.shift()
    return this.spent.reduce((sum, s) => sum + s.rows, 0)
  }

  admit(now: Date, report: TickReport): WorkerAdmission {
    this.observe(report)
    const used = this.used(now.getTime())
    if (!this.bh || !isWithinBusinessHours(this.bh, now)) return { allow: true }
    const remaining = this.bh.ratePerMin - used
    if (remaining <= 0) return { allow: false, reason: "business-hours-rate" }
    return { allow: true, batch: remaining }
  }
}

/** Combine two admission decisions: both must allow; the smaller batch wins. */
export function combineAdmissions(a: WorkerAdmission, b: WorkerAdmission): WorkerAdmission {
  if (!a.allow) return a
  if (!b.allow) return b
  const batches = [a.batch, b.batch].filter((n): n is number => typeof n === "number")
  return batches.length > 0 ? { allow: true, batch: Math.min(...batches) } : { allow: true }
}
