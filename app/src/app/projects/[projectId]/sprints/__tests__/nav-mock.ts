// Stateful `next/navigation` stand-in for the sprint page tests:
// `router.replace` updates the search params and re-renders subscribers,
// like the real App Router does.
//   vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
import { useSyncExternalStore } from "react"
import { vi } from "vitest"

export const PATHNAME = "/projects/p1/sprints"

let search = ""
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export const replaceMock = vi.fn((href: string) => {
  const i = href.indexOf("?")
  search = i < 0 ? "" : href.slice(i + 1)
  emit()
})

/** Set the current query string (without "?") before rendering. */
export function setSearch(next: string) {
  search = next
  emit()
}

export function currentSearch(): string {
  return search
}

export function resetNavigation() {
  search = ""
  replaceMock.mockClear()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const navigationMock = {
  useParams: () => ({ projectId: "p1" }),
  usePathname: () => PATHNAME,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: replaceMock }),
  useSearchParams: () => {
    const qs = useSyncExternalStore(subscribe, () => search, () => search)
    return new URLSearchParams(qs)
  },
}
