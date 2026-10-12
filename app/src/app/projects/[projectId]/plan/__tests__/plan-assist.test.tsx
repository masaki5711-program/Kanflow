import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { resetUrl } from "@/app/projects/[projectId]/backlog/__tests__/nav-mock"
import { PlanContent } from "../plan-content"
import { PLAN_COLUMNS, prefsKey } from "../lib/prefs"
import { BASE, bodyOf, callsTo, freshState, planServer, stubMatchMedia, type ServerState } from "./plan-server"
import { installMemoryStorage } from "./fixtures"

vi.mock("next/navigation", async () => (await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

stubLayout()
const t = tr("en")
let state: ServerState

function renderPlan(canEdit = true) {
  const fetchMock = planServer(state)
  renderWithProviders(<PlanContent projectId="p1" canEdit={canEdit} />, { language: "en" })
  return fetchMock
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-plan-row="${id}"]`)!
const showAllColumns = () => window.localStorage.setItem(prefsKey("p1"), JSON.stringify({ columns: PLAN_COLUMNS }))

beforeEach(() => {
  state = freshState()
  installMemoryStorage()
  stubMatchMedia(false)
  resetUrl("/projects/p1/plan")
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
})

describe("PlanContent — inline date editing", () => {
  it("edits a start date in the grid: short-hand resolves, the end follows, the followers are offered", async () => {
    showAllColumns()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    const user = userEvent.setup()

    // Alpha-1 runs Oct 1–5 (5 days) and precedes Alpha-2 (dependency d1).
    await user.click(within(row("A1")).getByRole("button", { name: /Edit start date: Alpha-1/ }))
    const input = within(row("A1")).getByRole("textbox", { name: /Edit start date/ })
    await user.clear(input)
    await user.type(input, "10/3{Enter}")

    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/A1`)[0])).toMatchObject({ plannedStart: "2026-10-03", plannedEnd: "2026-10-07" })
    // The end moved 2 days and Alpha-2 follows: the cascade question appears.
    expect(await screen.findByText(t.pscCascadeTitle)).toBeInTheDocument()
  })

  it("edits the duration: the end is derived from the start", async () => {
    showAllColumns()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    const user = userEvent.setup()

    await user.click(within(row("A1")).getByRole("button", { name: /Edit duration: Alpha-1/ }))
    const input = within(row("A1")).getByRole("spinbutton")
    await user.clear(input)
    await user.type(input, "3{Enter}")

    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/A1`)[0])).toMatchObject({ plannedStart: "2026-10-01", plannedEnd: "2026-10-03" })
  })

  it("an unreadable entry is flagged on Enter, dropped on Escape, and never sent", async () => {
    showAllColumns()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    const user = userEvent.setup()

    await user.click(within(row("A1")).getByRole("button", { name: /Edit end date: Alpha-1/ }))
    const input = within(row("A1")).getByRole("textbox", { name: /Edit end date/ })
    await user.clear(input)
    await user.type(input, "someday{Enter}")
    expect(input).toHaveAttribute("aria-invalid", "true")

    await user.keyboard("{Escape}")
    expect(within(row("A1")).queryByRole("textbox")).not.toBeInTheDocument()
    expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(0)
  })

  it("an end before the start is rejected with a message and no request", async () => {
    showAllColumns()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    const user = userEvent.setup()

    await user.click(within(row("A1")).getByRole("button", { name: /Edit end date: Alpha-1/ }))
    const input = within(row("A1")).getByRole("textbox", { name: /Edit end date/ })
    await user.clear(input)
    await user.type(input, "9/20{Enter}")

    expect(await screen.findByText(t.planDateOrderError)).toBeInTheDocument()
    expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(0)
  })

  it("viewers get no inline editing", async () => {
    showAllColumns()
    renderPlan(false)
    await screen.findByTitle("Alpha")
    expect(document.querySelector("[data-plan-inline]")).toBeNull()
  })
})

describe("PlanContent — multi-select", () => {
  it("shows checkboxes and the bulk bar; shift extends the range", async () => {
    renderPlan()
    await screen.findByTitle("Alpha")
    const user = userEvent.setup()

    await user.click(screen.getByTestId("plan-select-mode"))
    expect(screen.getByRole("toolbar", { name: t.pscBulkTitle })).toBeInTheDocument()

    await user.click(within(row("A1")).getByRole("checkbox"))
    expect(screen.getByText("1 selected")).toBeInTheDocument()
    fireEvent.click(within(row("B")).getByRole("checkbox"), { shiftKey: true })
    // Alpha-1, Alpha-2 and Beta lie between the two clicks (Alpha is a collapsed-in summary row above them).
    expect(screen.getByText("3 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: t.pscClearSelection }))
    expect(screen.getByText("0 selected")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.pscSelectModeOff }))
    expect(screen.queryByRole("toolbar", { name: t.pscBulkTitle })).not.toBeInTheDocument()
  })
})
