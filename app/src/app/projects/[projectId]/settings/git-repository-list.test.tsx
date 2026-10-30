import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { jsonResponse, renderWithProviders } from "./__tests__/providers"
import type { GitRepositoryDto } from "../git/git-labels"

const { GitRepositoryList } = await import("./git-repository-list")
const t = getTranslations("ja")
const RESYNC_URL = "/api/projects/p1/git/repositories/r1/resync"

const REPO: GitRepositoryDto = {
  id: "r1",
  name: "API",
  webUrl: "https://gitlab.example.com/g/api",
  repoPath: "g/api",
  hasOwnToken: false,
  tokenHint: null,
  syncedAt: "2026-10-06T02:58:00Z",
  lastError: null,
  lastErrorAt: null,
  aiKnowledge: false,
  aiPathFilter: null,
  indexedAt: null,
  indexedFiles: 0,
  indexError: null,
  indexErrorAt: null,
  indexing: false,
  indexPending: false,
}

let resyncStatus = 200
const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
  String(url) === RESYNC_URL && init?.method === "POST" && resyncStatus !== 200
    ? jsonResponse({ error: "Resynced a moment ago", code: "RATE_LIMITED" }, resyncStatus)
    : jsonResponse({ result: { repositoryId: "r1", ok: true, links: 0 } }),
)
const resyncCalls = () => fetchMock.mock.calls.filter(([u, i]) => String(u) === RESYNC_URL && (i as RequestInit | undefined)?.method === "POST")
const findDialog = () => screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))

function renderList(canConfigure = true, onChanged = vi.fn()) {
  renderWithProviders(<GitRepositoryList projectId="p1" repositories={[REPO]} canConfigure={canConfigure} onChanged={onChanged} />)
  return onChanged
}

beforeEach(() => {
  resyncStatus = 200
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("GitRepositoryList — 過去分を再同期", () => {
  it("confirms what it does, then starts the resync and reloads the settings", async () => {
    const user = userEvent.setup()
    const onChanged = renderList()
    const button = screen.getByRole("button", { name: fillTemplate(t.gitSetResyncOf, { name: REPO.name }) })
    await user.click(button)
    const dialog = await findDialog()
    expect(dialog).toHaveTextContent(fillTemplate(t.gitSetResyncTitle, { name: REPO.name }))
    expect(dialog).toHaveTextContent(t.gitSetResyncMessage)
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(resyncCalls()).toHaveLength(0)

    await user.click(button)
    await user.click(within(await findDialog()).getByRole("button", { name: t.gitSetResyncConfirm }))
    await waitFor(() => expect(resyncCalls()).toHaveLength(1))
    expect(await screen.findByText(t.gitSetResyncStarted)).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it("explains a 429 (started a moment ago)", async () => {
    resyncStatus = 429
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("button", { name: fillTemplate(t.gitSetResyncOf, { name: REPO.name }) }))
    await user.click(within(await findDialog()).getByRole("button", { name: t.gitSetResyncConfirm }))
    expect(await screen.findByText(t.gitSetResyncTooSoon)).toBeInTheDocument()
  })

  it("is not offered to members who cannot configure the integration", () => {
    renderList(false)
    expect(screen.queryByRole("button", { name: fillTemplate(t.gitSetResyncOf, { name: REPO.name }) })).not.toBeInTheDocument()
  })
})
