/**
 * "User is still here" signal shared between the API client and the idle
 * logout watcher. Anything that represents deliberate activity (API calls via
 * `apiFetch`, streaming requests that must use raw `fetch`, custom
 * interactions) calls `emitActivity()`.
 *
 * Background refreshes that are NOT the user's doing (a real-time update
 * from someone else, a catch-up after reconnecting) call
 * `quietActivityFor(ms)` first: requests in that window do not count, or an
 * idle user with an open tab would never be logged out.
 */
export const ACTIVITY_EVENT = "kanflow:activity"

let quietUntil = 0

export function emitActivity(): void {
  if (typeof window === "undefined") return
  if (Date.now() < quietUntil) return
  window.dispatchEvent(new Event(ACTIVITY_EVENT))
}

/** Suppress `emitActivity()` for the next `ms` (real input events still count). */
export function quietActivityFor(ms: number): void {
  quietUntil = Math.max(quietUntil, Date.now() + ms)
}
