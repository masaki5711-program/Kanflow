import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { jsonResponse, stubFetch } from "@/app/__tests__/test-utils"
import { createRealtimeHub } from "@/components/realtime/realtime-hub"
import { RealtimeContext } from "@/components/realtime/realtime-provider"
import { attachmentUrl, mergeMessages, reconcileLatest, TEAM_CHAT_READ_EVENT, useTeamChat } from "../use-team-chat"
import type { TeamMessage } from "../types"

const msg = (id: string, overrides: Partial<TeamMessage> = {}): TeamMessage => ({
  id,
  author: { id: "u1", name: "Alice" },
  body: `body ${id}`,
  createdAt: `2026-01-01T00:0${id}:00.000Z`,
  editedAt: null,
  mentions: [],
  mentionsMe: false,
  repliesToMe: false,
  attachments: [],
  source: null,
  replyTo: null,
  postedToThread: false,
  canDelete: false,
  ...overrides,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("mergeMessages", () => {
  it("appends new messages after the current ones", () => {
    expect(mergeMessages([msg("1")], [msg("2")])).toEqual([msg("1"), msg("2")])
  })

  it("drops incoming messages already present (id de-duplication)", () => {
    expect(mergeMessages([msg("1"), msg("2")], [msg("2"), msg("3")])).toEqual([msg("1"), msg("2"), msg("3")])
  })

  it("returns the current list unchanged when there is nothing new", () => {
    expect(mergeMessages([msg("1")], [msg("1")])).toEqual([msg("1")])
  })

  it("handles empty inputs", () => {
    expect(mergeMessages([], [])).toEqual([])
    expect(mergeMessages([], [msg("1")])).toEqual([msg("1")])
  })
})

describe("attachmentUrl", () => {
  it("builds the per-project, per-attachment URL, encoding both ids", () => {
    expect(attachmentUrl("p 1", "a/1")).toBe("/api/projects/p%201/talk/attachments/a%2F1")
  })
})

describe("useTeamChat", () => {
  it("loads the first page oldest-first and reads the prior-visit mark, then marks the chat read", async () => {
    const markReadCalls: string[] = []
    stubFetch([
      { match: "/api/projects/p1/talk/read", method: "GET", respond: () => jsonResponse({ lastReadAt: "2025-12-31T00:00:00.000Z" }) },
      { match: "/api/projects/p1/talk/read", method: "POST", respond: () => { markReadCalls.push("x"); return jsonResponse({ lastReadAt: "now" }) } },
      { match: "/api/projects/p1/talk/messages", method: "GET", respond: () => jsonResponse({ items: [msg("1"), msg("2")], hasMore: true }) },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.messages.map((m) => m.id)).toEqual(["1", "2"])
    expect(result.current.hasMore).toBe(true)
    await waitFor(() => expect(result.current.readMark).toBe("2025-12-31T00:00:00.000Z"))
    await waitFor(() => expect(markReadCalls).toHaveLength(1))
  })

  it("never read before: readMark resolves to null, not undefined", async () => {
    stubFetch([
      { match: "/api/projects/p1/talk/read", method: "GET", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: "/api/projects/p1/talk/read", method: "POST", respond: () => jsonResponse({ lastReadAt: "now" }) },
      { match: "/api/projects/p1/talk/messages", method: "GET", respond: () => jsonResponse({ items: [], hasMore: false }) },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.readMark).toBeNull())
  })

  it("sets readMark to null when the read-state fetch fails", async () => {
    stubFetch([
      { match: "/api/projects/p1/talk/read", method: "GET", respond: () => jsonResponse({ error: "down" }, 500) },
      { match: "/api/projects/p1/talk/read", method: "POST", respond: () => jsonResponse({ lastReadAt: "now" }) },
      { match: "/api/projects/p1/talk/messages", method: "GET", respond: () => jsonResponse({ items: [], hasMore: false }) },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.readMark).toBeNull())
  })

  it("forMe=true requests only the viewer's concerning messages", async () => {
    const urls: string[] = []
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: /\/talk\/messages/, respond: (u) => { urls.push(u); return jsonResponse({ items: [], hasMore: false }) } },
    ])
    renderHook(() => useTeamChat("p1", true))
    await waitFor(() => expect(urls.some((u) => u.includes("forMe=1"))).toBe(true))
  })

  it("surfaces a load error", async () => {
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: "/api/projects/p1/talk/messages", respond: () => jsonResponse({ error: "boom" }, 500) },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(result.current.loading).toBe(false)
  })

  it("poll merges new messages and re-marks read, but only while the document is visible", async () => {
    let afterParam: string | null = null
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: /\/talk\/messages\?after=/, respond: (u) => {
        afterParam = new URL(u, "http://localhost").searchParams.get("after")
        return jsonResponse({ items: [msg("3")], hasMore: false })
      } },
      { match: "/api/projects/p1/talk/messages", respond: () => jsonResponse({ items: [msg("1"), msg("2")], hasMore: false }) },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.poll())
    expect(result.current.messages.map((m) => m.id)).toEqual(["1", "2", "3"])
    expect(afterParam).toBe(msg("2").createdAt)

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    const before = result.current.messages.length
    await act(() => result.current.poll())
    expect(result.current.messages.length).toBe(before)
  })

  it("loadOlder prepends an earlier page and updates hasMore", async () => {
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: /\/talk\/messages\?before=/, respond: () => jsonResponse({ items: [msg("0")], hasMore: false }) },
      { match: "/api/projects/p1/talk/messages", respond: () => jsonResponse({ items: [msg("1")], hasMore: true }) },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["1"]))
    await act(() => result.current.loadOlder())
    expect(result.current.messages.map((m) => m.id)).toEqual(["0", "1"])
    expect(result.current.hasMore).toBe(false)
  })

  it("send posts a multipart body and appends the saved message", async () => {
    let seenBody: FormData | null = null
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: "/api/projects/p1/talk/messages", method: "GET", respond: () => jsonResponse({ items: [], hasMore: false }) },
      { match: "/api/projects/p1/talk/messages", method: "POST", respond: (_u, init) => { seenBody = init!.body as FormData; return jsonResponse(msg("9")) } },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const file = new File(["x"], "a.txt")
    await act(async () => { await result.current.send("hi", [file], "r1") })
    expect(result.current.messages.map((m) => m.id)).toEqual(["9"])
    expect(seenBody!.get("body")).toBe("hi")
    expect(seenBody!.get("replyToId")).toBe("r1")
    expect((seenBody!.get("files") as File).name).toBe("a.txt")
  })

  it("send omits replyToId when not replying", async () => {
    let seenBody: FormData | null = null
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: "/api/projects/p1/talk/messages", method: "GET", respond: () => jsonResponse({ items: [], hasMore: false }) },
      { match: "/api/projects/p1/talk/messages", method: "POST", respond: (_u, init) => { seenBody = init!.body as FormData; return jsonResponse(msg("9")) } },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.send("hi", [], null) })
    expect(seenBody!.has("replyToId")).toBe(false)
  })

  it("remove deletes and filters the message out locally", async () => {
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: "/api/projects/p1/talk/messages", method: "GET", respond: () => jsonResponse({ items: [msg("1"), msg("2")], hasMore: false }) },
      { match: /\/talk\/messages\/1$/, method: "DELETE", respond: () => jsonResponse({}) },
    ])
    const { result } = renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    await act(() => result.current.remove("1"))
    expect(result.current.messages.map((m) => m.id)).toEqual(["2"])
  })

  it("markRead dispatches the TEAM_CHAT_READ_EVENT with the project id", async () => {
    const seen: string[] = []
    const handler = (e: Event) => seen.push((e as CustomEvent<string>).detail)
    window.addEventListener(TEAM_CHAT_READ_EVENT, handler)
    stubFetch([
      { match: "/api/projects/p1/talk/read", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: "/api/projects/p1/talk/messages", respond: () => jsonResponse({ items: [], hasMore: false }) },
    ])
    renderHook(() => useTeamChat("p1", false))
    await waitFor(() => expect(seen).toEqual(["p1"]))
    window.removeEventListener(TEAM_CHAT_READ_EVENT, handler)
  })
})

describe("reconcileLatest", () => {
  it("keeps older loaded messages and takes the server's version of the latest page (new, edited, deleted)", () => {
    const current = [msg("1"), msg("2", { body: "old" }), msg("3")]
    const page = { items: [msg("2", { body: "edited" }), msg("4")], hasMore: true }
    expect(reconcileLatest(current, page)).toEqual([msg("1"), msg("2", { body: "edited" }), msg("4")])
  })

  it("a latest page without more = the whole chat", () => {
    expect(reconcileLatest([msg("1"), msg("2")], { items: [msg("2")], hasMore: false })).toEqual([msg("2")])
    expect(reconcileLatest([msg("1")], { items: [], hasMore: false })).toEqual([])
    expect(reconcileLatest([msg("1")], { items: [], hasMore: true })).toEqual([msg("1")])
  })
})

describe("useTeamChat — real-time", () => {
  it("another member's message appears on a 'team-message' event without waiting for the poll", async () => {
    const hub = createRealtimeHub()
    let latestPage = { items: [msg("1")], hasMore: false }
    const reads: string[] = []
    stubFetch([
      { match: "/api/projects/p1/talk/read", method: "GET", respond: () => jsonResponse({ lastReadAt: null }) },
      { match: "/api/projects/p1/talk/read", method: "POST", respond: () => { reads.push("x"); return jsonResponse({ lastReadAt: "now" }) } },
      { match: "/api/projects/p1/talk/messages", method: "GET", respond: () => jsonResponse(latestPage) },
    ])
    const wrapper = ({ children }: { children: ReactNode }) => <RealtimeContext.Provider value={hub}>{children}</RealtimeContext.Provider>
    const { result } = renderHook(() => useTeamChat("p1", false), { wrapper })
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["1"]))
    await waitFor(() => expect(reads).toHaveLength(1))

    latestPage = { items: [msg("1"), msg("2", { author: { id: "u2", name: "Bob" } })], hasMore: false }
    act(() => hub.emit({ type: "team-message", projectId: "p1", entityType: "team_message", entityId: "2", action: "create", at: "t" }))
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["1", "2"]), { timeout: 2000 })
    // Seen at once: the chat is marked read again.
    await waitFor(() => expect(reads).toHaveLength(2))

    // A deleted message disappears; events of other projects are ignored.
    latestPage = { items: [msg("2")], hasMore: false }
    act(() => hub.emit({ type: "team-message", projectId: "p2", at: "t" }))
    act(() => hub.emit({ type: "team-message", projectId: "p1", entityId: "1", action: "delete", at: "t" }))
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["2"]), { timeout: 2000 })
  })
})
