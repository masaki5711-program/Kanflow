/**
 * One `popstate` listener that runs before the Next.js App Router's (F-02).
 *
 * The router registers its own popstate listener on window while hydrating
 * and re-renders synchronously from it: `useSearchParams` loses `?pbi`, or the
 * whole page changes, so a dirty modal (and any listener it owns) is gone
 * before a later listener could keep it. Browsers call a window's popstate
 * listeners in registration order (a capture listener does not run first on
 * window in Chromium), so the only way to act first is to register first:
 * `installPopstateGate()` runs from `src/instrumentation-client.ts`, which
 * Next loads before hydration. While a guard is registered, the gate asks it;
 * a guard that returns true swallows the event (stopImmediatePropagation), so
 * the router never sees the history move.
 */
export type PopstateGuard = (event: PopStateEvent) => boolean

const guards: PopstateGuard[] = []
let installed = false

function onPopState(event: PopStateEvent) {
  // The newest guard (the top-most dirty editor) decides.
  const guard = guards[guards.length - 1]
  if (guard && guard(event)) event.stopImmediatePropagation()
}

/** Idempotent. Call as early as possible (instrumentation-client) so the gate precedes the router's listener. */
export function installPopstateGate(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  window.addEventListener("popstate", onPopState)
}

/** Registers a guard (installing the gate if needed — then it only runs first if it was installed early). */
export function registerPopstateGuard(guard: PopstateGuard): () => void {
  installPopstateGate()
  guards.push(guard)
  return () => {
    const i = guards.lastIndexOf(guard)
    if (i >= 0) guards.splice(i, 1)
  }
}
