import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, tr } from "@/app/__tests__/test-utils"
import type { Language } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { backlogResponse, pbi } from "./fixtures"
import { resetUrl } from "./nav-mock"
import { BASE, bodyOf, callsOf, installPointerEvent, readySection, sectionByTitle, setupBacklog as setup, t, titles } from "./page-harness"

const pt = getProjectTypeLabels("software", "ja")
const session = vi.hoisted(() => ({ value: { user: { id: "u1", role: "user" } } as { user: { id: string; role: string } } | null }))

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationModule({ projectId: "p1" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.value }) }))
vi.mock("@/components/live-announcer", () => ({ announce: vi.fn() }))
vi.mock("@/components/pbi-detail-modal", async () => (await import("./page-harness")).detailModalMock)
vi.mock("@/components/ai-result-modal", () => ({
  AIResultModal: ({ fetchUrl, onClose }: { fetchUrl: string; onClose: () => void }) => (
    <div data-testid="ai-modal">
      {fetchUrl}
      <button type="button" onClick={onClose}>
        close-ai
      </button>
    </div>
  ),
}))

const { announce } = await import("@/components/live-announcer")
const { default: BacklogPage } = await import("../page")

function renderPage(language: Language = "ja") {
  return renderWithProviders(<BacklogPage />, { language })
}

const handle = (displayId: number) => screen.getByRole("button", { name: t.backlogDragHandle.replace("{id}", String(displayId)) })

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  session.value = { user: { id: "u1", role: "user" } }
  resetUrl("/projects/p1/backlog")
  vi.mocked(announce).mockClear()
})

describe("BacklogPage — loading and permissions", () => {
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

  it("developers get read-only cards: no add / drag / select, a view button opens the detail", async () => {
    setup({ role: "developer" })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    expect(screen.queryByRole("button", { name: t.backlogAddItem })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.backlogDragHandle.replace("{id}", "2") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.backlogSelectMode })).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole("button", { name: t.view })[0])
    expect(screen.getByTestId("pbi-detail")).toHaveTextContent("detail a")
    expect(screen.getByTestId("pbi-detail")).toHaveAttribute("data-editable", "false")
    await userEvent.click(screen.getByText("close-detail"))
    await waitFor(() => expect(screen.queryByTestId("pbi-detail")).not.toBeInTheDocument())
  })

  it("SMs edit but cannot reorder or trash (PO-only on the server)", async () => {
    setup({ role: "sm" })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    expect(screen.getAllByRole("button", { name: t.edit }).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: t.backlogDragHandle.replace("{id}", "1") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.delete })).not.toBeInTheDocument()
  })

  it("grants admins edit rights without membership", async () => {
    session.value = { user: { id: "u1", role: "admin" } }
    setup({ role: null })
    renderPage()
    expect(await screen.findByRole("button", { name: t.backlogAddItem })).toBeInTheDocument()
    expect(handle(1)).toBeInTheDocument()
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

  it.each(["en", "id"] as const)("renders localized headings in %s", async (lang) => {
    setup()
    const tl = tr(lang)
    renderPage(lang)
    expect(await screen.findByRole("heading", { name: tl.backlogSectionReadyTitle })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: tl.backlogAddItem })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: tl.backlogSearchLabel })).toBeInTheDocument()
  })
})

describe("BacklogPage — keyboard / pointer reordering", () => {
  it("Space picks up, ↓ moves (live preview), Space drops and saves the full order", async () => {
    const { fetchMock } = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    handle(1).focus()
    await user.keyboard(" ")
    expect(announce).toHaveBeenLastCalledWith(t.backlogDragPicked.replace("{id}", "1").replace("{pos}", "1").replace("{total}", "3"))
    await user.keyboard("{ArrowDown}")
    expect(titles(readySection())).toEqual(["Beta search", "Alpha login", "Gamma login"])
    expect(announce).toHaveBeenLastCalledWith(t.backlogDragMoved.replace("{id}", "1").replace("{pos}", "2").replace("{total}", "3"))
    expect(handle(1)).toHaveFocus()
    expect(callsOf(fetchMock, "PUT", "/reorder")).toHaveLength(0)
    await user.keyboard(" ")
    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/reorder")).toEqual({ orderedIds: ["b", "a", "c"] }))
    expect(titles(readySection())).toEqual(["Beta search", "Alpha login", "Gamma login"])
    expect(announce).toHaveBeenLastCalledWith(t.backlogMovedAnnounce.replace("{id}", "1").replace("{pos}", "2"))
  })

  it("Esc cancels a keyboard drag without saving", async () => {
    const { fetchMock } = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    handle(3).focus()
    await user.keyboard(" {ArrowUp}{ArrowUp}")
    expect(titles(readySection())).toEqual(["Gamma login", "Alpha login", "Beta search"])
    await user.keyboard("{Escape}")
    expect(titles(readySection())).toEqual(["Alpha login", "Beta search", "Gamma login"])
    expect(announce).toHaveBeenLastCalledWith(t.backlogDragCancelled.replace("{id}", "3").replace("{pos}", "3"))
    expect(callsOf(fetchMock, "PUT", "/reorder")).toHaveLength(0)
  })

  it("reorders against the full list while a search filter hides items (regression)", async () => {
    const { fetchMock } = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.type(screen.getByRole("searchbox", { name: t.backlogSearchLabel }), "login")
    expect(titles(readySection())).toEqual(["Alpha login", "Gamma login"])
    expect(window.location.search).toBe("?q=login")
    // Gamma's visible neighbour is Alpha; Beta (hidden) must keep its slot.
    handle(3).focus()
    await user.keyboard(" {ArrowUp} ")
    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/reorder")).toEqual({ orderedIds: ["c", "b", "a"] }))
    expect(titles(readySection())).toEqual(["Gamma login", "Alpha login"])
  })

  it("pointer drag shows a drop indicator and saves on release", async () => {
    installPointerEvent()
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    // jsdom has no layout: give the ready rows 100px slots (midpoints 50 / 150 / 250).
    readySection()
      .querySelectorAll<HTMLElement>("[data-dnd-row]")
      .forEach((row, i) => {
        row.getBoundingClientRect = () => ({ top: i * 100, height: 100, bottom: i * 100 + 100, left: 0, right: 0, width: 0, x: 0, y: i * 100, toJSON: () => ({}) })
      })
    fireEvent.pointerDown(handle(1), { button: 0, clientY: 50 })
    expect(handle(1)).toHaveAttribute("aria-pressed", "true")
    fireEvent.pointerMove(window, { clientY: 260 })
    expect(readySection().querySelector("[data-drop-indicator]")).not.toBeNull()
    fireEvent.pointerUp(window)
    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/reorder")).toEqual({ orderedIds: ["b", "c", "a"] }))
    expect(readySection().querySelector("[data-drop-indicator]")).toBeNull()
  })

  it("pointer drag released in place or cancelled with Esc saves nothing", async () => {
    installPointerEvent()
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    fireEvent.pointerDown(handle(2), { button: 0, clientY: 0 })
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(handle(2), { button: 0, clientY: 0 })
    fireEvent.keyDown(window, { key: "Escape" })
    expect(handle(2)).toHaveAttribute("aria-pressed", "false")
    expect(callsOf(fetchMock, "PUT", "/reorder")).toHaveLength(0)
  })

  it("menu: move to bottom / top of the full section", async () => {
    const { fetchMock } = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.click(screen.getByRole("button", { name: t.backlogMoreActions.replace("{id}", "1") }))
    await user.click(screen.getByRole("menuitem", { name: t.backlogMoveToBottom }))
    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/reorder")).toEqual({ orderedIds: ["b", "c", "a"] }))
    await user.click(screen.getByRole("button", { name: t.backlogMoreActions.replace("{id}", "3") }))
    await user.click(screen.getByRole("menuitem", { name: t.backlogMoveToTop }))
    await waitFor(() => expect(callsOf(fetchMock, "PUT", "/reorder")).toHaveLength(2))
    expect(JSON.parse(String(callsOf(fetchMock, "PUT", "/reorder")[1][1]?.body))).toEqual({ orderedIds: ["c", "b", "a"] })
  })

  it("rolls back the order and shows a toast when reordering fails", async () => {
    setup({ reorderStatus: 500 })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.click(screen.getByRole("button", { name: t.backlogMoreActions.replace("{id}", "2") }))
    await user.click(screen.getByRole("menuitem", { name: t.backlogMoveToTop }))
    expect(await screen.findByText(t.backlogReorderFailed)).toBeInTheDocument()
    await waitFor(() => expect(titles(readySection())).toEqual(["Alpha login", "Beta search", "Gamma login"]))
  })
})

describe("BacklogPage — status, trash and undo", () => {
  it("changes status optimistically and rolls back with a toast on failure", async () => {
    const { fetchMock } = setup({ statusPatch: 500 })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getByRole("button", { name: t.backlogMoveToReady }))
    expect(bodyOf(fetchMock, "PATCH", "/backlog/d")).toEqual({ status: "ready" })
    expect(await screen.findByText(new RegExp(t.backlogStatusChangeFailed))).toBeInTheDocument()
    await waitFor(() => expect(titles(readySection())).toEqual(["Alpha login", "Beta search", "Gamma login"]))
  })

  it("asks before trashing and does nothing when cancelled", async () => {
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.backlogDeleteConfirm)
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(callsOf(fetchMock, "DELETE", "/backlog/")).toHaveLength(0)
  })

  it("trashes after confirmation and offers Undo, which restores through the trash API", async () => {
    const { fetchMock } = setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText(t.backlogTrashedToast.replace("{count}", "1"))).toBeInTheDocument()
    expect(callsOf(fetchMock, "DELETE", /\/backlog\/a$/)).toHaveLength(1)
    await userEvent.click(screen.getByRole("button", { name: t.backlogUndo }))
    expect(await screen.findByText(t.backlogRestored.replace("{count}", "1"))).toBeInTheDocument()
    expect(callsOf(fetchMock, "POST", `${BASE}/trash/backlog_item/a/restore`)).toHaveLength(1)
  })

  it("reports a failed undo", async () => {
    setup({ restoreStatus: 409 })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    await userEvent.click(await screen.findByRole("button", { name: t.backlogUndo }))
    expect(await screen.findByText(t.backlogRestoreFailed)).toBeInTheDocument()
  })

  it("restores the item and toasts when trashing fails", async () => {
    setup({ deleteStatus: 409 })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText(`${t.backlogDeleteFailed}: locked`)).toBeInTheDocument()
    await waitFor(() => expect(titles(readySection())).toContain("Alpha login"))
  })

  it("sends the loaded version with a status change and a delete; a conflict refetches", async () => {
    let calls = 0
    const versioned = backlogResponse({ readyItems: [pbi("a", 1, { initiative: "Alpha login", version: 4 }), pbi("b", 2, { version: 2 })] })
    const { fetchMock, calls: count } = setup({
      backlog: versioned,
      statusPatch: () => (calls++ === 0 ? jsonResponse({ ok: true }) : jsonResponse({ error: "stale", code: "VERSION_CONFLICT", current: null }, 409)),
    })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.backlogMoveToCompleted })[0])
    await waitFor(() => expect(bodyOf(fetchMock, "PATCH", "/backlog/a")).toEqual({ status: "completed", version: 4 }))
    await userEvent.click(screen.getAllByRole("button", { name: t.backlogMoveToCompleted })[0])
    expect(await screen.findByText(t.apiErrVersionConflict)).toBeInTheDocument()
    await waitFor(() => expect(count().backlogCalls).toBeGreaterThan(2))
    await userEvent.click(screen.getAllByRole("button", { name: t.delete })[0])
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    await waitFor(() => expect(callsOf(fetchMock, "DELETE", /\/backlog\/[a-z]\?version=\d$/)).toHaveLength(1))
  })
})

describe("BacklogPage — create / edit / INVEST", () => {
  it("creates a PBI in the create modal", async () => {
    const { fetchMock } = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await user.click(screen.getByRole("button", { name: t.backlogAddItem }))
    const dialog = screen.getByRole("dialog", { name: t.backlogAddItem })
    const goalSelect = within(dialog).getAllByRole("combobox")[1]
    await user.selectOptions(goalSelect, "g1")
    // Untitled: "Add" stays disabled until an initiative or a user story is entered (F-01).
    expect(within(dialog).getByRole("button", { name: t.add })).toBeDisabled()
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(pt.backlogInitiative) }), "New PBI")
    await user.click(within(dialog).getByRole("button", { name: t.add }))
    expect(await screen.findByText(t.backlogSaved)).toBeInTheDocument()
    expect(bodyOf(fetchMock, "POST", "/backlog")).toMatchObject({ initiative: "New PBI", productGoalId: "g1", workloadScore: 0, status: "not_ready" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: t.backlogAddItem })).not.toBeInTheDocument())
  })

  it("the pencil opens the detail modal in edit mode, the title in read mode", async () => {
    setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    await userEvent.click(screen.getAllByRole("button", { name: t.edit })[1])
    expect(screen.getByTestId("pbi-detail")).toHaveTextContent("detail b")
    expect(screen.getByTestId("pbi-detail")).toHaveAttribute("data-mode", "edit")
    expect(screen.getByTestId("pbi-detail")).toHaveAttribute("data-editable", "true")
    expect(window.location.search).toBe("?pbi=2")
    await userEvent.click(screen.getByText("close-detail"))
    await waitFor(() => expect(window.location.search).toBe(""))
    await userEvent.click(screen.getByRole("button", { name: "Gamma login" }))
    expect(screen.getByTestId("pbi-detail")).toHaveAttribute("data-mode", "read")
  })

  it("toggles completed items (?showDone=1) and opens the INVEST review modal", async () => {
    setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    const toggle = screen.getByRole("button", { name: new RegExp(t.backlogShowCompleted) })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(window.location.search).toBe("?showDone=1")
    expect(screen.getByText("Epsilon")).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${t.backlogCompletedDate}: 2026/01/02`))).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.backlogReturnToReady }))

    await user.click(screen.getAllByRole("button", { name: t.aiInvestReview })[0])
    expect(screen.getByTestId("ai-modal")).toHaveTextContent("/api/projects/p1/backlog/a/ai/invest-review")
    await user.click(screen.getByText("close-ai"))
    expect(screen.queryByTestId("ai-modal")).not.toBeInTheDocument()
  })

  it("keeps the not-ready section's empty-state add button", async () => {
    setup({ backlog: backlogResponse({ notReadyItems: [] }) })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    const section = sectionByTitle(t.backlogSectionNotReadyTitle)
    await userEvent.click(within(section).getByRole("button", { name: t.backlogAddItem }))
    expect(screen.getByRole("dialog", { name: t.backlogAddItem })).toBeInTheDocument()
  })
})
