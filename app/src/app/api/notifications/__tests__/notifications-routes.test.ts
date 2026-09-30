/**
 * /api/notifications/* and /api/user/activity (self-service, session only).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => {
  const log = { debug() {}, info() {}, warn() {}, error() {}, child: () => log }
  return { logger: log }
})
vi.mock("@/services/notifications/notifications.service", () => ({
  listMyNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}))
vi.mock("@/services/activity/activity.service", () => ({ listUserActivity: vi.fn() }))

const svc = await import("@/services/notifications/notifications.service")
const act = await import("@/services/activity/activity.service")
const list = await import("@/app/api/notifications/route")
const unread = await import("@/app/api/notifications/unread-count/route")
const readOne = await import("@/app/api/notifications/[id]/read/route")
const readAll = await import("@/app/api/notifications/read-all/route")
const prefs = await import("@/app/api/notifications/preferences/route")
const myActivity = await import("@/app/api/user/activity/route")
const { NotFoundError } = await import("@/services/_shared/errors")

const URL_BASE = "http://localhost/api/notifications"
const signedIn = () => authMock.mockResolvedValue({ user: { id: "u1", name: "Alice", role: "member" } })
const json = async (res: Response | undefined) => ({ status: res!.status, body: await res!.json() })
const put = (body: unknown) =>
  new Request(`${URL_BASE}/preferences`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockReset()
})

describe("auth", () => {
  it("every handler answers 401 without a session", async () => {
    authMock.mockResolvedValue(null)
    const responses = await Promise.all([
      list.GET(new Request(URL_BASE)),
      unread.GET(),
      readOne.POST(new Request(URL_BASE, { method: "POST" }), idCtx("n1")),
      readAll.POST(),
      prefs.GET(),
      prefs.PUT(put({ preferences: [{ type: "assigned", enabled: false }] })),
      myActivity.GET(new Request("http://localhost/api/user/activity")),
    ])
    expect(responses.map((r) => r!.status)).toEqual([401, 401, 401, 401, 401, 401, 401])
    expect(svc.listMyNotifications).not.toHaveBeenCalled()
    expect(svc.updateNotificationPreferences).not.toHaveBeenCalled()
  })
})

describe("GET /api/notifications", () => {
  it("lists my notifications (always scoped to the session user)", async () => {
    signedIn()
    const page = { items: [], nextCursor: null, unreadCount: 3 }
    vi.mocked(svc.listMyNotifications).mockResolvedValue(page)
    expect(await json(await list.GET(new Request(`${URL_BASE}?unreadOnly=true&limit=20`)))).toEqual({ status: 200, body: page })
    expect(svc.listMyNotifications).toHaveBeenCalledWith("u1", { limit: 20, unreadOnly: true })
  })

  it("defaults and validation", async () => {
    signedIn()
    vi.mocked(svc.listMyNotifications).mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 })
    await list.GET(new Request(URL_BASE))
    expect(svc.listMyNotifications).toHaveBeenCalledWith("u1", { limit: 50, unreadOnly: false })
    expect((await list.GET(new Request(`${URL_BASE}?limit=500`)))!.status).toBe(400)
    expect((await list.GET(new Request(`${URL_BASE}?unreadOnly=maybe`)))!.status).toBe(400)
  })

  it("unread-count", async () => {
    signedIn()
    vi.mocked(svc.getUnreadCount).mockResolvedValue({ unreadCount: 4 })
    expect(await json(await unread.GET())).toEqual({ status: 200, body: { unreadCount: 4 } })
    vi.mocked(svc.getUnreadCount).mockRejectedValue(new Error("db"))
    expect((await unread.GET())!.status).toBe(500)
  })
})

describe("mark read", () => {
  it("marks one of mine read", async () => {
    signedIn()
    vi.mocked(svc.markNotificationRead).mockResolvedValue(undefined)
    const res = await readOne.POST(new Request(URL_BASE, { method: "POST" }), idCtx("n1"))
    expect(await json(res)).toEqual({ status: 200, body: { success: true } })
    expect(svc.markNotificationRead).toHaveBeenCalledWith("u1", "n1")
  })

  it("404 for someone else's notification", async () => {
    signedIn()
    vi.mocked(svc.markNotificationRead).mockRejectedValue(new NotFoundError())
    expect((await readOne.POST(new Request(URL_BASE, { method: "POST" }), idCtx("theirs")))!.status).toBe(404)
  })

  it("read-all returns the count", async () => {
    signedIn()
    vi.mocked(svc.markAllNotificationsRead).mockResolvedValue({ updated: 7 })
    expect(await json(await readAll.POST())).toEqual({ status: 200, body: { updated: 7 } })
    expect(svc.markAllNotificationsRead).toHaveBeenCalledWith("u1")
  })
})

describe("preferences", () => {
  const all = { preferences: [{ type: "assigned" as const, enabled: false }] }

  it("GET returns my preferences", async () => {
    signedIn()
    vi.mocked(svc.getNotificationPreferences).mockResolvedValue(all)
    expect(await json(await prefs.GET())).toEqual({ status: 200, body: all })
  })

  it("PUT validates and updates", async () => {
    signedIn()
    vi.mocked(svc.updateNotificationPreferences).mockResolvedValue(all)
    expect(await json(await prefs.PUT(put(all)))).toEqual({ status: 200, body: all })
    expect(svc.updateNotificationPreferences).toHaveBeenCalledWith("u1", all)
  })

  it.each([{}, { preferences: [] }, { preferences: [{ type: "spam", enabled: true }] }, { preferences: [{ type: "assigned" }] }])(
    "PUT 400 for %j",
    async (body) => {
      signedIn()
      expect((await prefs.PUT(put(body)))!.status).toBe(400)
      expect(svc.updateNotificationPreferences).not.toHaveBeenCalled()
    }
  )

  it("PUT 400 for malformed JSON", async () => {
    signedIn()
    const bad = new Request(`${URL_BASE}/preferences`, { method: "PUT", body: "{" })
    expect((await prefs.PUT(bad))!.status).toBe(400)
  })
})

describe("GET /api/user/activity", () => {
  it("returns my own activity", async () => {
    signedIn()
    vi.mocked(act.listUserActivity).mockResolvedValue({ items: [], nextCursor: null })
    const res = await myActivity.GET(new Request("http://localhost/api/user/activity?limit=10"))
    expect(await json(res)).toEqual({ status: 200, body: { items: [], nextCursor: null } })
    expect(act.listUserActivity).toHaveBeenCalledWith("u1", { limit: 10 })
  })

  it("400 on a bad limit", async () => {
    signedIn()
    expect((await myActivity.GET(new Request("http://localhost/api/user/activity?limit=0")))!.status).toBe(400)
  })
})
