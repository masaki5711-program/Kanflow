import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, stubFetch, jsonResponse, tr } from "@/app/__tests__/test-utils"
import type { Language } from "@/lib/i18n"
import { backlogResponse, pbi } from "./fixtures"

const session = vi.hoisted(() => ({ value: { user: { id: "u1", role: "user" } } as { user: { id: string; role: string } } | null }))

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.value }) }))
vi.mock("@/components/pbi-detail-modal", () => ({
  default: ({ pbiId, onClose }: { pbiId: string; onClose: () => void }) => (
    <div data-testid="pbi-detail">
      detail {pbiId}
      <button type="button" onClick={onClose}>close-detail</button>
    </div>
  ),
}))
vi.mock("@/components/ai-result-modal", () => ({
  AIResultModal: ({ fetchUrl, onClose }: { fetchUrl: string; onClose: () => void }) => (
    <div data-testid="ai-modal">
      {fetchUrl}
      <button type="button" onClick={onClose}>close-ai</button>
    </div>
  ),
}))

const { default: BacklogPage } = await import("../page")

const BASE = "/api/projects/p1"

interface Opts {
  role?: string | null
  membersStatus?: number
  backlogStatus?: number
  reorderStatus?: number
  statusPatch?: number
  deleteStatus?: number
  saveStatus?: number
}

function setup(opts: Opts = {}) {
  const { role = "po" } = opts
  let backlogCalls = 0
  let membersCalls = 0
  const fetchMock = stubFetch([
    {
      match: `${BASE}/backlog`,
      method: "GET",
      respond: () => {
        backlogCalls++
        return opts.backlogStatus && backlogCalls === 1 ? jsonResponse({ error: "db down" }, opts.backlogStatus) : jsonResponse(backlogResponse())
      },
    },
    {
      match: `${BASE}/icebox`,
      respond: () =>
        jsonResponse({
          unreviewed: [{ id: "ib1", displayId: 11, request: "Icebox request one", background: null, author: "Ann", status: "unreviewed" }],
          reviewed: [{ id: "ib2", displayId: 12, request: "x".repeat(80), background: null, author: "Bob", status: "reviewed" }],
        }),
    },
    { match: `${BASE}/goals`, respond: () => jsonResponse([{ id: "g1", title: "Goal one", description: null }]) },
    {
      match: `${BASE}/members`,
      respond: () => {
        membersCalls++
        if (opts.membersStatus && membersCalls === 1) return jsonResponse({ error: "nope" }, opts.membersStatus)
        return jsonResponse(role ? [{ role, user: { id: "u1" } }] : [])
      },
    },
    { match: BASE, respond: () => jsonResponse({ pointUnit: "SP" }) },
    { match: `${BASE}/backlog/reorder`, method: "PUT", respond: () => jsonResponse({ ok: true }, opts.reorderStatus ?? 200) },
    { match: /\/backlog\/[a-z]+$/, method: "PATCH", respond: () => jsonResponse({ ok: true }, opts.statusPatch ?? 200) },
    { match: /\/backlog\/[a-z]+$/, method: "DELETE", respond: () => jsonResponse({ error: "locked" }, opts.deleteStatus ?? 200) },
    { match: `${BASE}/backlog`, method: "POST", respond: () => jsonResponse({ id: "new" }, opts.saveStatus ?? 201) },
  ])
  return { fetchMock, calls: () => ({ backlogCalls, membersCalls }) }
}

function renderPage(language: Language = "ja") {
  return renderWithProviders(<BacklogPage />, { language })
}

const t = tr("ja")

function titles(section: HTMLElement) {
  return within(section).getAllByRole("listitem").map((li) => within(li).getByRole("heading", { level: 3 }).textContent)
}

function readySection() {
  return screen.getByRole("heading", { name: t.backlogSectionReadyTitle }).closest("section") as HTMLElement
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>, method: string, urlPart: string) {
  const call = fetchMock.mock.calls.find(([u, i]) => String(u).includes(urlPart) && (i?.method ?? "GET") === method)
  return call ? JSON.parse(String(call[1]?.body)) : undefined
}

describe("BacklogPage", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    session.value = { user: { id: "u1", role: "user" } }
  })

  it("shows a skeleton, then the ready / not-ready sections with totals", async () => {
    setup()
    renderPage()
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: t.backlogSectionNotReadyTitle })).toBeInTheDocument()
    expect(screen.getByText(`${t.reportTotalWorkload}: 15`)).toBeInTheDocument()
    expect(titles(readySection())).toEqual(["Alpha login", "Beta search", "Gamma login"])
    expect(screen.getByRole("button", { name: t.backlogAddItem })).toBeInTheDocument()
  })

  it("shows an error state with retry when the backlog fails to load", async () => {
    const { calls } = setup({ backlogStatus: 500 })
    renderPage()
    expect(await screen.findByText(t.backlogLoadFailed)).toBeInTheDocument()
    expect(screen.getByText("db down")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.backlogRetry }))
    expect(await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })).toBeInTheDocument()
    expect(calls().backlogCalls).toBe(2)
  })

  it("hides edit controls for developers and offers a view button instead", async () => {
    setup({ role: "developer" })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    expect(screen.queryByRole("button", { name: t.backlogAddItem })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.backlogMoveUp.replace("{id}", "2") })).not.toBeInTheDocument()
    const viewButtons = screen.getAllByRole("button", { name: t.view })
    await userEvent.click(viewButtons[0])
    expect(screen.getByTestId("pbi-detail")).toHaveTextContent("detail a")
    await userEvent.click(screen.getByText("close-detail"))
    expect(screen.queryByTestId("pbi-detail")).not.toBeInTheDocument()
  })

  it("grants admins edit rights without membership", async () => {
    session.value = { user: { id: "u1", role: "admin" } }
    setup({ role: null })
    renderPage()
    expect(await screen.findByRole("button", { name: t.backlogAddItem })).toBeInTheDocument()
  })

  it("shows a role-load failure banner and retries the member lookup", async () => {
    const { calls } = setup({ membersStatus: 500 })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    const banner = await screen.findByText(t.backlogRoleLoadFailed)
    expect(screen.queryByRole("button", { name: t.backlogAddItem })).not.toBeInTheDocument()
    await userEvent.click(within(banner.closest("div") as HTMLElement).getByRole("button", { name: t.backlogRetry }))
    await waitFor(() => expect(screen.queryByText(t.backlogRoleLoadFailed)).not.toBeInTheDocument())
    expect(await screen.findByRole("button", { name: t.backlogAddItem })).toBeInTheDocument()
    expect(calls().membersCalls).toBe(2)
  })

  it("moves an item down optimistically and sends the full order", async () => {
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getByRole("button", { name: t.backlogMoveDown.replace("{id}", "1") }))
    expect(titles(readySection())).toEqual(["Beta search", "Alpha login", "Gamma login"])
    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/reorder")).toEqual({ orderedIds: ["b", "a", "c"] }))
    expect(screen.getByText(t.backlogMovedAnnounce.replace("{id}", "1").replace("{pos}", "2"))).toBeInTheDocument()
  })

  it("reorders against the full list while a search filter hides items (regression)", async () => {
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.type(screen.getByRole("searchbox", { name: t.backlogSearchLabel }), "login")
    expect(titles(readySection())).toEqual(["Alpha login", "Gamma login"])

    // Gamma's visible neighbour is Alpha; Beta (hidden) must keep its slot.
    await userEvent.click(screen.getByRole("button", { name: t.backlogMoveUp.replace("{id}", "3") }))
    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/reorder")).toEqual({ orderedIds: ["c", "b", "a"] }))
    expect(titles(readySection())).toEqual(["Gamma login", "Alpha login"])
    expect(screen.getByText(t.backlogMovedAnnounce.replace("{id}", "3").replace("{pos}", "1"))).toBeInTheDocument()
  })

  it("rolls back the order and shows a toast when reordering fails", async () => {
    setup({ reorderStatus: 500 })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getByRole("button", { name: t.backlogMoveUp.replace("{id}", "2") }))
    expect(await screen.findByText(t.backlogReorderFailed)).toBeInTheDocument()
    await waitFor(() => expect(titles(readySection())).toEqual(["Alpha login", "Beta search", "Gamma login"]))
  })

  it("disables move-up on the first item and move-down on the last", async () => {
    setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    expect(screen.getByRole("button", { name: t.backlogMoveUp.replace("{id}", "1") })).toBeDisabled()
    expect(screen.getByRole("button", { name: t.backlogMoveDown.replace("{id}", "3") })).toBeDisabled()
  })

  it("changes status optimistically and rolls back with a toast on failure", async () => {
    const { fetchMock } = setup({ statusPatch: 500 })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getByRole("button", { name: t.backlogMoveToReady }))
    expect(bodyOf(fetchMock, "PATCH", "/backlog/d")).toEqual({ status: "ready" })
    expect(await screen.findByText(new RegExp(t.backlogStatusChangeFailed))).toBeInTheDocument()
    await waitFor(() => expect(titles(readySection())).toEqual(["Alpha login", "Beta search", "Gamma login"]))
  })

  it("changes status successfully and refetches", async () => {
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.backlogMoveToCompleted })[0])
    await waitFor(() => expect(bodyOf(fetchMock, "PATCH", "/backlog/a")).toEqual({ status: "completed" }))
    await userEvent.click(screen.getAllByRole("button", { name: t.backlogMoveToNotReady })[0])
  })

  it("asks before deleting and does nothing when cancelled", async () => {
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.backlogDeleteConfirm)
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false)
  })

  it("deletes after confirmation and shows a success toast", async () => {
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText(t.backlogDeleted)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/backlog/a") && i?.method === "DELETE")).toBe(true)
  })

  it("restores the item and toasts when delete fails", async () => {
    setup({ deleteStatus: 409 })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText(`${t.backlogDeleteFailed}: locked`)).toBeInTheDocument()
    await waitFor(() => expect(titles(readySection())).toContain("Alpha login"))
  })

  it("creates a PBI from the form", async () => {
    const { fetchMock } = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.click(screen.getByRole("button", { name: t.backlogAddItem }))
    const form = screen.getByRole("heading", { level: 2, name: t.backlogAddItem }).closest("section") as HTMLElement
    const [iceboxSelect, goalSelect] = within(form).getAllByRole("combobox")
    await user.selectOptions(goalSelect, "g1")
    await user.selectOptions(iceboxSelect, "ib1")
    await user.click(within(form).getByRole("button", { name: "5" }))
    await user.click(within(form).getByRole("button", { name: t.add }))
    expect(await screen.findByText(t.backlogSaved)).toBeInTheDocument()
    expect(bodyOf(fetchMock, "POST", "/backlog")).toMatchObject({
      iceboxItemId: "ib1",
      productGoalId: "g1",
      userStory: "Icebox request one",
      workloadScore: 5,
      status: "not_ready",
    })
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: t.backlogAddItem })).not.toBeInTheDocument())
  })

  it("keeps the form and toasts when saving fails", async () => {
    setup({ saveStatus: 422 })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.click(screen.getByRole("button", { name: t.backlogAddItem }))
    await user.click(screen.getByRole("button", { name: t.add }))
    expect(await screen.findByText(new RegExp(t.backlogSaveFailed))).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: t.backlogAddItem })).toBeInTheDocument()
  })

  it("asks before discarding unsaved edits and keeps them on cancel", async () => {
    setup()
    const user = userEvent.setup()
    const ui = (await import("@/components/ui")).getUiLabels("ja")
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.click(screen.getAllByRole("button", { name: t.edit })[0])
    const form = screen.getByRole("heading", { level: 2, name: t.edit }).closest("section") as HTMLElement
    const initiative = within(form).getAllByRole("textbox")[0]
    expect(initiative).toHaveValue("Alpha login")
    await user.type(initiative, " changed")

    const listener = vi.fn((e: Event) => e.preventDefault())
    window.addEventListener("beforeunload", listener)
    window.dispatchEvent(new Event("beforeunload", { cancelable: true }))
    window.removeEventListener("beforeunload", listener)

    await user.click(within(form).getByRole("button", { name: t.cancel }))
    let dialog = screen.getByRole("alertdialog", { name: ui.unsavedTitle })
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(initiative).toHaveValue("Alpha login changed")

    // Opening another item also asks; discarding switches to it.
    await user.click(screen.getAllByRole("button", { name: t.edit })[1])
    dialog = screen.getByRole("alertdialog", { name: ui.unsavedTitle })
    await user.click(within(dialog).getByRole("button", { name: ui.discard }))
    await waitFor(() => expect(within(screen.getByRole("heading", { level: 2, name: t.edit }).closest("section") as HTMLElement).getAllByRole("textbox")[0]).toHaveValue("Beta search"))

    // Clean form closes without asking.
    await user.click(screen.getByRole("button", { name: t.cancel }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 2, name: t.edit })).not.toBeInTheDocument()
  })

  it("updates an existing PBI with PATCH", async () => {
    const { fetchMock } = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.click(screen.getAllByRole("button", { name: t.edit })[1])
    await user.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(bodyOf(fetchMock, "PATCH", "/backlog/b")).toMatchObject({ initiative: "Beta search", status: "ready" }))
  })

  it("warns before reusing an Icebox item already referenced by another PBI", async () => {
    const fetchMock = stubFetch([
      { match: `${BASE}/backlog`, method: "GET", respond: () => jsonResponse(backlogResponse({ readyItems: [pbi("a", 1, { iceboxItemId: "ib1", initiative: "Uses ib1" })], notReadyItems: [] })) },
      { match: `${BASE}/icebox`, respond: () => jsonResponse({ unreviewed: [{ id: "ib1", displayId: 11, request: "Req", background: null, author: "Ann", status: "unreviewed" }], reviewed: [] }) },
      { match: `${BASE}/goals`, respond: () => jsonResponse([]) },
      { match: `${BASE}/members`, respond: () => jsonResponse([{ role: "sm", user: { id: "u1" } }]) },
      { match: BASE, respond: () => jsonResponse({}) },
    ])
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    // Header action + the empty Not-Ready section's action both open the form.
    const addButtons = screen.getAllByRole("button", { name: t.backlogAddItem })
    expect(addButtons).toHaveLength(2)
    await user.click(addButtons[1])
    const form = screen.getByRole("heading", { level: 2, name: t.backlogAddItem }).closest("section") as HTMLElement
    const iceboxSelect = within(form).getAllByRole("combobox")[0]
    expect(within(iceboxSelect).getByRole("option", { name: /#11/ })).toHaveTextContent(t.backlogIceboxAlreadyUsedTag)

    await user.selectOptions(iceboxSelect, "ib1")
    let dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent("#1 Uses ib1")
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(iceboxSelect).toHaveValue("")

    await user.selectOptions(iceboxSelect, "ib1")
    dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: t.backlogIceboxReuseAnyway }))
    expect(iceboxSelect).toHaveValue("ib1")
    expect(within(form).getByRole("status")).toHaveTextContent(t.backlogIceboxAlreadyUsedTitle)

    // Clearing the selection.
    await user.selectOptions(iceboxSelect, "")
    expect(iceboxSelect).toHaveValue("")
    expect(fetchMock).toHaveBeenCalled()
  })

  it("toggles completed items and opens the INVEST review modal", async () => {
    setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    const toggle = screen.getByRole("button", { name: new RegExp(t.backlogShowCompleted) })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(screen.getByText("Epsilon")).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${t.backlogCompletedDate}: 2026/01/02`))).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.backlogReturnToReady }))

    await user.click(screen.getAllByRole("button", { name: t.aiInvestReview })[0])
    expect(screen.getByTestId("ai-modal")).toHaveTextContent("/api/projects/p1/backlog/a/ai/invest-review")
    await user.click(screen.getByText("close-ai"))
    expect(screen.queryByTestId("ai-modal")).not.toBeInTheDocument()
  })

  it.each(["en", "id"] as const)("renders localized headings in %s", async (lang) => {
    setup()
    const tl = tr(lang)
    renderPage(lang)
    expect(await screen.findByRole("heading", { name: tl.backlogSectionReadyTitle })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: tl.backlogAddItem })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: tl.backlogSearchLabel })).toBeInTheDocument()
  })
})
