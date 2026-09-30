import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { NotificationBell } from "./notification-bell"
import { UNREAD_POLL_MS } from "./use-unread-count"
import type { NotificationItem } from "./notification-format"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const t = tr("en")
let visibility: DocumentVisibilityState = "visible"

beforeEach(() => {
  router.push.mockClear()
  visibility = "visible"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const n = (id: string, type: string, payload: Record<string, unknown>, over: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  type,
  projectId: "p1",
  project: { id: "p1", name: "Apollo" },
  entityType: null,
  entityId: null,
  payload,
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...over,
})

const ITEMS: NotificationItem[] = [
  n("n1", "assigned", { entityLabel: "Write tests", actorName: "Alice" }, { entityType: "sprint_task", entityId: "t1" }),
  n("n2", "sprint_start", { sprintName: "S5", startDate: "2026-10-01T00:00:00Z", endDate: "2026-10-14T00:00:00Z" }, { entityType: "sprint", entityId: "s5" }),
  n("n3", "sprint_end", { sprintName: "S4" }, { readAt: "2026-09-30T00:00:00Z" }),
  n("n4", "due_soon", { entityLabel: "Deploy", dueDate: "2026-10-03" }),
  n("n5", "overdue", { entityLabel: "Docs", dueDate: "2026-09-20" }),
  n("n6", "surveillance_critical", { title: "Daily", projectName: "Apollo", criticalCount: 3 }),
  n("n7", "mentioned", { entityLabel: "#7 Login", actorName: "Bob", entityType: "pbi", entityId: "b7" }),
  n("n8", "comment", { entityLabel: "#2 Idea", actorName: "Eve", entityType: "icebox", entityId: "i2" }),
]

function stubApi(opts: { unread?: number; items?: NotificationItem[]; nextCursor?: string | null } = {}) {
  return stubFetch([
    { match: "/api/notifications/unread-count", respond: () => jsonResponse({ unreadCount: opts.unread ?? 3 }) },
    { match: /\/api\/notifications\/[^/]+\/read$/, method: "POST", respond: () => jsonResponse({ success: true }) },
    { match: "/api/notifications/read-all", method: "POST", respond: () => jsonResponse({ updated: 3 }) },
    {
      match: /\/api\/notifications\?limit=20&cursor=/,
      respond: () => jsonResponse({ items: [n("old", "sprint_end", { sprintName: "S1" })], nextCursor: null, unreadCount: 3 }),
    },
    {
      match: /\/api\/notifications\?limit=20$/,
      respond: () => jsonResponse({ items: opts.items ?? ITEMS, nextCursor: opts.nextCursor ?? null, unreadCount: opts.unread ?? 3 }),
    },
  ])
}

const countCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter(([u]) => String(u) === "/api/notifications/unread-count").length

describe("NotificationBell polling", () => {
  it("shows the unread badge and polls every 60 s only while the tab is visible", async () => {
    vi.useFakeTimers()
    const fetchMock = stubApi({ unread: 4 })
    renderWithProviders(<NotificationBell />, { language: "en" })
    await act(async () => {})
    expect(countCalls(fetchMock)).toBe(1)
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("4")
    expect(screen.getByRole("button", { name: "Notifications (4 unread)" })).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(UNREAD_POLL_MS))
    expect(countCalls(fetchMock)).toBe(2)

    visibility = "hidden"
    await act(async () => vi.advanceTimersByTime(UNREAD_POLL_MS * 3))
    expect(countCalls(fetchMock)).toBe(2)

    visibility = "visible"
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
    expect(countCalls(fetchMock)).toBe(3)
    await act(async () => void window.dispatchEvent(new Event("focus")))
    expect(countCalls(fetchMock)).toBe(4)
  })

  it("hides the badge at zero and keeps the last count when polling fails", async () => {
    vi.useFakeTimers()
    let fail = false
    stubFetch([
      {
        match: "/api/notifications/unread-count",
        respond: () => (fail ? jsonResponse({ error: "x" }, 500) : jsonResponse({ unreadCount: 2 })),
      },
    ])
    renderWithProviders(<NotificationBell />, { language: "en" })
    await act(async () => {})
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("2")
    fail = true
    await act(async () => vi.advanceTimersByTime(UNREAD_POLL_MS))
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("2")
  })

  it("does not emit user activity while polling (idle logout keeps working)", async () => {
    stubApi()
    const onActivity = vi.fn()
    window.addEventListener("kanflow:activity", onActivity)
    renderWithProviders(<NotificationBell />, { language: "en" })
    await waitFor(() => expect(screen.getByTestId("notification-badge")).toBeInTheDocument())
    expect(onActivity).not.toHaveBeenCalled()
    window.removeEventListener("kanflow:activity", onActivity)
  })
})

describe("NotificationBell panel", () => {
  async function openPanel(opts?: Parameters<typeof stubApi>[0]) {
    const fetchMock = stubApi(opts)
    const user = userEvent.setup()
    renderWithProviders(<NotificationBell />, { language: "en" })
    const bell = await screen.findByRole("button", { name: /Notifications/ })
    await user.click(bell)
    const panel = screen.getByRole("dialog", { name: t.notifPanelTitle })
    return { fetchMock, user, bell, panel }
  }

  it("renders every notification type as a localized sentence with project and relative time", async () => {
    const { panel, bell } = await openPanel()
    expect(bell).toHaveAttribute("aria-expanded", "true")
    expect(await within(panel).findByText("Alice assigned you to “Write tests”")).toBeInTheDocument()
    expect(within(panel).getByText(/^Sprint “S5” started \(/)).toBeInTheDocument()
    expect(within(panel).getByText("Sprint “S4” ended")).toBeInTheDocument()
    expect(within(panel).getByText("“Deploy” is due soon (Oct 3)")).toBeInTheDocument()
    expect(within(panel).getByText("“Docs” is overdue (Sep 20)")).toBeInTheDocument()
    expect(within(panel).getByText("AI surveillance report “Daily” found 3 critical issue(s)")).toBeInTheDocument()
    expect(within(panel).getByText("Bob mentioned you in a comment on “#7 Login”")).toBeInTheDocument()
    expect(within(panel).getByText("Eve commented on “#2 Idea”")).toBeInTheDocument()
    expect(within(panel).getAllByText(/Apollo ·/)).toHaveLength(ITEMS.length)
    expect(within(panel).getAllByText("5 minutes ago")).toHaveLength(ITEMS.length)
    // unread rows are announced as such; read ones are not
    expect(within(panel).getAllByText(`${t.notifUnread}:`)).toHaveLength(ITEMS.length - 1)
  })

  it("clicking an unread item marks it read, decrements the badge and navigates", async () => {
    const { panel, user, fetchMock } = await openPanel({ unread: 3 })
    await user.click(await within(panel).findByText("Bob mentioned you in a comment on “#7 Login”"))
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n7/read", expect.objectContaining({ method: "POST" }))
    expect(router.push).toHaveBeenCalledWith("/projects/p1/backlog?pbi=b7&tab=comments")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("2")
  })

  it("clicking a read item just navigates", async () => {
    const { panel, user, fetchMock } = await openPanel()
    await user.click(await within(panel).findByText("Sprint “S4” ended"))
    expect(fetchMock.mock.calls.some(([u]) => /\/read$/.test(String(u)))).toBe(false)
    expect(router.push).toHaveBeenCalledWith("/projects/p1")
  })

  it("mark all read clears the badge and the unread markers", async () => {
    const { panel, user, fetchMock } = await openPanel()
    await within(panel).findByText("Sprint “S4” ended")
    await user.click(within(panel).getByRole("button", { name: t.notifMarkAllRead }))
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", expect.objectContaining({ method: "POST" }))
    expect(within(panel).queryAllByText(`${t.notifUnread}:`)).toHaveLength(0)
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: t.notifMarkAllRead })).toBeDisabled()
  })

  it("show more loads the next page with the cursor", async () => {
    const { panel, user, fetchMock } = await openPanel({ nextCursor: "abc" })
    await user.click(await within(panel).findByRole("button", { name: t.notifLoadMore }))
    expect(await within(panel).findByText("Sprint “S1” ended")).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/notifications?limit=20&cursor=abc")).toBe(true)
    expect(within(panel).queryByRole("button", { name: t.notifLoadMore })).not.toBeInTheDocument()
  })

  it("shows the empty state", async () => {
    const { panel } = await openPanel({ items: [], unread: 0 })
    expect(await within(panel).findByText(t.notifEmpty)).toBeInTheDocument()
  })

  it("shows an error with a retry", async () => {
    let fail = true
    stubFetch([
      { match: "/api/notifications/unread-count", respond: () => jsonResponse({ unreadCount: 0 }) },
      { match: /\/api\/notifications\?/, respond: () => (fail ? jsonResponse({ error: "x" }, 500) : jsonResponse({ items: [], nextCursor: null, unreadCount: 0 })) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<NotificationBell />, { language: "en" })
    await user.click(screen.getByRole("button", { name: t.notifBell }))
    expect(await screen.findByText(t.notifLoadFailed)).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole("button", { name: t.notifRetry }))
    expect(await screen.findByText(t.notifEmpty)).toBeInTheDocument()
  })

  it("Escape closes the panel and returns focus to the bell; outside click closes too", async () => {
    const { user, bell } = await openPanel()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(bell).toHaveFocus()
    await user.click(bell)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
