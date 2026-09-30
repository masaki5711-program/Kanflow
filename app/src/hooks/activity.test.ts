import { afterEach, describe, expect, it, vi } from "vitest"
import { ACTIVITY_EVENT, emitActivity } from "./activity"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("emitActivity", () => {
  it("dispatches the activity event on window", () => {
    const target = new EventTarget()
    vi.stubGlobal("window", { dispatchEvent: target.dispatchEvent.bind(target) })
    const onActivity = vi.fn()
    target.addEventListener(ACTIVITY_EVENT, onActivity)

    emitActivity()

    expect(onActivity).toHaveBeenCalledTimes(1)
  })

  it("does not patch window.fetch", () => {
    const originalFetch = vi.fn() as unknown as typeof fetch
    const target = new EventTarget()
    const win = { fetch: originalFetch, dispatchEvent: target.dispatchEvent.bind(target) }
    vi.stubGlobal("window", win)

    emitActivity()

    expect(win.fetch).toBe(originalFetch)
  })

  it("is a no-op without a window (SSR)", () => {
    vi.stubGlobal("window", undefined)
    expect(() => emitActivity()).not.toThrow()
  })
})
