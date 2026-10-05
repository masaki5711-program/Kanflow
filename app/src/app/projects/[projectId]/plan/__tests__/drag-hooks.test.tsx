import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { KeyboardEvent, PointerEvent } from "react"
import { KEYBOARD_COMMIT_DELAY_MS, useBarDrag } from "../hooks/use-bar-drag"
import { isSpanVisible, revealItem, scrollLeftFor, scrollTimelineTo } from "../hooks/use-plan-scroll"
import { useRowDrag } from "../hooks/use-row-drag"
import { LONG_PRESS_MS } from "../lib/interaction"
import type { DatedPlanItem } from "../lib/plan-types"
import { mkItem } from "./fixtures"

const DAY = 10
const item = mkItem({ id: "i1", plannedStart: "2026-10-01", plannedEnd: "2026-10-05" }) as DatedPlanItem

function target() {
  let captured = false
  return {
    setPointerCapture: vi.fn(() => {
      captured = true
    }),
    hasPointerCapture: vi.fn(() => captured),
    releasePointerCapture: vi.fn(() => {
      captured = false
    }),
  }
}

function ev(clientX: number, tgt: ReturnType<typeof target>, pointerType = "mouse", timeStamp = 0, clientY = 0) {
  return { clientX, clientY, pointerId: 1, pointerType, timeStamp, button: 0, currentTarget: tgt, target: tgt, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as PointerEvent
}

function setup(canEdit = true) {
  const onPreview = vi.fn()
  const onCommit = vi.fn()
  const hook = renderHook(() => useBarDrag({ dayWidth: DAY, canEdit, onPreview, onCommit }))
  return { hook, onPreview, onCommit }
}

describe("useBarDrag", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("mouse: a small move is a click; a drag snaps to days and commits once", () => {
    const { hook, onPreview, onCommit } = setup()
    const h = hook.result.current.handlers
    const tgt = target()
    act(() => h.onPointerDown(ev(100, tgt), item, "leaf", "move"))
    expect(tgt.setPointerCapture).toHaveBeenCalled()
    act(() => h.onPointerMove(ev(102, tgt)))
    expect(onPreview).not.toHaveBeenCalled()
    act(() => h.onPointerMove(ev(126, tgt)))
    expect(onPreview).toHaveBeenLastCalledWith("i1", "2026-10-04", "2026-10-08")
    expect(hook.result.current.live).toEqual({ id: "i1", start: "2026-10-04", end: "2026-10-08" })
    act(() => h.onPointerUp())
    expect(onCommit).toHaveBeenCalledWith(item, "2026-10-04", "2026-10-08")
    expect(hook.result.current.live).toBeNull()
    expect(h.consumeClickSuppression()).toBe(true)
    expect(h.consumeClickSuppression()).toBe(false)
  })

  it("resize never ends before the start; summaries and read-only ignore pointers", () => {
    const { hook, onPreview, onCommit } = setup()
    const h = hook.result.current.handlers
    const tgt = target()
    act(() => h.onPointerDown(ev(100, tgt), item, "leaf", "resize"))
    act(() => h.onPointerMove(ev(40, tgt)))
    expect(onPreview).toHaveBeenLastCalledWith("i1", "2026-10-01", "2026-10-01")
    act(() => h.onPointerUp())
    expect(onCommit).toHaveBeenCalledWith(item, "2026-10-01", "2026-10-01")
    onCommit.mockClear()
    act(() => h.onPointerDown(ev(100, tgt), item, "summary", "move"))
    act(() => h.onPointerMove(ev(200, tgt)))
    act(() => h.onPointerUp())
    expect(onCommit).not.toHaveBeenCalled()
    const ro = setup(false)
    act(() => ro.hook.result.current.handlers.onPointerDown(ev(100, tgt), item, "leaf", "move"))
    act(() => ro.hook.result.current.handlers.onPointerMove(ev(200, tgt)))
    expect(ro.onPreview).not.toHaveBeenCalled()
  })

  it("milestones only move, even from the resize handle", () => {
    const { hook, onPreview } = setup()
    const ms = mkItem({ id: "m", isMilestone: true, plannedStart: "2026-10-05", plannedEnd: "2026-10-05" }) as DatedPlanItem
    const tgt = target()
    act(() => hook.result.current.handlers.onPointerDown(ev(0, tgt), ms, "milestone", "resize"))
    act(() => hook.result.current.handlers.onPointerMove(ev(20, tgt)))
    expect(onPreview).toHaveBeenLastCalledWith("m", "2026-10-07", "2026-10-07")
  })

  it("touch: a swipe before the long-press scrolls (no drag); a long-press drags", () => {
    const { hook, onPreview, onCommit } = setup()
    const h = hook.result.current.handlers
    const tgt = target()
    act(() => h.onPointerDown(ev(100, tgt, "touch", 0), item, "leaf", "move"))
    expect(tgt.setPointerCapture).not.toHaveBeenCalled()
    act(() => h.onPointerMove(ev(140, tgt, "touch", 50)))
    act(() => h.onPointerUp())
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()

    act(() => h.onPointerDown(ev(100, tgt, "touch", 1000), item, "leaf", "move"))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(h.isDragging()).toBe(true)
    expect(tgt.setPointerCapture).toHaveBeenCalled()
    expect(hook.result.current.live).toEqual({ id: "i1", start: "2026-10-01", end: "2026-10-05" })
    act(() => h.onPointerMove(ev(120, tgt, "touch", 1400)))
    act(() => h.onPointerUp())
    expect(onCommit).toHaveBeenCalledWith(item, "2026-10-03", "2026-10-07")
  })

  it("pointercancel after moving puts the bar back", () => {
    const { hook, onPreview, onCommit } = setup()
    const h = hook.result.current.handlers
    const tgt = target()
    act(() => h.onPointerDown(ev(100, tgt), item, "leaf", "move"))
    act(() => h.onPointerMove(ev(130, tgt)))
    act(() => h.onPointerCancel())
    expect(onPreview).toHaveBeenLastCalledWith("i1", "2026-10-01", "2026-10-05")
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("keyboard nudges commit once after a pause; Enter opens", () => {
    const { hook, onCommit } = setup()
    const h = hook.result.current.handlers
    const key = (k: string, shiftKey = false) => ({ key: k, shiftKey, preventDefault: vi.fn() }) as unknown as KeyboardEvent
    act(() => h.onKeyDown(key("ArrowRight"), item, "leaf", vi.fn()))
    act(() => h.onKeyDown(key("ArrowRight", true), item, "leaf", vi.fn()))
    expect(onCommit).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(KEYBOARD_COMMIT_DELAY_MS))
    expect(onCommit).toHaveBeenCalledWith(item, "2026-10-02", "2026-10-07")
    const onOpen = vi.fn()
    act(() => h.onKeyDown(key("Enter"), item, "leaf", onOpen))
    expect(onOpen).toHaveBeenCalledWith(item)
  })
})

describe("scroll helpers", () => {
  it("puts x at a third of the visible timeline", () => {
    expect(scrollLeftFor(900, 1200, 300)).toBe(600)
    expect(scrollLeftFor(100, 1200, 300)).toBe(0)
    expect(isSpanVisible(650, 100, 600, 1200, 300)).toBe(true)
    expect(isSpanVisible(1600, 100, 600, 1200, 300)).toBe(false)
  })

  it("scrollTimelineTo / revealItem move the container only when needed", () => {
    const el = document.createElement("div")
    Object.defineProperty(el, "clientWidth", { value: 1200 })
    const row = document.createElement("div")
    row.dataset.planRow = "x"
    row.scrollIntoView = vi.fn()
    el.appendChild(row)
    scrollTimelineTo(el, 900, 300)
    expect(el.scrollLeft).toBe(600)
    revealItem(el, "x", 650, 50, 300)
    expect(el.scrollLeft).toBe(600)
    revealItem(el, "x", 3000, 50, 300)
    expect(el.scrollLeft).toBe(2700)
    expect(row.scrollIntoView).toHaveBeenCalled()
    expect(() => scrollTimelineTo(null, 1, 1)).not.toThrow()
  })
})

describe("useRowDrag", () => {
  it("tracks the drop target on the window and drops on release", () => {
    const body = document.createElement("div")
    body.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    const onDrop = vi.fn()
    const { result } = renderHook(() => useRowDrag({ getBody: () => body, rowIds: ["a", "b", "c"], onDrop }))
    act(() => result.current.onHandlePointerDown({ button: 0, preventDefault: vi.fn() } as unknown as PointerEvent<HTMLElement>, "a"))
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 100 + 40 * 2 + 30 }))
    })
    expect(result.current.target).toEqual({ targetId: "c", position: "after" })
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"))
    })
    expect(onDrop).toHaveBeenCalledWith("a", { targetId: "c", position: "after" })
    expect(result.current.target).toBeNull()
  })

  it("cancel does not drop; dropping on itself is ignored", () => {
    const body = document.createElement("div")
    body.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    const onDrop = vi.fn()
    const { result } = renderHook(() => useRowDrag({ getBody: () => body, rowIds: ["a", "b"], onDrop }))
    const down = () => act(() => result.current.onHandlePointerDown({ button: 0, preventDefault: vi.fn() } as unknown as PointerEvent<HTMLElement>, "a"))
    down()
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 50 }))
      window.dispatchEvent(new MouseEvent("pointercancel"))
    })
    down()
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 5 }))
      window.dispatchEvent(new MouseEvent("pointerup"))
    })
    expect(onDrop).not.toHaveBeenCalled()
  })
})
