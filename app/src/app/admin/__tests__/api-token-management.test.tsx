import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { AdminApiTokens } from "@/components/api-tokens/api-token-types"
import { ApiTokenManagement } from "../api-tokens/api-token-management"

const URL_BASE = "/api/admin/api-tokens"
const t = tr("ja")

function list(over: Partial<AdminApiTokens> = {}): AdminApiTokens {
  return {
    enabled: true,
    tokens: [
      {
        id: "t1", name: "CI", prefix: "kfl_ABCDEFGH", scopes: ["read"], createdAt: "2026-10-01T00:00:00.000Z",
        lastUsedAt: "2026-10-02T03:04:00.000Z", expiresAt: null, state: "active",
        user: { id: "u2", name: "Bob", email: "bob@example.com", isActive: false },
      },
    ],
    ...over,
  }
}

function setup(data: AdminApiTokens) {
  return stubFetch([
    { match: URL_BASE, method: "GET", respond: () => jsonResponse(data) },
    { match: /\/api\/admin\/api-tokens\/t1$/, method: "DELETE", respond: () => jsonResponse({ success: true }) },
  ])
}

describe("ApiTokenManagement", () => {
  it("lists every token with its owner", async () => {
    setup(list())
    renderWithProviders(<ApiTokenManagement />)
    const table = await screen.findByRole("table", { name: t.apiTokenAdminTitle })
    const row = within(table).getAllByRole("row")[1]
    expect(row).toHaveTextContent("Bob")
    expect(row).toHaveTextContent("bob@example.com")
    expect(row).toHaveTextContent(t.apiTokenOwnerInactive)
    expect(row).toHaveTextContent("kfl_ABCDEFGH")
    expect(row).toHaveTextContent(t.apiTokenNoExpiry)
  })

  it("shows the empty state and the disabled notice", async () => {
    setup(list({ enabled: false, tokens: [] }))
    renderWithProviders(<ApiTokenManagement />)
    expect(await screen.findByRole("heading", { name: t.apiTokenAdminEmpty })).toBeInTheDocument()
    expect(screen.getByText(t.apiTokenDisabled)).toBeInTheDocument()
  })

  it("revokes after confirmation naming the owner", async () => {
    const fetchMock = setup(list())
    renderWithProviders(<ApiTokenManagement />)
    await userEvent.click(await screen.findByRole("button", { name: `${t.apiTokenRevoke}: CI (Bob)` }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.apiTokenAdminRevokeMessage.replace("{name}", "CI").replace("{owner}", "Bob"))
    await userEvent.click(within(dialog).getByRole("button", { name: t.apiTokenRevoke }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, init]) => String(u) === `${URL_BASE}/t1` && (init as RequestInit).method === "DELETE")).toBe(true)
    )
    expect(await screen.findByRole("heading", { name: t.apiTokenAdminEmpty })).toBeInTheDocument()
  })
})
