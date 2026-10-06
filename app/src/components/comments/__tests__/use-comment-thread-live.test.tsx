import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { createRealtimeHub, type RealtimeHub } from "@/components/realtime/realtime-hub"
import { RealtimeContext } from "@/components/realtime/realtime-provider"
import { rereadThread, useCommentCounts, useCommentThread } from "../use-comment-thread"
import type { CommentDto } from "../types"

const BASE = "/api/projects/p1/comments"
const THREAD = `${BASE}?entityType=sprint_task&entityId=t1`

const comment = (id: string, body = `body ${id}`): CommentDto => ({
  id,
  entityType: "sprint_task",
  entityId: "t1",
  author: { id: "u2", name: "Bob" },
  body,
  deleted: false,
  mentions: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  editedAt: null,
  canEdit: false,
  canDelete: false,
})

let routes: Record<string, (() => unknown) | undefined>
let hub: RealtimeHub
const wrapper = ({ children }: { children: ReactNode }) => <RealtimeContext.Provider value={hub}>{children}</RealtimeContext.Provider>

beforeEach(() => {
  hub = createRealtimeHub()
  routes = {}
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const handler = routes[String(input)]
      return new Response(JSON.stringify(handler ? handler() : { error: "no route" }), {
        status: handler ? 200 : 404,
        headers: { "content-type": "application/json" },
      })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe("useCommentThread — real-time", () => {
  it("someone else's new / edited / deleted comment shows in the open thread on a 'comment' event", async () => {
    routes[THREAD] = () => ({ items: [comment("c1")], nextCursor: null })
    const { result } = renderHook(() => useCommentThread("p1", "sprint_task", "t1"), { wrapper })
    await waitFor(() => expect(result.current.items.map((c) => c.id)).toEqual(["c1"]))

    routes[THREAD] = () => ({ items: [comment("c1", "edited"), comment("c2")], nextCursor: null })
    act(() => hub.emit({ type: "comment", projectId: "p1", entityType: "sprint_task", entityId: "t1", subjectId: "c2", action: "create", at: "t" }))
    await waitFor(() => expect(result.current.items.map((c) => c.body)).toEqual(["edited", "body c2"]), { timeout: 2000 })
  })

  it("ignores comments on other items and other projects", async () => {
    let reads = 0
    routes[THREAD] = () => {
      reads += 1
      return { items: [comment("c1")], nextCursor: null }
    }
    renderHook(() => useCommentThread("p1", "sprint_task", "t1"), { wrapper })
    await waitFor(() => expect(reads).toBe(1))
    act(() => {
      hub.emit({ type: "comment", projectId: "p1", entityType: "sprint_task", entityId: "t2", at: "t" })
      hub.emit({ type: "comment", projectId: "p2", entityType: "sprint_task", entityId: "t1", at: "t" })
      hub.emit({ type: "comment", projectId: "p1", entityType: "pbi", entityId: "t1", at: "t" })
    })
    await new Promise((r) => setTimeout(r, 700))
    expect(reads).toBe(1)
  })
})

describe("rereadThread", () => {
  it("reads at least the loaded count, or every page when the thread was complete", async () => {
    routes[THREAD] = () => ({ items: [comment("c1"), comment("c2")], nextCursor: "k2" })
    routes[`${THREAD}&cursor=k2`] = () => ({ items: [comment("c3")], nextCursor: null })
    expect((await rereadThread(THREAD, 2, false)).items.map((c) => c.id)).toEqual(["c1", "c2"])
    const all = await rereadThread(THREAD, 2, true)
    expect(all.items.map((c) => c.id)).toEqual(["c1", "c2", "c3"])
    expect(all.nextCursor).toBeNull()
  })
})

describe("useCommentCounts — real-time", () => {
  it("badges follow comment and notification events for the listed items", async () => {
    const url = `${BASE}/counts?entityType=sprint_task&ids=${encodeURIComponent("t1,t2")}`
    routes[url] = () => ({ counts: { t1: 1, t2: 0 } })
    const { result } = renderHook(() => useCommentCounts("p1", "sprint_task", ["t1", "t2"]), { wrapper })
    await waitFor(() => expect(result.current.counts).toEqual({ t1: 1, t2: 0 }))

    routes[url] = () => ({ counts: { t1: 1, t2: 1 }, unread: { t2: 1 } })
    act(() => hub.emit({ type: "notification", projectId: "p1", entityType: "sprint_task", entityId: "t2", at: "t" }))
    await waitFor(() => expect(result.current.unread).toEqual({ t2: 1 }), { timeout: 2000 })
    expect(result.current.counts.t2).toBe(1)
  })
})
