import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { ACTIVITY_EVENT, emitActivity } from "@/hooks/activity"
import { createRealtimeHub, type RealtimeHub, type RealtimeSignal } from "../realtime-hub"
import { RealtimeContext } from "../realtime-provider"
import { LIVE_DEBOUNCE_MS, matchesFilter, RESYNC_JITTER_MS, useLiveRefetch, useRealtimeConnected, type LiveRefetchOptions } from "../use-live-refetch"

const ev = (overrides: Partial<Extract<RealtimeSignal, { at: string }>> = {}): RealtimeSignal => ({
  type: "activity",
  projectId: "p1",
  entityType: "pbi",
  entityId: "b1",
  at: "t",
  ...overrides,
})

let hub: RealtimeHub
const wrapper = ({ children }: { children: ReactNode }) => <RealtimeContext.Provider value={hub}>{children}</RealtimeContext.Provider>

function setup(options: LiveRefetchOptions) {
  const onChange = vi.fn()
  const view = renderHook((props: LiveRefetchOptions) => useLiveRefetch(onChange, props), { wrapper, initialProps: options })
  return { onChange, ...view }
}

beforeEach(() => {
  vi.useFakeTimers()
  hub = createRealtimeHub()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("matchesFilter", () => {
  it("filters by type, project, entity type and entity ids", () => {
    const f = { types: ["activity" as const], projectId: "p1", entityTypes: ["pbi"], entityIds: ["b1"] }
    expect(matchesFilter(ev(), f)).toBe(true)
    expect(matchesFilter(ev({ type: "comment" }), f)).toBe(false)
    expect(matchesFilter(ev({ projectId: "p2" }), f)).toBe(false)
    expect(matchesFilter(ev({ entityType: "sprint" }), f)).toBe(false)
    expect(matchesFilter(ev({ entityType: undefined }), f)).toBe(false)
    expect(matchesFilter(ev({ entityId: "b2" }), f)).toBe(false)
  })

  it("a bulk event (no entityId) matches any entity; a single id may be a string", () => {
    expect(matchesFilter(ev({ entityId: undefined }), { types: ["activity"], entityIds: ["b9"] })).toBe(true)
    expect(matchesFilter(ev(), { types: ["activity"], entityIds: "b1" })).toBe(true)
  })

  it("resync matches unless opted out", () => {
    expect(matchesFilter({ type: "resync" }, { types: ["git"] })).toBe(true)
    expect(matchesFilter({ type: "resync" }, { types: ["git"], resync: false })).toBe(false)
  })
})

describe("useLiveRefetch", () => {
  it("coalesces a burst of matching events into one call after debounceMs, with the signals", () => {
    const { onChange } = setup({ types: ["activity"], projectId: "p1" })
    act(() => {
      hub.emit(ev({ entityId: "b1" }))
      hub.emit(ev({ entityId: "b2" }))
      hub.emit(ev({ projectId: "p2" }))
    })
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS - 1)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].map((s: { entityId?: string }) => s.entityId)).toEqual(["b1", "b2"])
  })

  it("a later burst starts a new window", () => {
    const { onChange } = setup({ types: ["activity"], debounceMs: 100 })
    act(() => hub.emit(ev()))
    vi.advanceTimersByTime(100)
    act(() => hub.emit(ev()))
    vi.advanceTimersByTime(100)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("fires once on a catch-up (resync), after the debounce plus a random jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    const { onChange } = setup({ types: ["git"] })
    act(() => hub.emit({ type: "resync" }))
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS + RESYNC_JITTER_MS / 2 - 1)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("holds while paused and runs once when unpaused", () => {
    const { onChange, rerender } = setup({ types: ["activity"], paused: true })
    act(() => hub.emit(ev()))
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS * 3)
    expect(onChange).not.toHaveBeenCalled()
    rerender({ types: ["activity"], paused: false })
    expect(onChange).toHaveBeenCalledTimes(1)
    rerender({ types: ["activity"], paused: true })
    rerender({ types: ["activity"], paused: false })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("does nothing when disabled or unmounted", () => {
    const disabled = setup({ types: ["activity"], enabled: false })
    act(() => hub.emit(ev()))
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS)
    expect(disabled.onChange).not.toHaveBeenCalled()

    const mounted = setup({ types: ["activity"] })
    act(() => hub.emit(ev()))
    mounted.unmount()
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS)
    expect(mounted.onChange).not.toHaveBeenCalled()
  })

  it("never fires outside a RealtimeProvider", () => {
    const onChange = vi.fn()
    renderHook(() => useLiveRefetch(onChange, { types: ["activity"] }))
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("requests made by the refresh do not count as user activity (idle logout)", () => {
    const activity = vi.fn()
    window.addEventListener(ACTIVITY_EVENT, activity)
    const onChange = vi.fn(() => emitActivity())
    renderHook(() => useLiveRefetch(onChange, { types: ["activity"] }), { wrapper })
    act(() => hub.emit(ev()))
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(activity).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    emitActivity()
    expect(activity).toHaveBeenCalledTimes(1)
    window.removeEventListener(ACTIVITY_EVENT, activity)
  })
})

describe("useRealtimeConnected", () => {
  it("follows the hub status; false without a provider", () => {
    const { result } = renderHook(() => useRealtimeConnected(), { wrapper })
    expect(result.current).toBe(false)
    act(() => hub.setStatus("open"))
    expect(result.current).toBe(true)
    act(() => hub.setStatus("fallback"))
    expect(result.current).toBe(false)
    expect(renderHook(() => useRealtimeConnected()).result.current).toBe(false)
  })
})
