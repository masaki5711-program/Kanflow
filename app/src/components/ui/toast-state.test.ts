import { describe, expect, it } from "vitest"
import { toastReducer, type ToastItem } from "./toast-state"

function toast(id: number, message = `m${id}`, kind: ToastItem["kind"] = "info"): ToastItem {
  return { id, kind, message, duration: 1000 }
}

describe("toastReducer", () => {
  it("appends new toasts at the end", () => {
    const state = toastReducer([toast(1)], { type: "add", toast: toast(2) })
    expect(state.map((t) => t.id)).toEqual([1, 2])
  })

  it("drops the oldest toasts beyond the max stack", () => {
    let state: readonly ToastItem[] = []
    for (let i = 1; i <= 5; i++) state = toastReducer(state, { type: "add", toast: toast(i), max: 3 })
    expect(state.map((t) => t.id)).toEqual([3, 4, 5])
  })

  it("collapses an identical toast instead of stacking duplicates", () => {
    const state = toastReducer([toast(1, "saved", "success")], { type: "add", toast: toast(2, "saved", "success") })
    expect(state.map((t) => t.id)).toEqual([2])
  })

  it("keeps same text with a different kind", () => {
    const state = toastReducer([toast(1, "x", "info")], { type: "add", toast: toast(2, "x", "error") })
    expect(state).toHaveLength(2)
  })

  it("removes by id and clears", () => {
    const initial = [toast(1), toast(2)]
    expect(toastReducer(initial, { type: "remove", id: 1 }).map((t) => t.id)).toEqual([2])
    expect(toastReducer(initial, { type: "clear" })).toEqual([])
    expect(initial).toHaveLength(2)
  })
})
