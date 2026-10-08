import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, waitFor } from "@testing-library/react"
import { jsonResponse, renderWithProviders, stubFetch } from "@/app/__tests__/test-utils"
import { createRealtimeHub } from "@/components/realtime/realtime-hub"
import { RealtimeContext } from "@/components/realtime/realtime-provider"
import { DesktopNotifier } from "./desktop-notifier"
import { createSeenSet, desktopNotifyState, enableDesktopNotify } from "./desktop-notify"
import type { NotificationItem } from "./notification-format"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "me" } }, status: "authenticated" }) }))

const popups: Array<{ title: string; body: string; tag: string }> = []
let permission: NotificationPermission = "granted"
let hidden = true

class FakeNotification {
  static get permission() {
    return permission
  }
  static requestPermission = vi.fn(async () => permission)
  onclick: (() => void) | null = null
  constructor(title: string, options: { body: string; tag: string }) {
    popups.push({ title, body: options.body, tag: options.tag })
  }
  close() {}
}

const item = (id: string): NotificationItem => ({
  id,
  type: "assigned",
  projectId: "p1",
  project: { id: "p1", name: "Apollo" },
  entityType: "sprint_task",
  entityId: "t1",
  payload: { entityLabel: "Write tests", actorName: "Alice" },
  readAt: null,
  createdAt: new Date().toISOString(),
})

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage())
  popups.length = 0
  permission = "granted"
  hidden = true
  window.localStorage.setItem("kanflow:desktop-notify", "1")
  vi.stubGlobal("Notification", FakeNotification)
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") })
  vi.spyOn(document, "hasFocus").mockImplementation(() => !hidden)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mount(listings: NotificationItem[][], chat: unknown[] = []) {
  const queue = [...listings]
  stubFetch([
    { match: "/api/notifications", respond: () => jsonResponse({ items: queue.length > 1 ? queue.shift() : queue[0], nextCursor: null, unreadCount: 1 }) },
    { match: "/api/projects/p1/talk/messages", respond: () => jsonResponse({ items: chat, hasMore: false }) },
  ])
  const hub = createRealtimeHub()
  renderWithProviders(
    <RealtimeContext.Provider value={hub}>
      <DesktopNotifier />
    </RealtimeContext.Provider>,
  )
  return hub
}

const emit = (hub: ReturnType<typeof createRealtimeHub>, signal: Parameters<ReturnType<typeof createRealtimeHub>["emit"]>[0]) =>
  act(async () => {
    hub.emit(signal)
    await new Promise((r) => setTimeout(r, 600))
  })

describe("DesktopNotifier", () => {
  it("shows a popup for a notification that arrives while the tab is in the background", async () => {
    const hub = mount([[], [item("n1")]])
    await emit(hub, { type: "notification", at: "2026-10-08T00:00:00Z" })
    await waitFor(() => expect(popups).toHaveLength(1))
    expect(popups[0]).toMatchObject({ title: "Kanflow · Apollo", tag: "notification-n1" })
  })

  it("stays silent for what was already unread when the tab opened", async () => {
    const hub = mount([[item("n1")], [item("n1")]])
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    await emit(hub, { type: "notification", at: "2026-10-08T00:00:00Z" })
    expect(popups).toHaveLength(0)
  })

  it("does not pop up while the tab is in the foreground (the bell shows it)", async () => {
    hidden = false
    const hub = mount([[], [item("n1")]])
    await emit(hub, { type: "notification", at: "2026-10-08T00:00:00Z" })
    expect(popups).toHaveLength(0)
  })

  it("announces another member's chat message, but not mentions (they arrive as notifications)", async () => {
    const msg = (id: string, over: object = {}) => ({ id, author: { id: "u2", name: "Bob" }, body: "hello team", mentionsMe: false, repliesToMe: false, ...over })
    const hub = mount([[]], [msg("m1")])
    await emit(hub, { type: "team-message", projectId: "p1", action: "create", actorId: "u2", at: "2026-10-08T00:00:00Z" })
    await waitFor(() => expect(popups).toHaveLength(1))
    expect(popups[0]).toMatchObject({ body: "hello team", tag: "chat-p1" })
  })

  it("ignores my own chat messages", async () => {
    const hub = mount([[]], [{ id: "m1", author: { id: "me", name: "Me" }, body: "mine", mentionsMe: false, repliesToMe: false }])
    await emit(hub, { type: "team-message", projectId: "p1", action: "create", actorId: "me", at: "2026-10-08T00:00:00Z" })
    expect(popups).toHaveLength(0)
  })

  it("shows nothing when the user has not turned it on", async () => {
    window.localStorage.removeItem("kanflow:desktop-notify")
    const hub = mount([[], [item("n1")]])
    await emit(hub, { type: "notification", at: "2026-10-08T00:00:00Z" })
    expect(popups).toHaveLength(0)
  })
})

describe("desktop-notify state", () => {
  it("reports blocked when the browser denied it", () => {
    permission = "denied"
    expect(desktopNotifyState()).toBe("blocked")
  })

  it("turning it on asks the browser and remembers a grant", async () => {
    window.localStorage.clear()
    permission = "default"
    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      permission = "granted"
      return "granted"
    })
    expect(await enableDesktopNotify()).toBe("on")
  })

  it("remembers ids once and forgets the oldest past the cap", () => {
    const seen = createSeenSet()
    seen.add("a")
    expect(seen.has("a")).toBe(true)
    for (let i = 0; i < 250; i++) seen.add(`x${i}`)
    expect(seen.has("a")).toBe(false)
    expect(seen.has("x249")).toBe(true)
  })
})
