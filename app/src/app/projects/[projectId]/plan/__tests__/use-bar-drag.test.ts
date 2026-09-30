// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import type { KeyboardEvent, PointerEvent } from "react"
import { KEYBOARD_COMMIT_DELAY_MS, useBarDrag } from "../use-bar-drag"
import type { PlanItem } from "../lib/plan-utils"

const DAY = 10
const start = new Date(2026, 2, 10, 12)
const end = new Date(2026, 2, 15, 12)

const item: PlanItem = {
  id: "i1", projectId: "p", parentId: null, name: "Bar", description: null,
  plannedStart: start.toISOString(), plannedEnd: end.toISOString(),
  actualStart: null, actualEnd: null, progressPct: 0, color: null,
  status: "in_progress", sortOrder: 0, isMilestone: false, notes: null,
}

function makeTarget() {
  let captured = false
  return {
    setPointerCapture: vi.fn(() => { captured = true }),
    hasPointerCapture: vi.fn(() => captured),
    releasePointerCapture: vi.fn(() => { captured = false }),
  }
}

function ev(clientX: number, target: ReturnType<typeof makeTarget>) {
  return {
    clientX,
    pointerId: 7,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent & { preventDefault: ReturnType<typeof vi.fn> }
}

function setup(canEdit = true) {
  const onPreview = vi.fn()
  const onCommit = vi.fn()
  const { result } = renderHook(() => useBarDrag({ dayWidth: DAY, canEdit, onPreview, onCommit }))
  return { h: result.current, onPreview, onCommit }
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const shift = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)

describe("useBarDrag", () => {
  it("move: snaps to whole days, previews each change once and commits on release", () => {
    const { h, onPreview, onCommit } = setup()
    const target = makeTarget()
    const down = ev(100, target)
    h.onPointerDown(down, item, "move")
    expect(down.preventDefault).toHaveBeenCalled()
    expect(target.setPointerCapture).toHaveBeenCalledWith(7)

    h.onPointerMove(ev(104, target)) // rounds to 0 days → no preview
    expect(onPreview).not.toHaveBeenCalled()
    h.onPointerMove(ev(126, target)) // +2.6 → 3 days
    h.onPointerMove(ev(128, target)) // still 3 days → deduped
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledWith("i1", shift(start, 3).toISOString(), shift(end, 3).toISOString())

    h.onPointerUp(ev(128, target))
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(onCommit).toHaveBeenCalledWith("i1", ymd(shift(start, 3)), ymd(shift(end, 3)))

    // After release, further moves are ignored.
    h.onPointerMove(ev(300, target))
    expect(onPreview).toHaveBeenCalledTimes(1)
  })

  it("move backwards shifts both dates earlier", () => {
    const { h, onCommit } = setup()
    const target = makeTarget()
    h.onPointerDown(ev(100, target), item, "move")
    h.onPointerMove(ev(80, target))
    h.onPointerUp(ev(80, target))
    expect(onCommit).toHaveBeenCalledWith("i1", ymd(shift(start, -2)), ymd(shift(end, -2)))
  })

  it("resize changes only the end and never lets it cross the start", () => {
    const { h, onPreview, onCommit } = setup()
    const target = makeTarget()
    h.onPointerDown(ev(0, target), item, "resize")
    h.onPointerMove(ev(20, target))
    expect(onPreview).toHaveBeenLastCalledWith("i1", start.toISOString(), shift(end, 2).toISOString())
    // -6 days would put end before start → keep the last valid end
    h.onPointerMove(ev(-60, target))
    expect(onPreview).toHaveBeenCalledTimes(1)
    h.onPointerUp(ev(-60, target))
    expect(onCommit).toHaveBeenCalledWith("i1", ymd(start), ymd(shift(end, 2)))
  })

  it("a click without movement does not commit", () => {
    const { h, onCommit } = setup()
    const target = makeTarget()
    h.onPointerDown(ev(50, target), item, "move")
    h.onPointerUp(ev(50, target))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("ignores pointer up/move with no active drag", () => {
    const { h, onCommit, onPreview } = setup()
    const target = makeTarget()
    h.onPointerMove(ev(50, target))
    h.onPointerUp(ev(50, target))
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("does nothing for read-only users or milestones", () => {
    const ro = setup(false)
    const target = makeTarget()
    const down = ev(0, target)
    ro.h.onPointerDown(down, item, "move")
    ro.h.onPointerMove(ev(100, target))
    ro.h.onPointerUp(ev(100, target))
    expect(down.preventDefault).not.toHaveBeenCalled()
    expect(ro.onCommit).not.toHaveBeenCalled()

    const ed = setup(true)
    ed.h.onPointerDown(ev(0, target), { ...item, isMilestone: true }, "move")
    ed.h.onPointerMove(ev(100, target))
    ed.h.onPointerUp(ev(100, target))
    expect(ed.onPreview).not.toHaveBeenCalled()
    expect(ed.onCommit).not.toHaveBeenCalled()
  })
})

function key(k: string, shiftKey = false) {
  return { key: k, shiftKey, preventDefault: vi.fn() } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> }
}

describe("useBarDrag keyboard", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("Enter and Space open the editor", () => {
    const { h, onCommit } = setup()
    const onOpen = vi.fn()
    const enter = key("Enter")
    h.onKeyDown(enter, item, onOpen)
    h.onKeyDown(key(" "), item, onOpen)
    expect(enter.preventDefault).toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("arrow keys move by a day, previewing each press and committing once after a pause", () => {
    vi.useFakeTimers()
    const { h, onPreview, onCommit } = setup()
    const onOpen = vi.fn()
    h.onKeyDown(key("ArrowRight"), item, onOpen)
    h.onKeyDown(key("ArrowRight"), item, onOpen)
    h.onKeyDown(key("ArrowLeft"), item, onOpen)
    h.onKeyDown(key("ArrowRight"), item, onOpen)
    expect(onPreview).toHaveBeenCalledTimes(4)
    expect(onPreview).toHaveBeenLastCalledWith("i1", shift(start, 2).toISOString(), shift(end, 2).toISOString())
    expect(onCommit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(KEYBOARD_COMMIT_DELAY_MS)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith("i1", ymd(shift(start, 2)), ymd(shift(end, 2)))
  })

  it("Shift+arrow resizes the end but never before the start; blur commits immediately", () => {
    const { h, onPreview, onCommit } = setup()
    const sameDay = { ...item, plannedEnd: item.plannedStart }
    h.onKeyDown(key("ArrowLeft", true), sameDay, vi.fn())
    expect(onPreview).not.toHaveBeenCalled()
    h.onKeyDown(key("ArrowRight", true), sameDay, vi.fn())
    expect(onPreview).toHaveBeenLastCalledWith("i1", start.toISOString(), shift(start, 1).toISOString())
    h.onBlur()
    expect(onCommit).toHaveBeenCalledWith("i1", ymd(start), ymd(shift(start, 1)))
    h.onBlur()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it("ignores unrelated keys, read-only users and milestones", () => {
    const ro = setup(false)
    const other = key("a")
    ro.h.onKeyDown(other, item, vi.fn())
    expect(other.preventDefault).not.toHaveBeenCalled()
    ro.h.onKeyDown(key("ArrowRight"), item, vi.fn())
    expect(ro.onPreview).not.toHaveBeenCalled()
    const ed = setup(true)
    ed.h.onKeyDown(key("ArrowRight"), { ...item, isMilestone: true }, vi.fn())
    expect(ed.onPreview).not.toHaveBeenCalled()
  })
})
