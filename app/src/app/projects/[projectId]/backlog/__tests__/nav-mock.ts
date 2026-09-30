/**
 * Test double for next/navigation's URL hooks (not a test file itself).
 * Mirrors Next.js' integration of the native History API: pushState /
 * replaceState / popstate update `useSearchParams` and `usePathname`.
 *
 *   vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationModule({ projectId: "p1" }))
 *   beforeEach(() => resetUrl("/projects/p1/backlog"))
 */
import { useMemo, useSyncExternalStore } from "react"

const EVENT = "kanflow-test:navigate"
let patched = false

function patchHistory(): void {
  if (patched) return
  patched = true
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history)
    window.history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args)
      window.dispatchEvent(new Event(EVENT))
    }
  }
}

function subscribe(listener: () => void): () => void {
  patchHistory()
  window.addEventListener(EVENT, listener)
  window.addEventListener("popstate", listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener("popstate", listener)
  }
}

export function useSearchParamsMock(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  return useMemo(() => new URLSearchParams(search), [search])
}

export function usePathnameMock(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/** Start a test at `url` (fresh history entry, listeners notified). */
export function resetUrl(url: string): void {
  patchHistory()
  window.history.replaceState(null, "", url)
}

export function navigationModule(params: Record<string, string>) {
  return {
    useParams: () => params,
    useSearchParams: useSearchParamsMock,
    usePathname: usePathnameMock,
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => window.history.back(), refresh: () => {} }),
  }
}
