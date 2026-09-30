import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useStableCallback, useStableHandlers } from "./use-stable-callback"

describe("useStableCallback", () => {
  it("keeps the same identity across renders and calls the latest function", () => {
    const first = vi.fn((n: number) => n + 1)
    const second = vi.fn((n: number) => n + 2)
    const { result, rerender } = renderHook(({ fn }) => useStableCallback(fn), { initialProps: { fn: first } })
    const initial = result.current

    rerender({ fn: second })

    expect(result.current).toBe(initial)
    expect(result.current(1)).toBe(3)
    expect(second).toHaveBeenCalledWith(1)
    expect(first).not.toHaveBeenCalled()
  })
})

describe("useStableHandlers", () => {
  it("returns a stable object whose functions call the latest handlers", () => {
    const a1 = vi.fn(() => "a1")
    const a2 = vi.fn(() => "a2")
    const b = vi.fn((x: number) => x * 2)
    const { result, rerender } = renderHook(({ handlers }) => useStableHandlers(handlers), {
      initialProps: { handlers: { a: a1, b } as { a: () => string; b: (x: number) => number } },
    })
    const initial = result.current
    const initialA = result.current.a

    rerender({ handlers: { a: a2, b } })

    expect(result.current).toBe(initial)
    expect(result.current.a).toBe(initialA)
    expect(result.current.a()).toBe("a2")
    expect(result.current.b(4)).toBe(8)
    expect(a1).not.toHaveBeenCalled()
  })
})
