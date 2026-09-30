import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import { CommentsButton, CommentsProvider } from "../comments-provider"

stubLayout()

const t = getTranslations("en")
const BASE = "/api/projects/p1/comments"
const openLabel = (name: string) => t.commentsOpenFor.replace("{name}", name)

let routes: Record<string, () => Response>
beforeEach(() => {
  routes = {
    [`GET ${BASE}/counts?entityType=sprint_task&ids=${encodeURIComponent("t1,t2")}`]: () => jsonResponse({ counts: { t1: 3, t2: 0 } }),
    [`GET ${BASE}?entityType=sprint_task&entityId=t2`]: () => jsonResponse({ items: [], nextCursor: null }),
    ["GET /api/projects/p1/members"]: () => jsonResponse([]),
    [`POST ${BASE}`]: () =>
      jsonResponse(
        {
          id: "c1",
          entityType: "sprint_task",
          entityId: "t2",
          author: { id: "u1", name: "Alice" },
          body: "hi there",
          deleted: false,
          mentions: [],
          createdAt: new Date().toISOString(),
          editedAt: null,
          canEdit: true,
          canDelete: true,
        },
        201,
      ),
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${(init?.method ?? "GET").toUpperCase()} ${String(input)}`
      return routes[key]?.() ?? jsonResponse({ error: `no route ${key}` }, 404)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe("CommentsProvider / CommentsButton", () => {
  it("shows counts, opens the dialog and bumps the count after posting", async () => {
    renderWithProviders(
      <CommentsProvider projectId="p1" entityType="sprint_task" entityIds={["t2", "t1"]}>
        <CommentsButton entityId="t1" name="Task 1" />
        <CommentsButton entityId="t2" name="Task 2" />
      </CommentsProvider>,
    )
    const withCount = await screen.findByRole("button", {
      name: `${openLabel("Task 1")} (${t.commentsCountLabel.replace("{count}", "3")})`,
    })
    expect(withCount).toHaveTextContent("3")

    await userEvent.click(screen.getByRole("button", { name: openLabel("Task 2") }))
    const dialog = await screen.findByRole("dialog", { name: openLabel("Task 2") })
    await within(dialog).findByText(t.commentsEmptyTitle)
    await userEvent.type(within(dialog).getByLabelText(t.commentsBodyLabel), "hi there")
    await userEvent.click(within(dialog).getByRole("button", { name: t.commentsSend }))
    await within(dialog).findByText("hi there")

    const closes = within(dialog).getAllByRole("button", { name: t.close })
    await userEvent.click(closes[closes.length - 1])
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(
      screen.getByRole("button", { name: `${openLabel("Task 2")} (${t.commentsCountLabel.replace("{count}", "1")})` }),
    ).toBeInTheDocument()
  })

  it("renders nothing outside a provider", () => {
    renderWithProviders(<CommentsButton entityId="t1" name="x" />)
    expect(screen.queryByRole("button", { name: openLabel("x") })).not.toBeInTheDocument()
  })
})
