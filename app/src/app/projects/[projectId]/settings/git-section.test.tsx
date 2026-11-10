import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { ACCEPTANCE_REPORT_REFUSED_MESSAGE, STATION_UNAVAILABLE_MESSAGE } from "@/lib/git/sync-messages"
import { jsonResponse, renderWithProviders } from "./__tests__/providers"

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh }) }))

const { GitSection, toGitSettings } = await import("./git-section")
const t = getTranslations("ja")
const BASE = "/api/projects/p1/git"

const REPO = {
  id: "r1",
  name: "生産管理 API",
  webUrl: "https://gitlab.example.com/factory/api",
  repoPath: "factory/api",
  hasOwnToken: false,
  tokenHint: null,
  syncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  lastError: null,
  lastErrorAt: null,
}
const ON = { enabled: true, hasToken: true, tokenHint: "abcd", autoCompleteOnMerge: false, repositories: [REPO], pollIntervalSec: 180 }
const OFF = { ...ON, enabled: false }
/** A project that reads GitStation (no repository yet), the acceptance check off. */
const STATION_ON = { ...ON, provider: "gitstation", stationIntegrationId: "7", repositories: [], stationAcceptanceCheck: false, acceptanceCheckError: null }

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
let settings: Record<string, unknown> = OFF
let overrides: Record<string, Handler> = {}
const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input)
  const key = `${init.method ?? "GET"} ${url}`
  if (overrides[key]) return overrides[key](url, init)
  if (key === `GET ${BASE}`) return jsonResponse(settings)
  if (key === `PUT ${BASE}`) {
    settings = { ...settings, ...JSON.parse(init.body as string) }
    return jsonResponse(settings)
  }
  return jsonResponse({ ok: true })
})

function calls(method: string, url: string) {
  return fetchMock.mock.calls.filter(([u, i]) => String(u) === url && ((i as RequestInit)?.method ?? "GET") === method)
}
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(() => {
  settings = OFF
  overrides = {}
  fetchMock.mockClear()
  mocks.refresh.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("toGitSettings", () => {
  it("reads a malformed body as off with nothing configured", () => {
    expect(toGitSettings({ ok: true })).toEqual({
      enabled: false,
      provider: "gitlab",
      stationIntegrationId: null,
      hasToken: false,
      tokenHint: null,
      autoCompleteOnMerge: false,
      stationAcceptanceCheck: false,
      acceptanceCheckError: null,
      repositories: [],
      pollIntervalSec: 180,
    })
  })

  it("keeps the acceptance check switch and its last error (message + time)", () => {
    const at = "2026-11-10T01:02:03.000Z"
    expect(toGitSettings({ stationAcceptanceCheck: true, acceptanceCheckError: { message: "x", at } })).toMatchObject({ stationAcceptanceCheck: true, acceptanceCheckError: { message: "x", at } })
    expect(toGitSettings({ acceptanceCheckError: { message: "x", at: 5 } }).acceptanceCheckError).toEqual({ message: "x", at: null })
    expect(toGitSettings({ acceptanceCheckError: { message: "x" } }).acceptanceCheckError).toEqual({ message: "x", at: null })
  })

  it("reads a malformed acceptance check state as off / no error", () => {
    expect(toGitSettings({ stationAcceptanceCheck: "yes" }).stationAcceptanceCheck).toBe(false)
    for (const bad of [{ message: 5 }, { message: "" }, { at: "2026-11-10T01:02:03.000Z" }, "x", 3, null, []]) expect(toGitSettings({ acceptanceCheckError: bad }).acceptanceCheckError).toBeNull()
  })
})

describe("GitSection", () => {
  it("is off by default and shows nothing but the switch and the explanation", async () => {
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    const toggle = await screen.findByRole("switch", { name: t.gitSetEnable })
    expect(toggle).not.toBeChecked()
    expect(screen.getByText(t.gitSetIntro)).toBeInTheDocument()
    expect(screen.queryByText(t.gitSetToken)).toBeNull()
    expect(screen.queryByRole("switch", { name: t.gitSetAutoComplete })).toBeNull()
    expect(screen.queryByText(REPO.name)).toBeNull()
    expect(screen.queryByRole("button", { name: t.gitSetAddSubmit })).toBeNull()
  })

  it("turning on saves at once, refreshes the server layout (sidebar) and reveals the details", async () => {
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    await user.click(await screen.findByRole("switch", { name: t.gitSetEnable }))
    await waitFor(() => expect(calls("PUT", BASE)).toHaveLength(1))
    expect(bodyOf(calls("PUT", BASE)[0])).toEqual({ enabled: true })
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
    expect(await screen.findByRole("switch", { name: t.gitSetAutoComplete })).toBeInTheDocument()
    expect(screen.getByText(REPO.name)).toBeInTheDocument()
    expect(screen.getByText(t.gitSetEnabledToast)).toBeInTheDocument()
  })

  it("turning off asks first (data is kept) and does nothing when cancelled", async () => {
    settings = ON
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    const toggle = await screen.findByRole("switch", { name: t.gitSetEnable })
    await user.click(toggle)
    let dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    expect(dialog).toHaveTextContent(t.gitSetTurnOffMessage)
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(calls("PUT", BASE)).toHaveLength(0)
    expect(toggle).toBeChecked()

    await user.click(toggle)
    dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    await user.click(within(dialog).getByRole("button", { name: t.gitSetTurnOffConfirm }))
    await waitFor(() => expect(calls("PUT", BASE)).toHaveLength(1))
    expect(bodyOf(calls("PUT", BASE)[0])).toEqual({ enabled: false })
    await waitFor(() => expect(screen.getByRole("switch", { name: t.gitSetEnable })).not.toBeChecked())
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it("never shows the saved token: only the last characters, and an empty password field to replace it", async () => {
    settings = ON
    const user = userEvent.setup()
    const { container } = renderWithProviders(<GitSection projectId="p1" canConfigure />)
    expect(await screen.findByText(fillTemplate(t.gitSetTokenSet, { hint: "abcd" }))).toBeInTheDocument()
    expect(container.querySelector('input[type="password"]')).toBeNull()

    await user.click(screen.getByRole("button", { name: t.gitSetTokenChange }))
    const input = container.querySelector('input[type="password"]') as HTMLInputElement
    expect(input).toHaveValue("")
    await user.type(input, "short")
    expect(screen.getByText(t.gitSetTokenTooShort)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.gitSetTokenSave })).toBeDisabled()
    await user.type(input, "-token-1234")
    await user.click(screen.getByRole("button", { name: t.gitSetTokenSave }))
    await waitFor(() => expect(calls("PUT", BASE)).toHaveLength(1))
    expect(bodyOf(calls("PUT", BASE)[0])).toEqual({ token: "short-token-1234" })
    expect(await screen.findByText(t.gitSetTokenSaved)).toBeInTheDocument()
  })

  it("removes the token after confirmation", async () => {
    settings = ON
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    await user.click(await screen.findByRole("button", { name: t.gitSetTokenRemove }))
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    await user.click(within(dialog).getByRole("button", { name: t.gitSetTokenRemove }))
    await waitFor(() => expect(calls("PUT", BASE)).toHaveLength(1))
    expect(bodyOf(calls("PUT", BASE)[0])).toEqual({ token: null })
  })

  it("saves 'complete on merge' immediately", async () => {
    settings = ON
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    const toggle = await screen.findByRole("switch", { name: t.gitSetAutoComplete })
    expect(toggle).toHaveAccessibleDescription(t.gitSetAutoCompleteHelp)
    await user.click(toggle)
    await waitFor(() => expect(calls("PUT", BASE)).toHaveLength(1))
    expect(bodyOf(calls("PUT", BASE)[0])).toEqual({ autoCompleteOnMerge: true })
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it("shows the last sync error of a repository in the list", async () => {
    settings = { ...ON, repositories: [{ ...REPO, lastError: "トークンの権限が足りません", lastErrorAt: new Date().toISOString() }] }
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    expect(await screen.findByText(/トークンの権限が足りません/)).toBeInTheDocument()
  })

  it("adds a repository after a successful connection test", async () => {
    settings = ON
    overrides[`POST ${BASE}/test`] = () =>
      jsonResponse({ ok: true, repository: { path: "factory/edge", webUrl: "https://gitlab.example.com/factory/edge", defaultBranch: "main", externalId: 7 } })
    overrides[`POST ${BASE}/repositories`] = () => jsonResponse({ ...REPO, id: "r2", name: "エッジ" }, 201)
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    const add = await screen.findByRole("button", { name: t.gitSetAddSubmit })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText(t.gitSetAddName), "エッジ")
    await user.type(screen.getByLabelText(t.gitSetAddUrl), "https://gitlab.example.com/factory/edge")
    await user.click(screen.getByRole("button", { name: t.gitSetAddTest }))
    expect(await screen.findByText(fillTemplate(t.gitSetAddTestOk, { path: "factory/edge", branch: "main" }))).toBeInTheDocument()
    expect(bodyOf(calls("POST", `${BASE}/test`)[0])).toEqual({ url: "https://gitlab.example.com/factory/edge" })

    const before = calls("GET", BASE).length
    await user.click(add)
    await waitFor(() => expect(calls("POST", `${BASE}/repositories`)).toHaveLength(1))
    expect(bodyOf(calls("POST", `${BASE}/repositories`)[0])).toEqual({ name: "エッジ", url: "https://gitlab.example.com/factory/edge" })
    expect(await screen.findByText(t.gitSetAdded)).toBeInTheDocument()
    await waitFor(() => expect(calls("GET", BASE).length).toBe(before + 1))
    expect(screen.getByLabelText(t.gitSetAddName)).toHaveValue("")
  })

  it("shows why a connection test and an add were refused, and sends a per-repository token", async () => {
    settings = ON
    overrides[`POST ${BASE}/test`] = () => jsonResponse({ ok: false, error: "リポジトリが見つかりません" })
    overrides[`POST ${BASE}/repositories`] = () => jsonResponse({ error: "このリポジトリはすでに登録されています。", code: "VALIDATION" }, 400)
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    await user.type(await screen.findByLabelText(t.gitSetAddName), "x")
    await user.type(screen.getByLabelText(t.gitSetAddUrl), "https://gitlab.example.com/a/b")
    await user.click(screen.getByRole("checkbox", { name: t.gitSetAddOwnToken }))
    await user.type(screen.getByLabelText(t.gitSetAddOwnTokenLabel), "repo-token-xyz")
    await user.click(screen.getByRole("button", { name: t.gitSetAddTest }))
    expect(await screen.findByText(fillTemplate(t.gitSetAddTestFailed, { error: "リポジトリが見つかりません" }))).toBeInTheDocument()
    expect(bodyOf(calls("POST", `${BASE}/test`)[0])).toEqual({ url: "https://gitlab.example.com/a/b", token: "repo-token-xyz" })

    await user.click(screen.getByRole("button", { name: t.gitSetAddSubmit }))
    expect(await screen.findByText("このリポジトリはすでに登録されています。")).toBeInTheDocument()
    expect(bodyOf(calls("POST", `${BASE}/repositories`)[0])).toMatchObject({ token: "repo-token-xyz" })
  })

  it("a refused connection test shows a stored Japanese reason in the reader's language", async () => {
    const en = getTranslations("en")
    settings = ON
    overrides[`POST ${BASE}/test`] = () => jsonResponse({ ok: false, error: STATION_UNAVAILABLE_MESSAGE })
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />, { language: "en" })
    await user.type(await screen.findByLabelText(en.gitSetAddUrl), "https://gitstation.example.com/a/b")
    await user.click(screen.getByRole("button", { name: en.gitSetAddTest }))
    expect(await screen.findByText(fillTemplate(en.gitSetAddTestFailed, { error: en.gitSyncStationUnavailable }))).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(STATION_UNAVAILABLE_MESSAGE))).not.toBeInTheDocument()
  })

  it("requires a token before testing when none is configured", async () => {
    settings = { ...ON, hasToken: false, tokenHint: null }
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    await user.type(await screen.findByLabelText(t.gitSetAddUrl), "https://gitlab.example.com/a/b")
    expect(screen.getByText(t.gitSetNeedToken)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.gitSetAddTest })).toBeDisabled()
  })

  it("removes a repository after confirmation", async () => {
    settings = ON
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    await user.click(await screen.findByRole("button", { name: fillTemplate(t.gitSetRepoRemoveOf, { name: REPO.name }) }))
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    await user.click(within(dialog).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(calls("DELETE", `${BASE}/repositories/r1`)).toHaveLength(1))
  })

  it("is read-only for a developer: no switch changes, no token buttons, no add form", async () => {
    settings = ON
    renderWithProviders(<GitSection projectId="p1" canConfigure={false} />)
    expect(await screen.findByRole("switch", { name: t.gitSetEnable })).toBeDisabled()
    expect(screen.getByRole("switch", { name: t.gitSetAutoComplete })).toBeDisabled()
    expect(screen.getByText(t.gitSetReadOnly)).toBeInTheDocument()
    expect(screen.getByText(REPO.name)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.gitSetTokenChange })).toBeNull()
    expect(screen.queryByRole("button", { name: t.gitSetAddSubmit })).toBeNull()
    expect(screen.queryByRole("button", { name: fillTemplate(t.gitSetRepoRemoveOf, { name: REPO.name }) })).toBeNull()
  })
})

describe("GitSection: acceptance check (GitStation)", () => {
  it("is not offered to a project that reads GitLab", async () => {
    settings = ON
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    await screen.findByRole("switch", { name: t.gitSetAutoComplete })
    expect(screen.queryByRole("switch", { name: t.gitSetAcceptanceCheck })).toBeNull()
  })

  it("is off by default, explained, and saves at once when switched on", async () => {
    settings = STATION_ON
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    const toggle = await screen.findByRole("switch", { name: t.gitSetAcceptanceCheck })
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription(t.gitSetAcceptanceCheckHelp)
    await user.click(toggle)
    await waitFor(() => expect(calls("PUT", BASE)).toHaveLength(1))
    expect(bodyOf(calls("PUT", BASE)[0])).toEqual({ stationAcceptanceCheck: true })
    await waitFor(() => expect(screen.getByRole("switch", { name: t.gitSetAcceptanceCheck })).toBeChecked())
    expect(screen.getByText(t.settingsSaved)).toBeInTheDocument()
  })

  it("switching off saves at once too", async () => {
    settings = { ...STATION_ON, stationAcceptanceCheck: true }
    const user = userEvent.setup()
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    const toggle = await screen.findByRole("switch", { name: t.gitSetAcceptanceCheck })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    await waitFor(() => expect(calls("PUT", BASE)).toHaveLength(1))
    expect(bodyOf(calls("PUT", BASE)[0])).toEqual({ stationAcceptanceCheck: false })
    await waitFor(() => expect(screen.getByRole("switch", { name: t.gitSetAcceptanceCheck })).not.toBeChecked())
  })

  it("shows the last failed report in the viewer's language, as part of the switch's description", async () => {
    const en = getTranslations("en")
    settings = { ...STATION_ON, stationAcceptanceCheck: true, acceptanceCheckError: { message: ACCEPTANCE_REPORT_REFUSED_MESSAGE, at: new Date(Date.now() - 5 * 60_000).toISOString() } }
    renderWithProviders(<GitSection projectId="p1" canConfigure />, { language: "en" })
    const toggle = await screen.findByRole("switch", { name: en.gitSetAcceptanceCheck })
    expect(screen.getByText(en.gitSyncAcceptanceRefused)).toBeInTheDocument()
    expect(screen.queryByText(ACCEPTANCE_REPORT_REFUSED_MESSAGE)).toBeNull()
    expect(toggle).toHaveAccessibleDescription(expect.stringContaining(en.gitSetAcceptanceCheckHelp))
    expect(toggle).toHaveAccessibleDescription(expect.stringContaining(en.gitSyncAcceptanceRefused))
    expect(toggle).toHaveAccessibleDescription(expect.stringContaining(en.gitSetAcceptanceCheckError.split("{time}")[0].trim()))
  })

  it("shows a message it does not know as stored, and says so without a time when the time is missing", async () => {
    const stored = "GitStation が一時的に利用できません。次回の同期で再試行します。(synthetic)"
    settings = { ...STATION_ON, stationAcceptanceCheck: true, acceptanceCheckError: { message: stored, at: null } }
    renderWithProviders(<GitSection projectId="p1" canConfigure />)
    await screen.findByRole("switch", { name: t.gitSetAcceptanceCheck })
    expect(screen.getByText(stored)).toBeInTheDocument()
    expect(screen.getByText(t.gitSetAcceptanceCheckErrorNoTime)).toBeInTheDocument()
    expect(screen.queryByText("—", { exact: false })).toBeNull()
  })

  it("a failure of the connection is shown in the viewer's language too", async () => {
    const id = getTranslations("id")
    settings = { ...STATION_ON, stationAcceptanceCheck: true, acceptanceCheckError: { message: STATION_UNAVAILABLE_MESSAGE, at: new Date(Date.now() - 5 * 60_000).toISOString() } }
    renderWithProviders(<GitSection projectId="p1" canConfigure />, { language: "id" })
    const toggle = await screen.findByRole("switch", { name: id.gitSetAcceptanceCheck })
    expect(screen.getByText(id.gitSyncStationUnavailable)).toBeInTheDocument()
    expect(screen.queryByText(STATION_UNAVAILABLE_MESSAGE)).toBeNull()
    expect(toggle).toHaveAccessibleDescription(expect.stringContaining(id.gitSyncStationUnavailable))
  })

  it("is read-only for a developer", async () => {
    settings = { ...STATION_ON, stationAcceptanceCheck: true }
    renderWithProviders(<GitSection projectId="p1" canConfigure={false} />)
    const toggle = await screen.findByRole("switch", { name: t.gitSetAcceptanceCheck })
    expect(toggle).toBeChecked()
    expect(toggle).toBeDisabled()
  })
})
