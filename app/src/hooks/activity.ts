/**
 * "User is still here" signal shared between the API client and the idle
 * logout watcher. Anything that represents deliberate activity (API calls via
 * `apiFetch`, streaming requests that must use raw `fetch`, custom
 * interactions) calls `emitActivity()`.
 */
export const ACTIVITY_EVENT = "kanflow:activity"

export function emitActivity(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(ACTIVITY_EVENT))
}
