import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import type { NotificationItem } from "@/components/notifications/notification-format"
import type { ProjectUpdates } from "@/components/updates/use-project-updates"
import type { FeedEntry } from "../activity-sentence"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const { WhatsNewPanel } = await import("../whats-new-panel")

const t = tr("en")

function notif(id: string, over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    type: "mentioned",
    projectId: "p1",
    project: { id: "p1", name: "Apollo" },
    entityType: "pbi",
    entityId: "b1",
    payload: { entityLabel: "Login" },
    readAt: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    ...over,
  }
}

function entry(id: string, over: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id,
    action: "update",
    actor: { id: "u2", name: "Bob" },
    changes: null,
    label: "Login form",
    meta: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    entityType: "pbi",
    entityId: "b1",
    ...over,
  }
}

const DATA: ProjectUpdates = {
  since: "2026-09-25T00:00:00.000Z",
  firstVisit: false,
  newActivity: 3,
  unread: 2,
  mentions: 1,
  activity: [entry("a1")],
  notifications: [notif("n1", { payload: { entityLabel: "Login", excerpt: "Please check this before Friday" } })],
}

function baseProps(over: Partial<Parameters<typeof WhatsNewPanel>[0]> = {}) {
  return {
    projectId: "p1",
    data: undefined,
    isLoading: false,
    error: null,
    onMarkRead: vi.fn(async () => {}),
    onMarkAllSeen: vi.fn(async () => {}),
    onChanged: vi.fn(),
    ...over,
  }
}

beforeEach(() => router.push.mockClear())

describe("WhatsNewPanel", () => {
  it("shows a loading skeleton while the first load is pending", () => {
    renderWithProviders(<WhatsNewPanel {...baseProps({ isLoading: true })} />, { language: "en" })
    expect(screen.getByText(t.loading)).toBeInTheDocument()
  })

  it("shows an error message when the first load fails", () => {
    renderWithProviders(<WhatsNewPanel {...baseProps({ error: new Error("boom") })} />, { language: "en" })
    expect(screen.getByText(t.updatesLoadFailed)).toBeInTheDocument()
  })

  it("renders nothing before the first response (no data, not loading, no error)", () => {
    renderWithProviders(<WhatsNewPanel {...baseProps()} />, { language: "en" })
    expect(document.querySelector("[data-whats-new]")).toBeNull()
  })

  it("collapses to a single 'all caught up' line when there is nothing new", () => {
    renderWithProviders(<WhatsNewPanel {...baseProps({ data: { ...DATA, activity: [], notifications: [] } })} />, { language: "en" })
    const empty = screen.getByText(t.updatesAllCaughtUp)
    expect(empty.closest("[data-whats-new]")).toHaveAttribute("data-whats-new", "empty")
  })

  it("lists unread notifications (with excerpt) and new activity with a NEW badge", () => {
    renderWithProviders(<WhatsNewPanel {...baseProps({ data: DATA })} />, { language: "en" })
    expect(screen.getByText(t.updatesCardMentions.replace("{n}", "1"))).toBeInTheDocument()
    expect(screen.getByText(t.updatesCardNew.replace("{n}", "3"))).toBeInTheDocument()
    expect(document.querySelector("[data-notification-excerpt]")).toHaveTextContent("Please check this before Friday")
    expect(screen.getByText(t.updatesNewBadge)).toBeInTheDocument()
    // 3 new activity entries reported, only 1 shown -> "2 more" note
    expect(screen.getByText(t.updatesByOthersMore.replace("{n}", "2"))).toBeInTheDocument()
  })

  it("shows each side's empty state independently", () => {
    renderWithProviders(<WhatsNewPanel {...baseProps({ data: { ...DATA, activity: [] } })} />, { language: "en" })
    expect(screen.getByText(t.updatesByOthersEmpty)).toBeInTheDocument()
    expect(screen.queryByText(t.updatesByOthersMore.replace("{n}", "2"))).not.toBeInTheDocument()
  })

  it("marks all as seen and shows a success toast", async () => {
    const onMarkAllSeen = vi.fn(async () => {})
    renderWithProviders(<WhatsNewPanel {...baseProps({ data: DATA, onMarkAllSeen })} />, { language: "en" })
    await userEvent.click(screen.getByRole("button", { name: t.updatesMarkSeen }))
    expect(onMarkAllSeen).toHaveBeenCalled()
    expect(await screen.findByText(t.updatesMarkedSeen)).toBeInTheDocument()
  })

  it("shows an error toast when marking as seen fails", async () => {
    const onMarkAllSeen = vi.fn(async () => {
      throw new Error("nope")
    })
    renderWithProviders(<WhatsNewPanel {...baseProps({ data: DATA, onMarkAllSeen })} />, { language: "en" })
    await userEvent.click(screen.getByRole("button", { name: t.updatesMarkSeen }))
    expect(await screen.findByText(t.updatesMarkSeenFailed)).toBeInTheDocument()
  })

  it("choosing an unread notification marks it read, notifies the parent and navigates", async () => {
    const onMarkRead = vi.fn(async () => {})
    const onChanged = vi.fn()
    renderWithProviders(<WhatsNewPanel {...baseProps({ data: DATA, onMarkRead, onChanged })} />, { language: "en" })
    await userEvent.click(screen.getByRole("button", { name: /Login/ }))
    expect(onMarkRead).toHaveBeenCalledWith("n1")
    expect(onChanged).toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith("/projects/p1/backlog?pbi=b1&tab=comments")
  })

  it("choosing an already-read notification still navigates but does not mark it read again", async () => {
    const onMarkRead = vi.fn(async () => {})
    const read = { ...DATA, notifications: [notif("n2", { readAt: "2026-09-30T00:00:00.000Z" })] }
    renderWithProviders(<WhatsNewPanel {...baseProps({ data: read, onMarkRead })} />, { language: "en" })
    await userEvent.click(screen.getByRole("button", { name: /Login/ }))
    expect(onMarkRead).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalled()
  })
})
