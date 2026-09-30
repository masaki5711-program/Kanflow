import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useBackNavigationGuard } from "./use-back-navigation-guard"

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
