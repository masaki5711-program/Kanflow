import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useRef } from "react"
import { useAnchoredPosition } from "./use-anchored-position"

function Harness({ onDismiss = () => {} }: { onDismiss?: () => void }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  useAnchoredPosition(true, anchor, list, "left", onDismiss)
  return (
    <div>
      <button ref={anchor}>a</button>
      <ul ref={list} data-testid="list" />
    </div>
  )
}

function setup(anchorRect: Partial<DOMRect>, listHeight: number) {
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(600)
  vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(
    { top: 0, bottom: 0, left: 20, right: 60, width: 40, height: 0, x: 20, y: 0, toJSON: () => ({}), ...anchorRect } as DOMRect,
  )
  vi.spyOn(HTMLUListElement.prototype, "scrollHeight", "get").mockReturnValue(listHeight)
}

describe("useAnchoredPosition", () => {
  it("opens below the trigger when there is room", () => {
    setup({ top: 100, bottom: 130 }, 120)
    const { getByTestId } = render(<Harness />)
    const list = getByTestId("list")
    expect(list.style.position).toBe("fixed")
    expect(list.style.top).toBe("134px")
  })

  it("opens upwards near the bottom edge so the last entries stay visible", () => {
    setup({ top: 560, bottom: 590 }, 120)
    const { getByTestId } = render(<Harness />)
    expect(getByTestId("list").style.top).toBe(`${560 - 4 - 120}px`)
  })

  it("closes on a page scroll", () => {
    setup({ top: 100, bottom: 130 }, 120)
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    window.dispatchEvent(new Event("scroll"))
    expect(onDismiss).toHaveBeenCalled()
  })
})
