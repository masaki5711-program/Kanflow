import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { OwnApiTokens } from "@/components/api-tokens/api-token-types"
import { ApiTokensSection } from "../api-tokens-section"

const URL_BASE = "/api/user/api-tokens"
const t = tr("ja")
const PLAIN = `kfl_${"x".repeat(43)}`

function tokens(over: Partial<OwnApiTokens["config"]> = {}, list: OwnApiTokens["tokens"] = []): OwnApiTokens {
  return {
    config: { enabled: true, maxPerUser: 5, allowNoExpiry: false, expiryDays: [30, 90, 365], ...over },
    tokens: list,
    projects: [
      { id: "p1", name: "Alpha" },
      { id: "p2", name: "Beta" },
    ],
  }
}

const existing = {
  id: "t1",
  name: "CI",
  prefix: "kfl_ABCDEFGH",
  scopes: ["read"],
  projectIds: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  lastUsedAt: null,
  expiresAt: "2026-12-30T00:00:00.000Z",
  state: "active" as const,
}

function setup(data: OwnApiTokens, postStatus = 201) {
  return stubFetch([
    { match: URL_BASE, method: "GET", respond: () => jsonResponse(data) },
    {
      match: URL_BASE,
      method: "POST",
      respond: () =>
        postStatus === 201
          ? jsonResponse({ ...existing, id: "t2", name: "Report", prefix: PLAIN.slice(0, 12), token: PLAIN }, 201)
          : jsonResponse({ error: "Token limit reached (5)", code: "CONFLICT" }, postStatus),
    },
    { match: /\/api\/user\/api-tokens\/t1$/, method: "DELETE", respond: () => jsonResponse({ success: true }) },
  ])
}

const bodies = (fetchMock: ReturnType<typeof stubFetch>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase() === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))

describe("ApiTokensSection", () => {
  it("lists tokens with prefix, dates and never-used state", async () => {
    setup(tokens({}, [existing, { ...existing, id: "t3", name: "Old", state: "expired" }]))
    renderWithProviders(<ApiTokensSection />)
    const list = await screen.findByRole("list", { name: t.apiTokenListLabel })
    const [first, second] = within(list).getAllByRole("listitem")
    expect(first).toHaveTextContent("CI")
    expect(first).toHaveTextContent("kfl_ABCDEFGH")
    expect(first).toHaveTextContent(t.apiTokenNever)
    expect(second).toHaveTextContent(t.apiTokenStateExpired)
  })

  it("creates a token, shows it once and adds it to the list", async () => {
    const fetchMock = setup(tokens())
    renderWithProviders(<ApiTokensSection />)
    expect(await screen.findByText(t.apiTokenEmpty)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(new RegExp(t.apiTokenName)), "Report")
    await userEvent.selectOptions(screen.getByLabelText(t.apiTokenExpiry), "90")
    await userEvent.click(screen.getByRole("button", { name: t.apiTokenCreate }))
    const panel = await screen.findByRole("group", { name: t.apiTokenShownOnce })
    expect(panel).toHaveTextContent(t.apiTokenShownOnce)
    expect(within(panel).getByRole("textbox")).toHaveValue(PLAIN)
    expect(bodies(fetchMock, "POST")).toEqual([{ name: "Report", expiresInDays: 90, scopes: ["read"], projectIds: null }])
    expect(within(screen.getByRole("list", { name: t.apiTokenListLabel })).getByText("Report")).toBeInTheDocument()

    await userEvent.click(within(panel).getByRole("button", { name: t.apiTokenDone }))
    expect(screen.queryByDisplayValue(PLAIN)).not.toBeInTheDocument()
  })

  it("sends the developer preset plus a checked scope, limited to the picked projects", async () => {
    const fetchMock = setup(tokens())
    renderWithProviders(<ApiTokensSection />)
    await userEvent.type(await screen.findByLabelText(new RegExp(t.apiTokenName)), "Claude Code")
    expect(screen.getByRole("checkbox", { name: new RegExp(t.apiTokenScopeRead) })).toBeDisabled()
    await userEvent.click(screen.getByRole("button", { name: t.apiTokenPresetDeveloper }))
    await userEvent.click(screen.getByRole("checkbox", { name: new RegExp(t.apiTokenScopeSprintWrite) }))
    await userEvent.click(screen.getByRole("radio", { name: t.apiTokenProjectsSelected }))
    expect(screen.getByText(t.apiTokenProjectsPickOne)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.apiTokenCreate })).toBeDisabled()
    await userEvent.click(screen.getByRole("checkbox", { name: "Beta" }))
    await userEvent.click(screen.getByRole("button", { name: t.apiTokenCreate }))
    await screen.findByRole("group", { name: t.apiTokenShownOnce })
    expect(bodies(fetchMock, "POST")).toEqual([
      {
        name: "Claude Code",
        expiresInDays: 30,
        scopes: ["read", "sprint:write", "task:write", "comment:write", "icebox:write", "daily:write", "dev:write"],
        projectIds: ["p2"],
      },
    ])
  }, 15_000)

  it("shows each token's scopes and project restriction", async () => {
    setup(tokens({}, [{ ...existing, scopes: ["read", "task:write"], projectIds: ["p1", "p2"] }]))
    renderWithProviders(<ApiTokensSection />)
    const item = within(await screen.findByRole("list", { name: t.apiTokenListLabel })).getByRole("listitem")
    expect(item).toHaveTextContent("task:write")
    expect(item).toHaveTextContent(t.apiTokenProjectCount.replace("{count}", "2"))
  })

  it("copies the new token to the clipboard", async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    setup(tokens())
    renderWithProviders(<ApiTokensSection />)
    await userEvent.type(await screen.findByLabelText(new RegExp(t.apiTokenName)), "Report")
    await userEvent.click(screen.getByRole("button", { name: t.apiTokenCreate }))
    await userEvent.click(within(await screen.findByRole("group", { name: t.apiTokenShownOnce })).getByRole("button", { name: t.apiTokenCopy }))
    expect(writeText).toHaveBeenCalledWith(PLAIN)
  })

  it("offers no-expiry only when the server allows it", async () => {
    setup(tokens({ allowNoExpiry: true }))
    renderWithProviders(<ApiTokensSection />)
    const select = await screen.findByLabelText(t.apiTokenExpiry)
    expect(within(select).getByRole("option", { name: t.apiTokenExpiryNone })).toBeInTheDocument()
  })

  it("disables creation at the per-user limit", async () => {
    setup(tokens({ maxPerUser: 1 }, [existing]))
    renderWithProviders(<ApiTokensSection />)
    expect(await screen.findByText(t.apiTokenLimitReached.replace("{max}", "1"))).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.apiTokenCreate })).toBeDisabled()
  })

  it("shows the disabled notice instead of the form", async () => {
    setup(tokens({ enabled: false }, [existing]))
    renderWithProviders(<ApiTokensSection />)
    expect(await screen.findByText(t.apiTokenDisabled)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.apiTokenCreate })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: `${t.apiTokenRevoke}: CI` })).toBeInTheDocument()
  })

  it("revokes after confirmation", async () => {
    const fetchMock = setup(tokens({}, [existing]))
    renderWithProviders(<ApiTokensSection />)
    await userEvent.click(await screen.findByRole("button", { name: `${t.apiTokenRevoke}: CI` }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.apiTokenRevokeMessage.replace("{name}", "CI"))
    await userEvent.click(within(dialog).getByRole("button", { name: t.apiTokenRevoke }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, init]) => String(u) === `${URL_BASE}/t1` && (init as RequestInit).method === "DELETE")).toBe(true)
    )
    await waitFor(() => expect(screen.getByText(t.apiTokenEmpty)).toBeInTheDocument())
  })
})
