import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { PointerEvent } from "react"
import { useLinkDrag } from "../hooks/use-link-drag"
import { ROW_HEIGHT } from "../lib/geometry"
import { mkItem } from "./fixtures"

const items = [mkItem({ id: "A" }), mkItem({ id: "B" }), mkItem({ id: "C" })]
const dependencies = [{ id: "d1", predecessorId: "A", successorId: "B" }]
const rowIds = ["A", "B", "C"]
const GRID_WIDTH = 30
const BODY_TOP = 100
const BODY_LEFT = 50

function ev(clientX: number, clientY: number) {
  return { button: 0, clientX, clientY, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as PointerEvent<HTMLElement>
}

function setup(over: Partial<Parameters<typeof useLinkDrag>[0]> = {}) {
  const body = document.createElement("div")
  body.getBoundingClientRect = () => ({ top: BODY_TOP, left: BODY_LEFT }) as DOMRect
  const onLink = vi.fn()
  const onRejected = vi.fn()
  const hook = renderHook(() =>
    useLinkDrag({
      getBody: () => body,
      getScroller: () => null,
      gridWidth: GRID_WIDTH,
      rowIds,
      items,
      dependencies,
      onLink,
      onRejected,
      ...over,
    }),
  )
  return { hook, onLink, onRejected }
}

/** clientX/clientY that land on row `idx` (0-based), `dx` px into the row. */
function atRow(idx: number, dx = 10, dy = 5) {
  return { x: BODY_LEFT + GRID_WIDTH + dx, y: BODY_TOP + idx * ROW_HEIGHT + dy }
}

describe("useLinkDrag", () => {
  it("drags from a connector and drops on an open target: onLink(source, target)", () => {
    const { hook, onLink, onRejected } = setup()
    act(() => hook.result.current.onConnectorPointerDown(ev(0, 0), "A"))
    expect(hook.result.current.link).toMatchObject({ sourceId: "A", targetId: null })

    const p = atRow(2) // row C
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: p.x, clientY: p.y }))
    })
    expect(hook.result.current.link).toEqual({ sourceId: "A", x: 10, y: 2 * ROW_HEIGHT + 5, targetId: "C", block: null })

    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"))
    })
    expect(onLink).toHaveBeenCalledWith("A", "C")
    expect(onRejected).not.toHaveBeenCalled()
    expect(hook.result.current.link).toBeNull()
  })

  it("drops on a blocked target (an existing link): onRejected with the reason, no onLink", () => {
    const { hook, onLink, onRejected } = setup()
    act(() => hook.result.current.onConnectorPointerDown(ev(0, 0), "A"))
    const p = atRow(1) // row B: A -> B already exists
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: p.x, clientY: p.y }))
    })
    expect(hook.result.current.link).toMatchObject({ targetId: "B", block: "existing" })
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"))
    })
    expect(onRejected).toHaveBeenCalledWith("existing")
    expect(onLink).not.toHaveBeenCalled()
  })

  it("Escape cancels: no onLink / onRejected even with a valid target under the pointer", () => {
    const { hook, onLink, onRejected } = setup()
    act(() => hook.result.current.onConnectorPointerDown(ev(0, 0), "A"))
    const p = atRow(2)
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: p.x, clientY: p.y }))
    })
    expect(hook.result.current.link?.targetId).toBe("C")
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(hook.result.current.link).toBeNull()
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"))
    })
    expect(onLink).not.toHaveBeenCalled()
    expect(onRejected).not.toHaveBeenCalled()
  })

  it("dropping back on the source row does nothing", () => {
    const { hook, onLink, onRejected } = setup()
    act(() => hook.result.current.onConnectorPointerDown(ev(0, 0), "A"))
    const p = atRow(0)
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: p.x, clientY: p.y }))
    })
    expect(hook.result.current.link).toMatchObject({ targetId: null })
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"))
    })
    expect(onLink).not.toHaveBeenCalled()
    expect(onRejected).not.toHaveBeenCalled()
  })

  it("ignores a non-primary button press", () => {
    const { hook } = setup()
    const e = { button: 2, clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as PointerEvent<HTMLElement>
    act(() => hook.result.current.onConnectorPointerDown(e, "A"))
    expect(hook.result.current.link).toBeNull()
  })
})
