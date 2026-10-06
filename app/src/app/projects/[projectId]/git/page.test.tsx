import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { jsonResponse, renderWithProviders } from "../settings/__tests__/providers"

const mocks = vi.hoisted(() => ({
  session: { data: { user: { id: "u1", role: "user" } } } as { data: unknown },
}))
vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("next-auth/react", () => ({ useSession: () => mocks.session }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { default: GitPage } = await import("./page")
const { pipelineLabel, mrStateLabel, toGitOverview } = await import("./git-labels")
const t = getTranslations("ja")
const OVERVIEW_URL = "/api/projects/p1/git/overview"
const SYNC_URL = "/api/projects/p1/git/sync"

const REPO = {
  id: "r1",
  name: "生産管理 API",
  webUrl: "https://gitlab.example.com/factory/api",
  repoPath: "factory/api",
  hasOwnToken: false,
  tokenHint: null,
  syncedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  lastError: null,
  lastErrorAt: null,
}
const MR = {
  id: "l1",
  kind: "mr",
  ref: "!42",
  title: "PBI-12 ログイン画面",
  url: "https://gitlab.example.com/factory/api/-/merge_requests/42",
  state: "merged",
  pipeline: "failed",
  author: "Sato",
  sourceBranch: "feature/PBI-12-login",
  occurredAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  mergedAt: null,
  repository: { id: "r1", name: "生産管理 API" },
  pbi: { id: "b12", displayId: 12, title: "ログインできる" },
}
const BRANCH = { ...MR, id: "l2", kind: "branch", ref: "feature/PBI-12-login", title: "feature/PBI-12-login", state: null, pipeline: null, author: null }
const ON = { enabled: true, repositories: [REPO], recent: [MR, BRANCH], pollIntervalSec: 180 }

type Handler = () => Response
let overview: Record<string, unknown> = ON
let members: unknown[] = [{ role: "po", user: { id: "u1" } }]
let syncHandler: Handler = () => jsonResponse({ results: [{ repositoryId: "r1", ok: true, links: 4 }] })
const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${String(input)}`
  if (key === `GET ${OVERVIEW_URL}`) return jsonResponse(overview)
  if (key === "GET /api/projects/p1/members") return jsonResponse(members)
  if (key === `POST ${SYNC_URL}`) return syncHandler()
  return jsonResponse({})
})
const calls = (method: string, url: string) =>
  fetchMock.mock.calls.filter(([u, i]) => String(u) === url && ((i as RequestInit)?.method ?? "GET") === method)

beforeEach(() => {
  overview = ON
  members = [{ role: "po", user: { id: "u1" } }]
  syncHandler = () => jsonResponse({ results: [{ repositoryId: "r1", ok: true, links: 4 }] })
  mocks.session = { data: { user: { id: "u1", role: "user" } } }
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("git labels", () => {
  it("maps MR states and pipeline statuses to Japanese labels, passing unknown values through", () => {
    expect(mrStateLabel("opened", t)?.label).toBe(t.gitMrOpened)
    expect(mrStateLabel(null, t)).toBeNull()
    expect(pipelineLabel("waiting_for_resource", t)?.label).toBe(t.gitPipelinePending)
    expect(pipelineLabel("weird", t)?.label).toBe(fillTemplate(t.gitPipelineOther, { status: "weird" }))
    expect(toGitOverview(null)).toMatchObject({ enabled: false, repositories: [], recent: [] })
  })
})

describe("GitPage", () => {
  it("explains that the integration is off and links PO / SM to the settings", async () => {
    overview = { enabled: false, repositories: [], recent: [], pollIntervalSec: 180 }
    renderWithProviders(<GitPage />)
    expect(await screen.findByRole("heading", { name: t.gitPageOffTitle })).toBeInTheDocument()
    expect(await screen.findByRole("link", { name: t.gitPageOpenSettings })).toHaveAttribute("href", "/projects/p1/settings#git")
    expect(screen.queryByRole("button", { name: t.gitPageSyncNow })).toBeNull()
  })

  it("offers no settings link to a developer when off", async () => {
    overview = { enabled: false, repositories: [], recent: [], pollIntervalSec: 180 }
    members = [{ role: "dev", user: { id: "u1" } }]
    renderWithProviders(<GitPage />)
    expect(await screen.findByText(t.gitPageOffDesc)).toBeInTheDocument()
    await waitFor(() => expect(calls("GET", "/api/projects/p1/members")).toHaveLength(1))
    expect(screen.queryByRole("link", { name: t.gitPageOpenSettings })).toBeNull()
  })

  it("lists repositories, the how-to and recent activity linked to PBIs", async () => {
    renderWithProviders(<GitPage />)
    const repoLink = await screen.findByRole("link", { name: new RegExp(REPO.name) })
    expect(repoLink).toHaveAttribute("href", REPO.webUrl)
    expect(screen.getByText(fillTemplate(t.gitPageAutoSync, { n: 3 }))).toBeInTheDocument()
    expect(screen.getByText("feature/PBI-123-login-form")).toBeInTheDocument()

    const recent = screen.getByRole("region", { name: t.gitPageRecent })
    const items = within(recent).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    const mrLink = within(items[0]).getByRole("link", { name: new RegExp(MR.title) })
    expect(mrLink).toHaveAttribute("href", MR.url)
    expect(mrLink).toHaveAttribute("target", "_blank")
    expect(mrLink.getAttribute("rel")).toContain("noopener")
    expect(within(items[0]).getByText(t.gitMrMerged)).toBeInTheDocument()
    expect(within(items[0]).getByText(t.gitPipelineFailed)).toBeInTheDocument()
    expect(within(items[0]).getByText("Sato")).toBeInTheDocument()
    expect(within(items[0]).getByRole("link", { name: new RegExp(fillTemplate(t.gitPageOpenPbi, { key: "PBI-12" })) })).toHaveAttribute("href", "/projects/p1/backlog?pbi=12")
    // A branch has no MR state badge.
    expect(within(items[1]).queryByText(t.gitMrMerged)).toBeNull()
  })

  it("syncs now and reloads the overview", async () => {
    const user = userEvent.setup()
    renderWithProviders(<GitPage />)
    await user.click(await screen.findByRole("button", { name: t.gitPageSyncNow }))
    await waitFor(() => expect(calls("POST", SYNC_URL)).toHaveLength(1))
    expect(await screen.findByText(fillTemplate(t.gitPageSyncDone, { n: 4 }))).toBeInTheDocument()
    await waitFor(() => expect(calls("GET", OVERVIEW_URL)).toHaveLength(2))
  })

  it("explains a too-early sync (429) instead of reporting a failure", async () => {
    syncHandler = () => jsonResponse({ error: "Synced a moment ago", code: "RATE_LIMITED" }, 429)
    const user = userEvent.setup()
    renderWithProviders(<GitPage />)
    await user.click(await screen.findByRole("button", { name: t.gitPageSyncNow }))
    expect(await screen.findByText(t.gitPageSyncTooSoon)).toBeInTheDocument()
    expect(screen.queryByText(t.gitPageSyncFailed)).toBeNull()
  })

  it("reports repositories that failed to sync", async () => {
    syncHandler = () => jsonResponse({ results: [{ repositoryId: "r1", ok: false, links: 0, error: "auth" }] })
    const user = userEvent.setup()
    renderWithProviders(<GitPage />)
    await user.click(await screen.findByRole("button", { name: t.gitPageSyncNow }))
    expect(await screen.findByText(t.gitPageSyncPartial)).toBeInTheDocument()
  })

  it("points to the settings when no repository is registered yet", async () => {
    overview = { ...ON, repositories: [], recent: [] }
    renderWithProviders(<GitPage />)
    expect(await screen.findByText(t.gitPageNoRepos)).toBeInTheDocument()
    expect(await screen.findByRole("link", { name: t.gitPageOpenSettings })).toHaveAttribute("href", "/projects/p1/settings#git")
    expect(screen.getByText(t.gitPageRecentEmpty)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.gitPageSyncNow })).toBeNull()
  })
  it("shows the AI knowledge status of a reference repository with 今すぐ取り込む", async () => {
    const user = userEvent.setup()
    overview = { ...ON, repositories: [{ ...REPO, aiKnowledge: true, indexedFiles: 137, indexedAt: new Date(Date.now() - 60_000).toISOString(), indexing: false, indexPending: false }] }
    renderWithProviders(<GitPage />)
    expect(await screen.findByText(/AI の参照資料: 137 ファイル/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: fillTemplate(t.gitKbReindexOf, { name: REPO.name }) }))
    await waitFor(() => expect(calls("POST", "/api/projects/p1/git/repositories/r1/index")).toHaveLength(1))
  })

  it("shows no knowledge line for a repository that is not AI reference material", async () => {
    renderWithProviders(<GitPage />)
    expect(await screen.findByText(REPO.repoPath)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: fillTemplate(t.gitKbReindexOf, { name: REPO.name }) })).toBeNull()
  })
})
