/** AbortSignal composition helpers (AbortSignal.any with a fallback). */

export function anySignal(signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => s !== undefined)
  if (list.length === 1) return list[0]
  if (typeof AbortSignal.any === "function") return AbortSignal.any(list)

  const controller = new AbortController()
  const onAbort = (s: AbortSignal) => () => controller.abort(s.reason)
  for (const s of list) {
    if (s.aborted) {
      controller.abort(s.reason)
      break
    }
    s.addEventListener("abort", onAbort(s), { once: true })
  }
  return controller.signal
}

export interface Deadline {
  signal: AbortSignal
  /** Stop the timer (idempotent). Always call when the work ends. */
  clear(): void
}

/**
 * Timer-backed abort signal whose reason is built by `reason()` — unlike
 * AbortSignal.timeout it can be cleared and carries a typed reason.
 */
export function startDeadline(ms: number, reason: () => unknown): Deadline {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(reason()), ms)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  }
}
