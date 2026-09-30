import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, renderHook, waitFor } from "@testing-library/react"
import { useRef } from "react"
import { lockBodyScroll, useBodyScrollLock } from "./use-body-scroll-lock"
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard"
import { useIsMobile, useMediaQuery } from "./use-media-query"
import { useFocusTrap } from "./use-focus-trap"
import * as barrel from "./index"

describe("lockBodyScroll", () => {
  afterEach(() => {
    document.body.style.overflow = ""
    document.body.style.paddingRight = ""
  })

  it("is reference counted and restores the original styles after the last unlock", () => {
    document.body.style.overflow = "auto"
    const a = lockBodyScroll()
    const b = lockBodyScroll()
    expect(document.body.style.overflow).toBe("hidden")
    a()
    a() // double release is ignored
    expect(document.body.style.overflow).toBe("hidden")
    b()
    expect(document.body.style.overflow).toBe("auto")
  })

  it("compensates for the scrollbar width", () => {
    const spy = vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(window.innerWidth - 15)
    const release = lockBodyScroll()
    expect(document.body.style.paddingRight).toBe("15px")
    release()
    expect(document.body.style.paddingRight).toBe("")
    spy.mockRestore()
  })

  it("useBodyScrollLock locks only while active", () => {
    const { rerender, unmount } = renderHook(({ on }) => useBodyScrollLock(on), { initialProps: { on: false } })
    expect(document.body.style.overflow).toBe("")
    rerender({ on: true })
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.body.style.overflow).toBe("")
  })
})

describe("useUnsavedChangesGuard", () => {
  it("prevents unload only while dirty", () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty), {
      initialProps: { dirty: false },
    })
    const clean = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    rerender({ dirty: true })
    const dirty = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)

    unmount()
    const after = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})

describe("useMediaQuery", () => {
  it("reflects matchMedia and updates on change", () => {
    let matches = false
    const listeners = new Set<() => void>()
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        get matches() {
          return matches
        },
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      })),
    )
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 1px)"))
    const { result: mobile } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    expect(mobile.current).toBe(false)
    act(() => {
      matches = true
      listeners.forEach((l) => l())
    })
    expect(result.current).toBe(true)
    unmount()
    vi.unstubAllGlobals()
  })
})

describe("useFocusTrap", () => {
  it("does nothing when inactive and can skip focus restoration", async () => {
    const outside = document.createElement("button")
    document.body.appendChild(outside)
    outside.focus()
    function Trap({ active }: { active: boolean }) {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref, active, { restoreFocus: false, initialFocus: () => null })
      return (
        <div ref={ref} tabIndex={-1}>
          <span>no tabbables</span>
        </div>
      )
    }
    const { rerender, unmount } = render(<Trap active={false} />)
    expect(outside).toHaveFocus()
    rerender(<Trap active />)
    await waitFor(() => expect(outside).not.toHaveFocus())
    unmount()
    expect(document.activeElement).not.toBe(outside)
    outside.remove()
  })

  it("pulls stray focus back into a trap with no tabbables on Tab", () => {
    vi.useFakeTimers()
    function Trap() {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref, true)
      return <div ref={ref} tabIndex={-1} data-testid="trap" />
    }
    const outside = document.createElement("button")
    document.body.appendChild(outside)
    const { getByTestId, unmount } = render(<Trap />)
    act(() => {
      vi.runAllTimers()
    })
    expect(getByTestId("trap")).toHaveFocus()
    outside.focus()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))
    })
    expect(getByTestId("trap")).toHaveFocus()
    // Non-Tab, non-Escape keys are ignored
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
    })
    unmount()
    outside.remove()
    vi.useRealTimers()
  })

  it("the hooks barrel re-exports the public API", () => {
    expect(barrel.useApiQuery).toBeTypeOf("function")
    expect(barrel.useFocusTrap).toBe(useFocusTrap)
  })
})
