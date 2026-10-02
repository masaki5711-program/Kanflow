import { describe, expect, it } from "vitest"
import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { Textarea } from "./input"

/** jsdom has no layout: fake the content height the browser would report. */
function fakeScrollHeight(el: HTMLElement, px: number) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => px })
}

describe("Textarea autoGrow", () => {
  it("sets the height to the content height on mount and while typing", () => {
    const { rerender } = render(<Textarea aria-label="ac" autoGrow value="a" onChange={() => {}} />)
    const el = screen.getByLabelText("ac") as HTMLTextAreaElement
    fakeScrollHeight(el, 320)
    fireEvent.input(el, { target: { value: "long\ntext" } })
    expect(el.style.height).toBe("320px")
    fakeScrollHeight(el, 480)
    rerender(<Textarea aria-label="ac" autoGrow value={"more\n\n\ntext"} onChange={() => {}} />)
    expect(el.style.height).toBe("480px")
    expect(el.className).toContain("overflow-hidden")
  })

  it("leaves the height alone without autoGrow and still forwards refs", () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea aria-label="plain" ref={ref} value="a" onChange={() => {}} />)
    const el = screen.getByLabelText("plain") as HTMLTextAreaElement
    fakeScrollHeight(el, 999)
    fireEvent.input(el, { target: { value: "b" } })
    expect(el.style.height).toBe("")
    expect(ref.current).toBe(el)
  })
})
