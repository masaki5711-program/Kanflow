import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders } from "@/app/__tests__/test-utils"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { BULK_CLEAR, poCandidates } from "../bulk-action-bar"
import { backlogResponse, pbi } from "./fixtures"
import { resetUrl } from "./nav-mock"
import { bodyOf, callsOf, setupBacklog as setup, t } from "./page-harness"

/** Bulk "link to master plan" (F-03), explicit PO choice (F-11), filtered empty state + export (F-09 / F-13). */
const session = vi.hoisted(() => ({ value: { user: { id: "u1", role: "user" } } as { user: { id: string; role: string } } | null }))

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationModule({ projectId: "p1" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.value }) }))
vi.mock("@/components/live-announcer", () => ({ announce: vi.fn() }))
vi.mock("@/components/pbi-detail-modal", async () => (await import("./page-harness")).detailModalMock)

const { default: BacklogPage } = await import("../page")

const pt = getProjectTypeLabels("software", "ja")
const renderPage = () => renderWithProviders(<BacklogPage />, { language: "ja" })
const PLAN = {
  today: "2026-10-01",
  dependencies: [],
  items: [
    { id: "P", name: "Phase", plannedStart: "2026-10-01", plannedEnd: "2026-10-10", sortOrder: 1 },
    { id: "L", parentId: "P", name: "Leaf", plannedStart: "2026-10-01", plannedEnd: "2026-10-03", sortOrder: 1 },
  ],
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  session.value = { user: { id: "u1", role: "user" } }
  resetUrl("/projects/p1/backlog")
})

async function selectAll() {
  await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
  await userEvent.click(screen.getByRole("button", { name: t.backlogSelectMode }))
  const bar = screen.getByRole("region", { name: t.backlogBulkActionsLabel })
  await userEvent.click(within(bar).getByRole("button", { name: t.backlogSelectAllVisible }))
  return bar
}

describe("bulk: link to master plan (F-03)", () => {
  it("links the selection to a leaf plan item (parents disabled)", async () => {
    const { fetchMock } = setup({ plan: PLAN, bulk: () => jsonResponse({ action: "linkPlan", affectedIds: ["a"], skippedIds: [] }) })
    renderPage()
    const bar = await selectAll()
    const select = within(bar).getByRole("combobox", { name: t.backlogBulkChoosePlan })
    await within(select).findByRole("option", { name: /Leaf/ })
    expect(within(select).getByRole("option", { name: /Phase/ })).toBeDisabled()
    const button = within(bar).getByRole("button", { name: t.backlogBulkLinkPlan })
    expect(button).toBeDisabled()
    await userEvent.selectOptions(select, "L")
    await userEvent.click(button)
    await waitFor(() => expect(bodyOf(fetchMock, "POST", "/backlog/bulk")).toMatchObject({ action: "linkPlan", payload: { planItemId: "L" } }))
  })

  it("unlinking asks first and sends null", async () => {
    const { fetchMock } = setup({ plan: PLAN, bulk: () => jsonResponse({ action: "linkPlan", affectedIds: ["a"], skippedIds: [] }) })
    renderPage()
    const bar = await selectAll()
    await userEvent.selectOptions(within(bar).getByRole("combobox", { name: t.backlogBulkChoosePlan }), BULK_CLEAR)
    await userEvent.click(within(bar).getByRole("button", { name: t.backlogBulkLinkPlan }))
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: t.backlogBulkClearConfirmLabel }))
    await waitFor(() => expect(bodyOf(fetchMock, "POST", "/backlog/bulk")).toMatchObject({ action: "linkPlan", payload: { planItemId: null } }))
  })
})

describe("bulk: PO needs an explicit choice (F-11)", () => {
  it("nothing is preselected; clearing asks and can be cancelled", async () => {
    const { fetchMock } = setup({ bulk: () => jsonResponse({ action: "assignPo", affectedIds: ["a"], skippedIds: [] }) })
    renderPage()
    const bar = await selectAll()
    const assign = within(bar).getByRole("button", { name: t.backlogBulkAssignPo.replace("{po}", pt.rolePO) })
    expect(assign).toBeDisabled()
    await userEvent.selectOptions(within(bar).getByRole("combobox", { name: pt.rolePO }), BULK_CLEAR)
    await userEvent.click(assign)
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.backlogBulkClearPoConfirm.replace("{po}", pt.rolePO).replace("{count}", "4"))
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(callsOf(fetchMock, "POST", "/backlog/bulk")).toHaveLength(0)

    await userEvent.click(assign)
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.backlogBulkClearConfirmLabel }))
    await waitFor(() => expect(bodyOf(fetchMock, "POST", "/backlog/bulk")).toMatchObject({ action: "assignPo", payload: { assignedPo: null } }))
  })

  it("offers the project's POs (everyone when there is no PO)", () => {
    const members = [
      { role: "dev", user: { id: "1", name: "Dev" } },
      { role: "po", user: { id: "2", name: "Hanako" } },
      { role: "sm", user: { id: "3", name: "Sam" } },
    ]
    expect(poCandidates(members)).toEqual(["Hanako"])
    expect(poCandidates(members.filter((m) => m.role !== "po"))).toEqual(["Dev", "Sam"])
  })
})

describe("filters: empty sections and export (F-09 / F-13)", () => {
  it("an empty section under active filters says 'no match'; the export link carries the filters", async () => {
    resetUrl("/projects/p1/backlog?q=nomatch-xyz")
    setup({ backlog: backlogResponse({ readyItems: [pbi("a", 1)], notReadyItems: [] }) })
    renderPage()
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    expect(screen.getAllByText(t.backlogNoFilterMatch).length).toBeGreaterThan(0)
    expect(screen.queryByText(t.iceboxNoItems)).not.toBeInTheDocument()
    const link = screen.getByRole("link", { name: t.excelExport })
    expect(link.getAttribute("href")).toContain("q=nomatch-xyz")
    expect(link).toHaveAttribute("title", t.backlogExportFilteredHint)
  })
})

describe("?tab=comments deep link (F-05)", () => {
  it("opens the PBI modal on the Comments tab; closing drops both params", async () => {
    resetUrl("/projects/p1/backlog?pbi=2&tab=comments")
    setup()
    renderPage()
    const detail = await screen.findByTestId("pbi-detail")
    expect(detail).toHaveAttribute("data-tab", "comments")
    await userEvent.click(screen.getByText("close-detail"))
    await waitFor(() => expect(screen.queryByTestId("pbi-detail")).not.toBeInTheDocument())
    expect(window.location.search).toBe("")
  })
})
