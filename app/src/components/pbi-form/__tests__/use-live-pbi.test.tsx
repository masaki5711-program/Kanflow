import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { SessionContext } from "next-auth/react"
import { createRealtimeHub, type RealtimeHub } from "@/components/realtime/realtime-hub"
import { RealtimeContext } from "@/components/realtime/realtime-provider"
import { LIVE_DEBOUNCE_MS } from "@/components/realtime/use-live-refetch"
import { useLivePbi } from "../use-live-pbi"

let hub: RealtimeHub
const session = { data: { user: { id: "me" }, expires: "" }, status: "authenticated", update: async () => null } as never
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionContext.Provider value={session}>
    <RealtimeContext.Provider value={hub}>{children}</RealtimeContext.Provider>
  </SessionContext.Provider>
)
const change = (actorId: string, entityId = "b1") => ({ type: "activity" as const, projectId: "p1", entityType: "pbi", entityId, actorId, at: "t" })

beforeEach(() => {
  vi.useFakeTimers()
  hub = createRealtimeHub()
})
afterEach(() => vi.useRealTimers())

function setup(isEditing: boolean) {
  const refetch = vi.fn()
  const view = renderHook((editing: boolean) => useLivePbi({ projectId: "p1", pbiId: "b1", isEditing: editing, refetch }), { wrapper, initialProps: isEditing })
  return { refetch, ...view }
}

describe("useLivePbi", () => {
  it("read mode: another change of this PBI reloads it; other PBIs are ignored", () => {
    const { refetch, result } = setup(false)
    act(() => hub.emit(change("u2", "b9")))
    act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS))
    expect(refetch).not.toHaveBeenCalled()
    act(() => hub.emit(change("u2")))
    act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS))
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(result.current.remoteChanged).toBe(false)
  })

  it("edit mode: never reloads under the form; someone else's save shows the hint, the viewer's own does not", () => {
    const { refetch, result, rerender } = setup(true)
    act(() => hub.emit(change("me")))
    act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS))
    expect(result.current.remoteChanged).toBe(false)
    act(() => hub.emit(change("u2")))
    act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS))
    expect(refetch).not.toHaveBeenCalled()
    expect(result.current.remoteChanged).toBe(true)

    // Leaving edit mode (cancel / save) clears the hint and loads the other user's version.
    act(() => result.current.leaveEdit())
    rerender(false)
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(result.current.remoteChanged).toBe(false)
  })
})
