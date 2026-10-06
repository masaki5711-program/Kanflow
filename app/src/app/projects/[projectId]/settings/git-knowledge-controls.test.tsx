import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { jsonResponse, renderWithProviders } from "./__tests__/providers"
import type { GitRepositoryDto } from "../git/git-labels"

const { GitKnowledgeControls } = await import("./git-knowledge-controls")
const t = getTranslations("ja")
const URL_ = "/api/projects/p1/git/repositories/r1"
const NOW = new Date("2026-10-06T03:00:00Z")

const REPO: GitRepositoryDto = {
  id: "r1",
  name: "仕様書（トライ）",
  webUrl: "https://gitlab.example.com/spec",
  repoPath: "spec",
  hasOwnToken: false,
  tokenHint: null,
  syncedAt: null,
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
const INDEXED: GitRepositoryDto = { ...REPO, aiKnowledge: true, indexedAt: "2026-10-06T02:58:00Z", indexedFiles: 137 }

const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
  void args // the calls are asserted through fetchMock.mock.calls
  return jsonResponse({ ok: true })
})
const calls = (method: string, url: string) => fetchMock.mock.calls.filter(([u, i]) => String(u) === url && ((i as RequestInit)?.method ?? "GET") === method)
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)
const findDialog = () => screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))

function renderControls(repo: GitRepositoryDto, canConfigure = true, onChanged = vi.fn()) {
  renderWithProviders(<GitKnowledgeControls projectId="p1" repo={repo} now={NOW} canConfigure={canConfigure} onChanged={onChanged} />)
  return onChanged
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("GitKnowledgeControls — switch", () => {
  it("asks for confirmation explaining member visibility before switching on", async () => {
    const user = userEvent.setup()
    const onChanged = renderControls(REPO)
    const toggle = screen.getByRole("switch", { name: t.gitKbSwitch })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    const dialog = await findDialog()
    expect(dialog).toHaveTextContent(fillTemplate(t.gitKbOnTitle, { name: REPO.name }))
    expect(dialog).toHaveTextContent("全メンバーが AI を通じて内容を見られる")
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(calls("PATCH", URL_)).toHaveLength(0)

    await user.click(toggle)
    await user.click(within(await findDialog()).getByRole("button", { name: t.gitKbOnConfirm }))
    await waitFor(() => expect(calls("PATCH", URL_)).toHaveLength(1))
    expect(bodyOf(calls("PATCH", URL_)[0])).toEqual({ aiKnowledge: true })
    expect(onChanged).toHaveBeenCalled()
    expect(await screen.findByText(t.gitKbEnabledToast)).toBeInTheDocument()
  })

  it("switching off also confirms (the imported content is deleted)", async () => {
    const user = userEvent.setup()
    renderControls(INDEXED)
    await user.click(screen.getByRole("switch", { name: t.gitKbSwitch }))
    const dialog = await findDialog()
    expect(dialog).toHaveTextContent(t.gitKbOffMessage)
    await user.click(within(dialog).getByRole("button", { name: t.gitKbOffConfirm }))
    await waitFor(() => expect(bodyOf(calls("PATCH", URL_)[0])).toEqual({ aiKnowledge: false }))
  })

  it("shows nothing to a member who cannot configure while it is off", () => {
    renderControls(REPO, false)
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByText(t.gitKbSwitch)).toBeNull()
  })

  it("shows the status (no switch, no filter) to a member who cannot configure while it is on", () => {
    renderControls(INDEXED, false)
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByLabelText(t.gitKbFilter)).toBeNull()
    expect(screen.getByText(/137 ファイル/)).toBeInTheDocument()
  })
})

describe("GitKnowledgeControls — status", () => {
  it("indexed: file count and last import time", () => {
    renderControls(INDEXED)
    expect(screen.getByText(/AI の参照資料: 137 ファイル・最終取り込み/)).toBeInTheDocument()
  })

  it("importing now, waiting, and error states", () => {
    const { unmount } = renderWithProviders(<GitKnowledgeControls projectId="p1" repo={{ ...INDEXED, indexing: true }} now={NOW} canConfigure onChanged={vi.fn()} />)
    expect(screen.getAllByRole("status").some((el) => el.textContent?.includes(t.gitKbStatusIndexing))).toBe(true)
    expect(screen.getByRole("button", { name: fillTemplate(t.gitKbReindexOf, { name: REPO.name }) })).toBeDisabled()
    unmount()
    const second = renderWithProviders(<GitKnowledgeControls projectId="p1" repo={{ ...REPO, aiKnowledge: true, indexPending: true }} now={NOW} canConfigure onChanged={vi.fn()} />)
    expect(screen.getByText(t.gitKbStatusPending)).toBeInTheDocument()
    second.unmount()
    renderControls({ ...INDEXED, indexError: "GitLab に接続できませんでした。", indexErrorAt: "2026-10-06T02:00:00Z" })
    expect(screen.getByText(/GitLab に接続できませんでした。/)).toBeInTheDocument()
    expect(screen.getByText(/取り込みエラー/)).toBeInTheDocument()
  })
})

describe("GitKnowledgeControls — 今すぐ取り込む and folder filter", () => {
  it("starts an import and reloads", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementationOnce(async () => jsonResponse({ started: true }, 202))
    const onChanged = renderControls(INDEXED)
    await user.click(screen.getByRole("button", { name: fillTemplate(t.gitKbReindexOf, { name: REPO.name }) }))
    await waitFor(() => expect(calls("POST", `${URL_}/index`)).toHaveLength(1))
    expect(await screen.findByText(t.gitKbReindexStarted)).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it("explains 'imported a moment ago' (429) and 'busy' (409) instead of failing", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: "x", code: "RATE_LIMITED" }, 429))
    renderControls(INDEXED)
    const button = screen.getByRole("button", { name: fillTemplate(t.gitKbReindexOf, { name: REPO.name }) })
    await user.click(button)
    expect(await screen.findByText(t.gitKbReindexTooSoon)).toBeInTheDocument()
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: "x", code: "CONFLICT" }, 409))
    await user.click(button)
    expect(await screen.findByText(t.gitKbReindexBusy)).toBeInTheDocument()
  })

  it("saves the folder filter (empty = whole repository)", async () => {
    const user = userEvent.setup()
    renderControls(INDEXED)
    const save = screen.getByRole("button", { name: t.gitKbFilterSave })
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText(t.gitKbFilter), "docs/, specs/")
    await user.click(save)
    await waitFor(() => expect(bodyOf(calls("PATCH", URL_)[0])).toEqual({ aiPathFilter: "docs/, specs/" }))
    expect(await screen.findByText(t.gitKbFilterSaved)).toBeInTheDocument()
  })

  it("shows the server's explanation for an invalid filter", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: "フォルダの指定を認識できません", code: "VALIDATION" }, 400))
    renderControls({ ...INDEXED, aiPathFilter: "docs/" })
    await user.clear(screen.getByLabelText(t.gitKbFilter))
    await user.type(screen.getByLabelText(t.gitKbFilter), "../x")
    await user.click(screen.getByRole("button", { name: t.gitKbFilterSave }))
    expect(await screen.findByText("フォルダの指定を認識できません")).toBeInTheDocument()
  })
})
