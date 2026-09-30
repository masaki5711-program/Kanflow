import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { ToastProvider, useOptionalToast, useToast, type ToastApi } from "./toast"
import { LanguageProvider } from "@/lib/language-context"

let api: ToastApi
function setApi(value: ToastApi) {
  api = value
}
function Capture() {
  const toast = useToast()
  useEffect(() => setApi(toast), [toast])
  return null
}

function renderToasts(max?: number) {
  return render(
    <LanguageProvider initialLanguage="en">
      <ToastProvider max={max}>
        <Capture />
      </ToastProvider>
    </LanguageProvider>,
  )
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("always renders both live regions, even with no toasts", () => {
    renderToasts()
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive")
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite")
  })

  it("puts errors in the assertive region and success/info in the polite region", () => {
    renderToasts()
    act(() => {
      api.error("Boom", { title: "Failed" })
      api.success("Saved")
      api.info("FYI")
    })
    expect(screen.getByRole("alert")).toHaveTextContent("FailedBoom")
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("Saved")
    expect(status).toHaveTextContent("FYI")
    expect(status).not.toHaveTextContent("Boom")
  })

  it("auto-dismisses after the given duration", () => {
    renderToasts()
    act(() => {
      api.success("Bye soon", { duration: 1000 })
    })
    expect(screen.getByText("Bye soon")).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(screen.getByText("Bye soon")).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText("Bye soon")).not.toBeInTheDocument()
  })

  it("keeps sticky toasts (duration 0) until dismissed manually", () => {
    renderToasts()
    act(() => {
      api.info("Sticky", { duration: 0 })
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText("Sticky")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }))
    expect(screen.queryByText("Sticky")).not.toBeInTheDocument()
  })

  it("pauses auto-dismiss while hovered and resumes on mouse leave", () => {
    renderToasts()
    act(() => {
      api.success("Hover me", { duration: 1000 })
    })
    const toast = screen.getByText("Hover me").closest("div.pointer-events-auto") as HTMLElement
    fireEvent.mouseEnter(toast)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText("Hover me")).toBeInTheDocument()
    fireEvent.mouseLeave(toast)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText("Hover me")).not.toBeInTheDocument()
  })

  it("pauses while focused", () => {
    renderToasts()
    act(() => {
      api.success("Focus me", { duration: 500 })
    })
    const button = screen.getByRole("button", { name: "Dismiss notification" })
    fireEvent.focus(button)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText("Focus me")).toBeInTheDocument()
    fireEvent.blur(button)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByText("Focus me")).not.toBeInTheDocument()
  })

  it("dismiss(id) removes a specific toast and ids are unique", () => {
    renderToasts()
    let a = 0
    let b = 0
    act(() => {
      a = api.info("A", { duration: 0 })
      b = api.info("B", { duration: 0 })
    })
    expect(a).not.toBe(b)
    act(() => api.dismiss(a))
    expect(screen.queryByText("A")).not.toBeInTheDocument()
    expect(screen.getByText("B")).toBeInTheDocument()
  })

  it("caps the number of visible toasts at max", () => {
    renderToasts(2)
    act(() => {
      api.info("one", { duration: 0 })
      api.info("two", { duration: 0 })
      api.info("three", { duration: 0 })
    })
    expect(screen.getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(2)
  })

  it("is positioned at the top so it never covers modal footers", () => {
    renderToasts()
    const region = screen.getByRole("region", { name: "Notifications" })
    const classes = region.className.split(" ")
    expect(classes).toContain("top-4")
    expect(classes.some((c) => c.startsWith("bottom-"))).toBe(false)
  })

  it("F6 moves focus to the newest toast and back to the page, without trapping", () => {
    renderToasts()
    const outside = document.createElement("button")
    document.body.appendChild(outside)
    outside.focus()
    // No toasts: F6 does nothing.
    fireEvent.keyDown(document, { key: "F6" })
    expect(outside).toHaveFocus()
    act(() => {
      api.info("first", { duration: 0 })
      api.info("second", { duration: 0 })
    })
    fireEvent.keyDown(document, { key: "F6" })
    const buttons = screen.getAllByRole("button", { name: "Dismiss notification" })
    expect(buttons[1]).toHaveFocus()
    fireEvent.keyDown(document, { key: "F6" })
    expect(outside).toHaveFocus()
    outside.remove()
  })

  it("Escape on a focused toast dismisses it, stops propagation and restores focus", () => {
    renderToasts()
    const outside = document.createElement("button")
    document.body.appendChild(outside)
    outside.focus()
    const docEsc = vi.fn()
    document.addEventListener("keydown", docEsc)
    act(() => {
      api.info("Esc me", { duration: 0 })
    })
    fireEvent.keyDown(document, { key: "F6" })
    const button = screen.getByRole("button", { name: "Dismiss notification" })
    expect(button).toHaveFocus()
    fireEvent.keyDown(button, { key: "Escape" })
    expect(screen.queryByText("Esc me")).not.toBeInTheDocument()
    expect(docEsc.mock.calls.filter(([e]) => (e as KeyboardEvent).key === "Escape")).toHaveLength(0)
    expect(outside).toHaveFocus()
    document.removeEventListener("keydown", docEsc)
    outside.remove()
  })

  it("renders an optional action button that runs once and dismisses the toast", () => {
    renderToasts()
    const onClick = vi.fn()
    act(() => {
      api.success("Moved to trash", { action: { label: "Undo", onClick } })
      api.info("Plain")
    })
    const undo = screen.getByRole("button", { name: "Undo" })
    // Only the toast with an action gets an extra button.
    expect(screen.getAllByRole("button")).toHaveLength(3)
    fireEvent.click(undo)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Moved to trash")).not.toBeInTheDocument()
    expect(screen.getByText("Plain")).toBeInTheDocument()
  })

  it("keeps a toast with an action on screen longer than the plain default", () => {
    renderToasts()
    act(() => {
      api.success("Undoable", { action: { label: "Undo", onClick: () => {} } })
    })
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByText("Undoable")).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText("Undoable")).not.toBeInTheDocument()
  })

  it("useToast throws outside the provider; useOptionalToast returns null", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    function Bad() {
      useToast()
      return null
    }
    expect(() => render(<Bad />)).toThrow(/ToastProvider/)
    const seen = vi.fn()
    function Probe() {
      const value = useOptionalToast()
      useEffect(() => seen(value), [value])
      return null
    }
    render(<Probe />)
    expect(seen).toHaveBeenCalledWith(null)
    err.mockRestore()
  })
})
