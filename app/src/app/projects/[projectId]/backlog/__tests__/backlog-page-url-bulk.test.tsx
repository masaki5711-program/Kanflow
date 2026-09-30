import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders } from "@/app/__tests__/test-utils"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { backlogResponse, pbi } from "./fixtures"
import { resetUrl } from "./nav-mock"
import { BASE, bodyOf, callsOf, readySection, sectionByTitle, setupBacklog as setup, t, titles } from "./page-harness"

const session = vi.hoisted(() => ({ value: { user: { id: "u1", role: "user" } } as { user: { id: string; role: string } } | null }))

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationModule({ projectId: "p1" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.value }) }))
vi.mock("@/components/live-announcer", () => ({ announce: vi.fn() }))
vi.mock("@/components/pbi-detail-modal", async () => (await import("./page-harness")).detailModalMock)

const { default: BacklogPage } = await import("../page")

const pt = getProjectTypeLabels("software", "ja")
const renderPage = () => renderWithProviders(<BacklogPage />, { language: "ja" })
const ready = () => screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
const filters = () => screen.getByRole("group", { name: t.backlogFiltersLabel })

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  session.value = { user: { id: "u1", role: "user" } }
  resetUrl("/projects/p1/backlog")
})

describe("BacklogPage — URL state", () => {
  it("applies filters from the URL on load (search + status facet hides other sections)", async () => {
    resetUrl("/projects/p1/backlog?q=login&status=ready")
    setup()
    renderPage()
    await ready()
    expect(titles(readySection())).toEqual(["Alpha login", "Gamma login"])
    expect(screen.queryByRole("heading", { name: t.backlogSectionNotReadyTitle })).not.toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: t.backlogSearchLabel })).toHaveValue("login")
    expect(within(filters()).getByRole("status")).toHaveTextContent(t.backlogFilterResult.replace("{shown}", "2").replace("{total}", "5"))
  })

  it("facet selects write the URL; Clear removes every filter", async () => {
    setup({
      backlog: backlogResponse({
        readyItems: [pbi("a", 1, { epic: "Auth", workloadScore: 5, assignedPo: "Hanako" }), pbi("b", 2, { epic: "Billing", workloadScore: 3 })],
      }),
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.selectOptions(within(filters()).getByRole("combobox", { name: pt.backlogEpic }), "Auth")
    expect(window.location.search).toBe("?epic=Auth")
    expect(titles(readySection())).toEqual(["Initiative a"])
    await user.selectOptions(within(filters()).getByRole("combobox", { name: pt.backlogWorkloadScore }), "5")
    expect(window.location.search).toBe("?epic=Auth&points=5")
    await user.click(screen.getByRole("button", { name: t.backlogFilterClear }))
    expect(window.location.search).toBe("")
    expect(titles(readySection())).toEqual(["Initiative a", "Initiative b"])
  })

  it("the Back button restores an earlier search", async () => {
    setup()
    renderPage()
    await ready()
    act(() => window.history.pushState(null, "", "/projects/p1/backlog?q=beta"))
    await waitFor(() => expect(titles(readySection())).toEqual(["Beta search"]))
    expect(screen.getByRole("searchbox", { name: t.backlogSearchLabel })).toHaveValue("beta")
    act(() => window.history.back())
    await waitFor(() => expect(titles(readySection())).toEqual(["Alpha login", "Beta search", "Gamma login"]))
    expect(screen.getByRole("searchbox", { name: t.backlogSearchLabel })).toHaveValue("")
  })

  it("?pbi=<displayId> deep-links to the PBI modal; closing removes the param", async () => {
    resetUrl("/projects/p1/backlog?pbi=2")
    setup()
    renderPage()
    expect(await screen.findByTestId("pbi-detail")).toHaveTextContent("detail b")
    await userEvent.click(screen.getByText("close-detail"))
    await waitFor(() => expect(screen.queryByTestId("pbi-detail")).not.toBeInTheDocument())
    expect(window.location.search).toBe("")
  })

  it("?pbi=<id> opens right away (also for PBIs outside the list, e.g. from notifications)", async () => {
    resetUrl("/projects/p1/backlog?pbi=zzz")
    setup()
    renderPage()
    expect(screen.getByTestId("pbi-detail")).toHaveTextContent("detail zzz")
  })

  it("an unknown displayId toasts and drops the param", async () => {
    resetUrl("/projects/p1/backlog?pbi=99")
    setup()
    renderPage()
    expect(await screen.findByText(t.backlogPbiNotFound.replace("{ref}", "99"))).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(""))
    expect(screen.queryByTestId("pbi-detail")).not.toBeInTheDocument()
  })
})

describe("BacklogPage — completed items paging", () => {
  it("shows the newest 20 completed items first and pages with 'show more'", async () => {
    resetUrl("/projects/p1/backlog?showDone=1")
    const done = Array.from({ length: 25 }, (_, i) =>
      pbi(`d${String.fromCharCode(97 + i)}`, 100 + i, { status: "completed", initiative: `Done ${i}`, completedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }),
    )
    setup({ backlog: backlogResponse({ completedItems: done }) })
    renderPage()
    await ready()
    const section = sectionByTitle(t.backlogStatusCompleted)
    expect(titles(section)).toHaveLength(20)
    expect(titles(section)[0]).toBe("Done 24")
    expect(within(section).getByText(t.backlogDoneShowing.replace("{shown}", "20").replace("{total}", "25"))).toBeInTheDocument()
    await userEvent.click(within(section).getByRole("button", { name: t.backlogShowMoreDone.replace("{count}", "5") }))
    expect(titles(sectionByTitle(t.backlogStatusCompleted))).toHaveLength(25)
    expect(screen.queryByRole("button", { name: /もっと見る/ })).not.toBeInTheDocument()
  })
})

describe("BacklogPage — bulk actions", () => {
  async function enterSelectMode() {
    await ready()
    await userEvent.click(screen.getByRole("button", { name: t.backlogSelectMode }))
    return screen.getByRole("region", { name: t.backlogBulkActionsLabel })
  }
  const box = (displayId: number) => screen.getByRole("checkbox", { name: t.backlogSelectItem.replace("{id}", String(displayId)) })

  it("shift-click selects a range across sections; bulk status posts the selected ids", async () => {
    const { fetchMock } = setup({ bulk: () => jsonResponse({ action: "status", affectedIds: ["b", "c", "d"], skippedIds: [] }) })
    renderPage()
    const bar = await enterSelectMode()
    await userEvent.click(box(2))
    fireEvent.click(box(4), { shiftKey: true })
    expect(within(bar).getByText(t.backlogSelectedCount.replace("{count}", "3"))).toBeInTheDocument()
    await userEvent.selectOptions(within(bar).getByRole("combobox", { name: t.backlogBulkStatus }), "completed")
    await userEvent.click(within(bar).getByRole("button", { name: t.backlogBulkStatus }))
    await waitFor(() => expect(bodyOf(fetchMock, "POST", "/backlog/bulk")).toEqual({ ids: ["b", "c", "d"], action: "status", payload: { status: "completed" } }))
    expect(await screen.findByText(t.backlogBulkDone.replace("{count}", "3"))).toBeInTheDocument()
    // Selection is cleared after the action.
    await waitFor(() => expect(within(bar).getByText(t.backlogSelectedCount.replace("{count}", "0"))).toBeInTheDocument())
  })

  it("adds to an open sprint and assigns a PO; skipped items are reported", async () => {
    const { fetchMock } = setup({ bulk: () => jsonResponse({ action: "addToSprint", affectedIds: ["a"], skippedIds: ["b"] }) })
    const user = userEvent.setup()
    renderPage()
    const bar = await enterSelectMode()
    await user.click(within(bar).getByRole("button", { name: t.backlogSelectAllVisible }))
    const sprintSelect = within(bar).getByRole("combobox", { name: t.backlogBulkChooseSprint })
    await waitFor(() => expect(within(sprintSelect).getByRole("option", { name: "Sprint 1" })).toBeInTheDocument())
    expect(within(sprintSelect).queryByRole("option", { name: "Old sprint" })).not.toBeInTheDocument()
    await user.selectOptions(sprintSelect, "s1")
    await user.click(within(bar).getByRole("button", { name: t.backlogBulkAddToSprint }))
    await waitFor(() => expect(bodyOf(fetchMock, "POST", "/backlog/bulk")).toMatchObject({ action: "addToSprint", payload: { sprintId: "s1" }, ids: ["a", "b", "c", "d"] }))
    expect(await screen.findByText(t.backlogBulkSkipped.replace("{count}", "1"))).toBeInTheDocument()

    await user.click(box(1))
    const poSelect = within(bar).getByRole("combobox", { name: pt.rolePO })
    await user.selectOptions(poSelect, "Hanako")
    await user.click(within(bar).getByRole("button", { name: t.backlogBulkAssignPo.replace("{po}", pt.rolePO) }))
    await waitFor(() => expect(callsOf(fetchMock, "POST", "/backlog/bulk")).toHaveLength(2))
    expect(JSON.parse(String(callsOf(fetchMock, "POST", "/backlog/bulk")[1][1]?.body))).toEqual({ ids: ["a"], action: "assignPo", payload: { assignedPo: "Hanako" } })
  })

  it("bulk trash confirms, then offers Undo that restores every trashed PBI", async () => {
    const { fetchMock } = setup({ bulk: () => jsonResponse({ action: "trash", affectedIds: ["a", "b"], skippedIds: [] }) })
    renderPage()
    const bar = await enterSelectMode()
    await userEvent.click(box(1))
    await userEvent.click(box(2))
    await userEvent.click(within(bar).getByRole("button", { name: t.trashMoveToTrash }))
    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.backlogBulkTrashConfirm.replace("{count}", "2"))
    await userEvent.click(within(dialog).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText(t.backlogTrashedToast.replace("{count}", "2"))).toBeInTheDocument()
    expect(bodyOf(fetchMock, "POST", "/backlog/bulk")).toEqual({ ids: ["a", "b"], action: "trash" })
    await userEvent.click(screen.getByRole("button", { name: t.backlogUndo }))
    expect(await screen.findByText(t.backlogRestored.replace("{count}", "2"))).toBeInTheDocument()
    expect(callsOf(fetchMock, "POST", `${BASE}/trash/backlog_item/a/restore`)).toHaveLength(1)
    expect(callsOf(fetchMock, "POST", `${BASE}/trash/backlog_item/b/restore`)).toHaveLength(1)
  })

  it("toasts a failed bulk request and keeps the selection", async () => {
    setup({ bulk: () => jsonResponse({ error: "boom" }, 500) })
    renderPage()
    const bar = await enterSelectMode()
    await userEvent.click(box(1))
    await userEvent.click(within(bar).getByRole("button", { name: t.backlogBulkStatus }))
    expect(await screen.findByText(`${t.backlogBulkFailed}: boom`)).toBeInTheDocument()
    expect(box(1)).toBeChecked()
  })

  it("SMs get the bar without trash; leaving select mode clears it", async () => {
    setup({ role: "sm" })
    renderPage()
    const bar = await enterSelectMode()
    expect(within(bar).queryByRole("button", { name: t.trashMoveToTrash })).not.toBeInTheDocument()
    await userEvent.click(box(1))
    await userEvent.click(screen.getByRole("button", { name: t.backlogSelectModeExit }))
    expect(screen.queryByRole("region", { name: t.backlogBulkActionsLabel })).not.toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })
})
