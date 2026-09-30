import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useDragCreate } from "./use-drag-create"

describe("useDragCreate", () => {
  it("creates a normalized range when dragging backwards across days", () => {
    const onCreate = vi.fn()
    const { result } = renderHook(() => useDragCreate(true, onCreate))
    act(() => result.current.onDayMouseDown("2026-09-10"))
    act(() => result.current.onDayMouseEnter("2026-09-08"))
    expect(result.current.isMultiDayDrag).toBe(true)
    expect(result.current.isDayInDragRange("2026-09-09")).toBe(true)
    expect(result.current.isDayInDragRange("2026-09-11")).toBe(false)
    act(() => result.current.onMouseUp())
    expect(onCreate).toHaveBeenCalledWith("2026-09-08", "2026-09-10")
    expect(result.current.dragStart).toBeNull()
  })

  it("does nothing for a single-day click or when disabled", () => {
    const onCreate = vi.fn()
    const { result, rerender } = renderHook(({ on }) => useDragCreate(on, onCreate), { initialProps: { on: true } })
    act(() => result.current.onDayMouseDown("2026-09-10"))
    act(() => result.current.onMouseUp())
    expect(onCreate).not.toHaveBeenCalled()

    rerender({ on: false })
    act(() => result.current.onDayMouseDown("2026-09-10"))
    expect(result.current.dragStart).toBeNull()
    act(() => result.current.onDayMouseEnter("2026-09-12"))
    act(() => result.current.onMouseUp())
    expect(onCreate).not.toHaveBeenCalled()
    expect(result.current.isDayInDragRange("2026-09-10")).toBe(false)
  })

  it("cancels the drag when the pointer leaves the grid", () => {
    const onCreate = vi.fn()
    const { result } = renderHook(() => useDragCreate(true, onCreate))
    act(() => result.current.onDayMouseDown("2026-09-10"))
    act(() => result.current.onDayMouseEnter("2026-09-12"))
    act(() => result.current.onMouseLeave())
    expect(result.current.dragStart).toBeNull()
    act(() => result.current.onMouseUp())
    act(() => result.current.onMouseLeave())
    expect(onCreate).not.toHaveBeenCalled()
  })
})
