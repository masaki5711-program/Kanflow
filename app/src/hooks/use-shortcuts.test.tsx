import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import { isTypingTarget, projectGoHref, useShortcuts, GO_SEQUENCE_TIMEOUT_MS, type UseShortcutsOptions } from "./use-shortcuts"

const handlers = {
  onOpenSearch: vi.fn(),
  onOpenHelp: vi.fn(),
  onNavigate: vi.fn(),
}

function Harness(props: Partial<UseShortcutsOptions>) {
  useShortcuts({ ...handlers, projectId: "p1", ...props })
  return (
    <div>
      <input aria-label="text" />
      <input aria-label="check" type="checkbox" />
      <textarea aria-label="area" />
      <div aria-label="editable" contentEditable suppressContentEditableWarning>
        x
      </div>
      <button type="button">btn</button>
    </div>
  )
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element | Document = document.body) =>
  fireEvent.keyDown(target, { key, ...init })

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  vi.useRealTimers()
  document.body.querySelectorAll("[data-test-modal]").forEach((n) => n.remove())
})

describe("useShortcuts", () => {
  it("? opens help, / opens search", () => {
    render(<Harness />)
    press("?", { shiftKey: true })
    expect(handlers.onOpenHelp).toHaveBeenCalledTimes(1)
    press("/")
    expect(handlers.onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it("Ctrl+K and ⌘K open search and prevent the browser default, even from a text field", () => {
    const { getByLabelText } = render(<Harness />)
    const ev = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    press("K", { metaKey: true }, getByLabelText("text"))
    expect(handlers.onOpenSearch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["b", "/projects/p1/backlog"],
    ["s", "/projects/p1/sprints"],
    ["p", "/projects/p1/plan"],
    ["d", "/projects/p1"],
    ["i", "/projects/p1/icebox"],
  ])("g then %s navigates to %s", (key, href) => {
    render(<Harness />)
    press("g")
    press(key)
    expect(handlers.onNavigate).toHaveBeenCalledWith(href)
  })

  it("a lone letter, an unknown second key or a late second key does nothing", () => {
    vi.useFakeTimers()
    render(<Harness />)
    press("b")
    press("g")
    press("x")
    press("b")
    press("g")
    vi.advanceTimersByTime(GO_SEQUENCE_TIMEOUT_MS + 1)
    press("b")
    expect(handlers.onNavigate).not.toHaveBeenCalled()
  })

  it("g sequences need a current project", () => {
    render(<Harness projectId={null} />)
    press("g")
    press("b")
    expect(handlers.onNavigate).not.toHaveBeenCalled()
  })

  it("ignores single keys while typing in inputs, textareas and contenteditable", () => {
    const { getByLabelText } = render(<Harness />)
    for (const label of ["text", "area", "editable"]) {
      press("?", {}, getByLabelText(label))
      press("/", {}, getByLabelText(label))
      press("g", {}, getByLabelText(label))
      press("b", {}, getByLabelText(label))
    }
    expect(handlers.onOpenHelp).not.toHaveBeenCalled()
    expect(handlers.onOpenSearch).not.toHaveBeenCalled()
    expect(handlers.onNavigate).not.toHaveBeenCalled()
    // a checkbox is not text entry
    press("?", {}, getByLabelText("check"))
    expect(handlers.onOpenHelp).toHaveBeenCalledTimes(1)
  })

  it("ignores everything (Ctrl+K included) while a modal is open", () => {
    render(<Harness />)
    const modal = document.createElement("div")
    modal.setAttribute("aria-modal", "true")
    modal.dataset.testModal = ""
    document.body.appendChild(modal)
    press("?")
    press("/")
    press("k", { ctrlKey: true })
    press("g")
    press("b")
    expect(handlers.onOpenHelp).not.toHaveBeenCalled()
    expect(handlers.onOpenSearch).not.toHaveBeenCalled()
    expect(handlers.onNavigate).not.toHaveBeenCalled()
  })

  it("ignores modifier combos, IME composition and when disabled", () => {
    const { rerender } = render(<Harness />)
    press("/", { ctrlKey: true })
    press("?", { altKey: true })
    press("/", { isComposing: true })
    expect(handlers.onOpenSearch).not.toHaveBeenCalled()
    expect(handlers.onOpenHelp).not.toHaveBeenCalled()
    rerender(<Harness enabled={false} />)
    press("?")
    press("k", { ctrlKey: true })
    expect(handlers.onOpenHelp).not.toHaveBeenCalled()
    expect(handlers.onOpenSearch).not.toHaveBeenCalled()
  })
})

describe("helpers", () => {
  it("projectGoHref encodes the id", () => {
    expect(projectGoHref("a b", "b")).toBe("/projects/a%20b/backlog")
  })

  it("isTypingTarget", () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(document)).toBe(false)
    const select = document.createElement("select")
    expect(isTypingTarget(select)).toBe(true)
    const radio = document.createElement("input")
    radio.type = "radio"
    expect(isTypingTarget(radio)).toBe(false)
    expect(isTypingTarget(document.createElement("button"))).toBe(false)
  })
})
