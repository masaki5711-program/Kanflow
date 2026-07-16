/**
 * Leading-edge throttle: invoke immediately, then suppress further calls
 * until `delayMs` has elapsed since the last invocation.
 *
 * Kept dependency-free on purpose — we'd rather not pull in lodash for one
 * tiny utility used by the idle-logout watcher.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  delayMs: number,
  fn: T
): (...args: Parameters<T>) => void {
  let last = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last >= delayMs) {
      last = now
      fn(...args)
    }
  }
}
