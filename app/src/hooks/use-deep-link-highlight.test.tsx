import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import {
  HIGHLIGHT_ATTR,
  focusAndHighlight,
  prefersReducedMotion,
  useDeepLinkHighlight,
  withoutParam,
} from "./use-deep-link-highlight"

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/p1/icebox",
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))

beforeEach(() => {
  nav.search = ""
  nav.replace.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("withoutParam", () => {
  it("removes only the named param and keeps the others", () => {
    expect(withoutParam("view=board&task=t1&q=x", "task")).toBe("view=board&q=x")
  })

  it("returns an empty string when nothing else remains", () => {
    expect(withoutParam("task=t1", "task")).toBe("")
  })
})

describe("prefersReducedMotion", () => {
  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined)
    expect(prefersReducedMotion()).toBe(false)
  })

  it("reads the reduce-motion media query", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }))
    expect(prefersReducedMotion()).toBe(true)
  })
})

describe("focusAndHighlight", () => {
  it("scrolls smoothly, focuses a non-focusable element and removes the highlight later", () => {
    vi.useFakeTimers()
    const el = document.createElement("li")
    document.body.appendChild(el)

    focusAndHighlight(el, { reduceMotion: false, highlightMs: 1000 })

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" })
    expect(el.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(el)
    expect(el.hasAttribute(HIGHLIGHT_ATTR)).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(el.hasAttribute(HIGHLIGHT_ATTR)).toBe(false)
    el.remove()
  })

  it("uses an instant scroll under reduced motion and keeps an existing tabindex", () => {
    const el = document.createElement("li")
    el.tabIndex = 0
    document.body.appendChild(el)

    focusAndHighlight(el, { reduceMotion: true, highlightMs: 1000 })

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" })
    expect(el.getAttribute("tabindex")).toBe("0")
    el.blur()
    expect(el.getAttribute("tabindex")).toBe("0")
    el.remove()
  })

  it("drops the temporary tabindex once focus leaves", () => {
    const el = document.createElement("li")
    document.body.appendChild(el)
    focusAndHighlight(el, { reduceMotion: false, highlightMs: 1000 })
    el.blur()
    expect(el.hasAttribute("tabindex")).toBe(false)
    el.remove()
  })

  it("cleanup removes the highlight immediately", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const cleanup = focusAndHighlight(el, { reduceMotion: false, highlightMs: 5000 })
    cleanup()
    expect(el.hasAttribute(HIGHLIGHT_ATTR)).toBe(false)
    el.remove()
  })
})

interface HarnessProps {
  isReady?: boolean
  exists?: (id: string) => boolean
  onNotFound?: (id: string) => void
  /** Render the target only after `reveal` ran (like expanding a collapsed sprint). */
  lazy?: boolean
}

function Harness({ isReady = true, exists = () => true, onNotFound = () => {}, lazy = false }: HarnessProps) {
  const [revealed, setRevealed] = useState<string | null>(null)
  useDeepLinkHighlight("item", (id) => `item-${id}`, {
    isReady,
    reveal: (id) => {
      if (!exists(id)) return false
      setRevealed(id)
      return true
    },
    onNotFound,
    timeoutMs: 300,
  })
  const shown = lazy ? revealed : "a"
  return <ul>{shown && <li id={`item-${shown}`}>{`card ${shown}`}</li>}</ul>
}

describe("useDeepLinkHighlight", () => {
  it("does nothing without the param", () => {
    render(<Harness />)
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("waits until the data is ready", () => {
    nav.search = "item=a"
    render(<Harness isReady={false} />)
    expect(nav.replace).not.toHaveBeenCalled()
    expect(screen.getByText("card a")).not.toHaveAttribute(HIGHLIGHT_ATTR)
  })

  it("reveals, scrolls to, focuses and highlights the target, then drops the param", async () => {
    nav.search = "view=board&item=a"
    render(<Harness lazy />)
    const card = await screen.findByText("card a")
    await waitFor(() => expect(card).toHaveFocus())
    expect(card).toHaveAttribute(HIGHLIGHT_ATTR)
    expect(card.scrollIntoView).toHaveBeenCalled()
    expect(nav.replace).toHaveBeenCalledWith("/projects/p1/icebox?view=board", { scroll: false })
  })

  it("reports a target that does not exist and drops the param", async () => {
    nav.search = "item=zz"
    const onNotFound = vi.fn()
    render(<Harness exists={() => false} onNotFound={onNotFound} />)
    await waitFor(() => expect(onNotFound).toHaveBeenCalledWith("zz"))
    expect(nav.replace).toHaveBeenCalledWith("/projects/p1/icebox", { scroll: false })
  })

  it("reports a target whose element never renders", async () => {
    nav.search = "item=b"
    const onNotFound = vi.fn()
    render(<Harness onNotFound={onNotFound} />)
    await waitFor(() => expect(onNotFound).toHaveBeenCalledWith("b"), { timeout: 2000 })
    expect(nav.replace).toHaveBeenCalledTimes(1)
  })

  it("handles a value only once across re-renders", async () => {
    nav.search = "item=a"
    const onNotFound = vi.fn()
    const { rerender } = render(<Harness onNotFound={onNotFound} />)
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1))
    await act(async () => rerender(<Harness onNotFound={onNotFound} />))
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(onNotFound).not.toHaveBeenCalled()
  })
})
