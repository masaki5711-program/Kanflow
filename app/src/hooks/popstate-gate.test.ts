// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { installPopstateGate, registerPopstateGuard } from "./popstate-gate"

installPopstateGate()
const router = vi.fn()
// Registered after the gate, like Next's App Router listener.
window.addEventListener("popstate", router)

afterEach(() => router.mockClear())

describe("popstate gate (F-02)", () => {
  it("passes events through without guards", () => {
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(router).toHaveBeenCalledTimes(1)
  })

  it("a guard returning true swallows the event before later listeners; false lets it through", () => {
    const guard = vi.fn(() => true)
    const off = registerPopstateGuard(guard)
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(guard).toHaveBeenCalledTimes(1)
    expect(router).not.toHaveBeenCalled()
    guard.mockReturnValueOnce(false)
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(router).toHaveBeenCalledTimes(1)
    off()
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(guard).toHaveBeenCalledTimes(2)
  })

  it("the newest guard decides; unregistering restores the previous one", () => {
    const outer = vi.fn(() => true)
    const inner = vi.fn(() => false)
    const offOuter = registerPopstateGuard(outer)
    const offInner = registerPopstateGuard(inner)
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
    offInner()
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(outer).toHaveBeenCalledTimes(1)
    offOuter()
  })

  it("installing twice registers one listener", () => {
    const add = vi.spyOn(window, "addEventListener")
    installPopstateGate()
    expect(add).not.toHaveBeenCalled()
    add.mockRestore()
  })
})
