import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { NotificationItem } from "@/components/notifications/notification-format"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const { HomeMessages } = await import("../home-messages")

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

beforeEach(() => router.push.mockClear())

describe("HomeMessages", () => {
  it("renders nothing when there are no unread messages", () => {
    renderWithProviders(<HomeMessages items={[]} total={0} />, { language: "en" })
    expect(screen.queryByText(t.updatesHomeMentionsTitle)).not.toBeInTheDocument()
  })

  it("lists the unread messages with the total count", () => {
    stubFetch([])
    renderWithProviders(
      <HomeMessages items={[notif("n1"), notif("n2", { payload: { entityLabel: "Deploy" } })]} total={5} />,
      { language: "en" },
    )
    expect(screen.getByText(t.updatesHomeMentionsTitle)).toBeInTheDocument()
    expect(screen.getByText("5")).toBeInTheDocument()
    expect(screen.getAllByTestId("notification-row")).toHaveLength(2)
  })

  it("choosing a message marks it read, removes it from the list, updates the count and navigates", async () => {
    const fetchMock = stubFetch([
      { match: "/api/notifications/n1/read", method: "POST", respond: () => jsonResponse(undefined) },
    ])
    renderWithProviders(
      <HomeMessages items={[notif("n1"), notif("n2", { payload: { entityLabel: "Deploy" } })]} total={5} />,
      { language: "en" },
    )
    await userEvent.click(screen.getByRole("button", { name: /Login/ }))
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n1/read", expect.objectContaining({ method: "POST" }))
    await waitFor(() => expect(screen.getAllByTestId("notification-row")).toHaveLength(1))
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(router.push).toHaveBeenCalledWith("/projects/p1/backlog?pbi=b1&tab=comments")
  })

  it("still removes the row and navigates when marking read fails (opening the item matters more)", async () => {
    stubFetch([{ match: "/api/notifications/n1/read", method: "POST", respond: () => jsonResponse({ error: "nope" }, 500) }])
    renderWithProviders(<HomeMessages items={[notif("n1")]} total={1} />, { language: "en" })
    await userEvent.click(screen.getByRole("button", { name: /Login/ }))
    // the last item is gone -> the section unmounts
    await waitFor(() => expect(screen.queryByText(t.updatesHomeMentionsTitle)).not.toBeInTheDocument())
    expect(router.push).toHaveBeenCalledWith("/projects/p1/backlog?pbi=b1&tab=comments")
  })
})
