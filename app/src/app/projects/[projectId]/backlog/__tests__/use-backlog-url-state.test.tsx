import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { resetUrl } from "./nav-mock"

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationModule({ projectId: "p1" }))

const { useBacklogUrlState } = await import("../use-backlog-url-state")

describe("useBacklogUrlState", () => {
  beforeEach(() => resetUrl("/projects/p1/backlog"))

  it("reads filters and the pbi ref from the URL", () => {
    resetUrl("/projects/p1/backlog?q=login&status=ready&showDone=1&pbi=12")
    const { result } = renderHook(() => useBacklogUrlState())
    expect(result.current.filters).toMatchObject({ q: "login", status: "ready", showDone: true })
    expect(result.current.pbiRef).toBe("12")
  })

  it("setFilters replaces the URL in place (no new history entry) and re-renders", () => {
    const { result } = renderHook(() => useBacklogUrlState())
    const before = window.history.length
    act(() => result.current.setFilters({ q: "abc", epic: "Auth" }))
    expect(window.location.search).toBe("?q=abc&epic=Auth")
    expect(result.current.filters).toMatchObject({ q: "abc", epic: "Auth" })
    act(() => result.current.setFilters({ q: "", epic: "" }))
    expect(window.location.search).toBe("")
    expect(window.history.length).toBe(before)
  })

  it("openPbi pushes a history entry; closePbi steps back (Back button semantics)", async () => {
    resetUrl("/projects/p1/backlog?q=x")
    const { result } = renderHook(() => useBacklogUrlState())
    const before = window.history.length
    act(() => result.current.openPbi("12"))
    expect(window.location.search).toBe("?q=x&pbi=12")
    expect(window.history.length).toBe(before + 1)
    expect(result.current.pbiRef).toBe("12")
    act(() => result.current.closePbi())
    await waitFor(() => expect(result.current.pbiRef).toBeNull())
    expect(window.location.search).toBe("?q=x")
  })

  it("closing a deep-linked PBI removes the param in place", () => {
    resetUrl("/projects/p1/backlog?pbi=abc")
    const { result } = renderHook(() => useBacklogUrlState())
    const before = window.history.length
    act(() => result.current.closePbi())
    expect(window.location.search).toBe("")
    expect(result.current.pbiRef).toBeNull()
    expect(window.history.length).toBe(before)
  })

  it("switching PBIs while one is open replaces instead of stacking entries", () => {
    const { result } = renderHook(() => useBacklogUrlState())
    act(() => result.current.openPbi("1"))
    const afterFirst = window.history.length
    act(() => result.current.openPbi("2"))
    expect(window.history.length).toBe(afterFirst)
    expect(result.current.pbiRef).toBe("2")
  })

  it("the browser Back button closes a PBI opened with openPbi", async () => {
    const { result } = renderHook(() => useBacklogUrlState())
    act(() => result.current.openPbi("7"))
    act(() => window.history.back())
    await waitFor(() => expect(result.current.pbiRef).toBeNull())
    // Re-opening works and still pushes.
    const before = window.history.length
    act(() => result.current.openPbi("8"))
    expect(result.current.pbiRef).toBe("8")
    expect(window.history.length).toBeGreaterThanOrEqual(before)
  })
})
