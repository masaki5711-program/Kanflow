import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { installPopstateGate } from "./popstate-gate"
import { useBackNavigationGuard } from "./use-back-navigation-guard"

// As in the app: instrumentation-client installs the gate before the router registers its listener.
installPopstateGate()

/** What the browser does on Back: the URL is already the previous entry when popstate fires. */
function pressBack(toUrl: string) {
  window.history.replaceState(null, "", toUrl)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, "", "/")
})

describe("useBackNavigationGuard (F-02)", () => {
  it("does nothing while clean", () => {
    window.history.replaceState(null, "", "/backlog?pbi=3")
    const ask = vi.fn(async () => true)
    renderHook(() => useBackNavigationGuard(false, ask))
    pressBack("/backlog")
    expect(ask).not.toHaveBeenCalled()
    expect(window.location.search).toBe("")
  })

  it("while dirty: restores the URL, asks, and stays when the user cancels", async () => {
    window.history.replaceState(null, "", "/backlog?pbi=3")
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    const ask = vi.fn(async () => false)
    renderHook(() => useBackNavigationGuard(true, ask))
    await act(async () => pressBack("/backlog"))
    expect(window.location.search).toBe("?pbi=3")
    expect(ask).toHaveBeenCalledTimes(1)
    expect(back).not.toHaveBeenCalled()
  })

  it("leaves (history.back) without asking again when the user discards", async () => {
    window.history.replaceState(null, "", "/backlog?pbi=3")
    const back = vi.spyOn(window.history, "back").mockImplementation(() => pressBack("/backlog"))
    const ask = vi.fn(async () => true)
    renderHook(() => useBackNavigationGuard(true, ask))
    await act(async () => pressBack("/backlog"))
    expect(back).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe("")
  })
})

describe("useBackNavigationGuard — runs before the Next.js router listener (F-02, cycle 2: popstate gate)", () => {
  it("stops the popstate before a listener registered earlier (Next's router) sees it", async () => {
    window.history.replaceState({ __NA: true, tree: "pbi" }, "", "/backlog?pbi=3")
    const router = vi.fn()
    window.addEventListener("popstate", router)
    const push = vi.spyOn(window.history, "pushState")
    const ask = vi.fn(async () => false)
    renderHook(() => useBackNavigationGuard(true, ask))
    await act(async () => pressBack("/backlog"))
    expect(router).not.toHaveBeenCalled()
    // The guarded entry is re-pushed with its own (Next-internal) state.
    expect(push).toHaveBeenCalledWith({ __NA: true, tree: "pbi" }, "", "http://localhost:3000/backlog?pbi=3")
    expect(window.location.search).toBe("?pbi=3")
    window.removeEventListener("popstate", router)
  })

  it("lets the router handle the Back that follows 'discard', then guards again", async () => {
    window.history.replaceState(null, "", "/backlog?pbi=3")
    const router = vi.fn()
    window.addEventListener("popstate", router)
    const back = vi.spyOn(window.history, "back").mockImplementation(() => pressBack("/backlog"))
    const ask = vi.fn(async () => true)
    renderHook(() => useBackNavigationGuard(true, ask))
    await act(async () => pressBack("/backlog"))
    expect(back).toHaveBeenCalledTimes(1)
    expect(router).toHaveBeenCalledTimes(1)
    // A later Back (component still mounted) is guarded again.
    window.history.replaceState(null, "", "/backlog?pbi=3")
    await act(async () => pressBack("/backlog"))
    expect(ask).toHaveBeenCalledTimes(2)
    window.removeEventListener("popstate", router)
  })
})
