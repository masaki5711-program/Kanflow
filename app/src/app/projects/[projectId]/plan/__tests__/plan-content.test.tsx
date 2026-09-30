import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { resetUrl } from "@/app/projects/[projectId]/backlog/__tests__/nav-mock"
import { PlanContent } from "../plan-content"
import { formatShortDate } from "../lib/date-format"
import { BASE, TODAY, bodyOf, callsTo, freshState, planServer, stubMatchMedia, type ServerState } from "./plan-server"
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

const names = () => Array.from(document.querySelectorAll<HTMLElement>("[data-plan-name]")).map((b) => b.title)
const bar = (id: string) => document.querySelector<HTMLElement>(`[data-plan-bar="${id}"]`)!
const nameButton = (id: string) => document.querySelector<HTMLElement>(`[data-plan-name="${id}"]`)!

beforeEach(() => {
  state = freshState()
  installMemoryStorage()
  stubMatchMedia(false)
  resetUrl("/projects/p1/plan")
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
})

describe("PlanContent — rendering", () => {
  it("shows a skeleton, then rows in tree order with columns, scale and today label", async () => {
    renderPlan()
    expect(screen.getByRole("status", { busy: true })).toBeInTheDocument()
    await screen.findByTitle("Alpha")
    expect(names()).toEqual(["Alpha", "Alpha-1", "Alpha-2", "Beta", "Launch"])
    const row = document.querySelector<HTMLElement>('[data-plan-row="A1"]')!
    expect(within(row).getByText(formatShortDate("2026-10-01", "en"))).toBeInTheDocument()
    expect(within(row).getByText("5d")).toBeInTheDocument()
    expect(within(row).getByText("Sato")).toBeInTheDocument()
    expect(within(document.querySelector<HTMLElement>('[data-plan-row="A"]')!).getByText(t.planScheduleAtRisk)).toBeInTheDocument()
    expect(screen.getByText(`Today ${formatShortDate(TODAY, "en")}`)).toBeInTheDocument()
    expect(screen.getAllByText("October 2026").length).toBeGreaterThan(0)
  })

  it("draws summary, milestone, chips, sprint bands, baseline, actual and dependency arrows", async () => {
    renderPlan()
    await screen.findByTitle("Alpha")
    expect(bar("A")).toHaveAccessibleName(expect.stringContaining("rolled up"))
    expect(bar("M")).toHaveAccessibleName(expect.stringMatching(/^Milestone Launch/))
    expect(screen.getByText("PBI 3/5")).toBeInTheDocument()
    expect(screen.getByText("+3d")).toBeInTheDocument()
    expect(document.querySelector('[data-plan-sprint="s1"]')).not.toBeNull()
    expect(document.querySelector('[data-plan-baseline="B"]')).not.toBeNull()
    expect(document.querySelector('[data-plan-actual="A1"]')).not.toBeNull()
    const arrows = document.querySelectorAll("[data-plan-arrow]")
    expect(arrows).toHaveLength(2)
    // B ends 10/12 but A2 starts 10/06 → violated
    expect(document.querySelector('[data-plan-arrow="d2"]')).toHaveAttribute("data-violated", "true")
    expect(document.querySelector('[data-plan-arrow="d1"]')).not.toHaveAttribute("data-violated")
  })

  it("bars are end-inclusive (width = days × day width)", async () => {
    renderPlan()
    await screen.findByTitle("Alpha")
    // week zoom = 14px/day; A1 is 10/01–10/05 → 5 days
    expect(bar("A1").style.width).toBe("70px")
  })

  it("empty plan shows the empty state; load error toasts", async () => {
    state.items = []
    renderPlan()
    expect(await screen.findByText(t.planEmpty)).toBeInTheDocument()
  })

  it("load failure shows an error toast", async () => {
    state.fail.list = true
    renderPlan()
    expect(await screen.findByText("list broke")).toBeInTheDocument()
  })

  it("accepts the legacy array response", async () => {
    const fetchMock = planServer(state)
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify([{ id: "X", name: "Old", plannedStart: "2026-03-10T00:00:00.000Z", plannedEnd: "2026-03-12T00:00:00.000Z", status: "delayed" }]), { status: 200, headers: { "content-type": "application/json" } }))
    renderWithProviders(<PlanContent projectId="p1" canEdit />, { language: "en" })
    expect(await screen.findByTitle("Old")).toBeInTheDocument()
    expect(within(document.querySelector<HTMLElement>('[data-plan-row="X"]')!).getByText(t.planStatusDelayed)).toBeInTheDocument()
  })
})

describe("PlanContent — selection, keyboard and drag", () => {
  it("clicking a bar selects it and highlights its row; a grid click selects too", async () => {
    const user = userEvent.setup()
    renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(bar("B"))
    expect(bar("B")).toHaveAttribute("aria-current", "true")
    expect(document.querySelector('[data-plan-row="B"]')).toHaveAttribute("data-selected", "true")
    await user.click(nameButton("A1"))
    expect(document.querySelector('[data-plan-row="A1"]')).toHaveAttribute("data-selected", "true")
    expect(bar("A1")).toHaveAttribute("tabindex", "0")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("double click / Enter opens the editor", async () => {
    const user = userEvent.setup()
    renderPlan()
    await screen.findByTitle("Alpha")
    await user.dblClick(bar("B"))
    expect(await screen.findByRole("dialog", { name: t.planEditTitle })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.cancel }))
    nameButton("A1").focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("dialog", { name: t.planEditTitle })).toBeInTheDocument()
  })

  it("arrow keys nudge a leaf (one PATCH per burst, with version); summary bars do not move", async () => {
    const user = userEvent.setup()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    act(() => bar("A1").focus())
    await user.keyboard("{ArrowRight}{ArrowRight}")
    expect(document.body.textContent).toContain(`${formatShortDate("2026-10-03", "en")} → ${formatShortDate("2026-10-07", "en")}`)
    act(() => bar("A1").blur())
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/A1`)[0])).toEqual({ plannedStart: "2026-10-03", plannedEnd: "2026-10-07", version: 1 })
    act(() => bar("A").focus())
    await user.keyboard("{ArrowRight}")
    act(() => bar("A").blur())
    expect(callsTo(fetchMock, "PATCH", `${BASE}/A`)).toHaveLength(0)
  })

  it("dragging a bar with the mouse shows the live range and persists on release", async () => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>
    proto.setPointerCapture = vi.fn()
    proto.hasPointerCapture = vi.fn(() => false)
    proto.releasePointerCapture = vi.fn()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    const el = bar("B")
    const ptr = (type: string, clientX: number) => fireEvent(el, new MouseEvent(type, { bubbles: true, clientX, clientY: 5 }))
    ptr("pointerdown", 100)
    ptr("pointermove", 100 + 14 * 2)
    expect(document.body.textContent).toContain(`${formatShortDate("2026-10-05", "en")} → ${formatShortDate("2026-10-14", "en")}`)
    ptr("pointerup", 128)
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/B`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/B`)[0])).toEqual({ plannedStart: "2026-10-05", plannedEnd: "2026-10-14", version: 1 })
  })

  it("Alt+↓ reorders and Alt+→ indents through /reorder", async () => {
    const user = userEvent.setup()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    act(() => nameButton("A1").focus())
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(names()).toEqual(["Alpha", "Alpha-2", "Alpha-1", "Beta", "Launch"])
    await waitFor(() => expect(callsTo(fetchMock, "POST", `${BASE}/reorder`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "POST", `${BASE}/reorder`)[0])).toEqual({
      updates: [
        { id: "A2", parentId: "A", sortOrder: 1 },
        { id: "A1", parentId: "A", sortOrder: 2 },
      ],
    })
    act(() => nameButton("B").focus())
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}")
    await waitFor(() => expect(callsTo(fetchMock, "POST", `${BASE}/reorder`)).toHaveLength(2))
    expect(bodyOf(callsTo(fetchMock, "POST", `${BASE}/reorder`)[1])).toEqual({ updates: [{ id: "B", parentId: "A", sortOrder: 3 }] })
  })

  it("rolls back a failed reorder with a toast", async () => {
    state.fail.reorder = true
    const user = userEvent.setup()
    renderPlan()
    await screen.findByTitle("Alpha")
    act(() => nameButton("B").focus())
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}")
    expect(await screen.findByText("reorder broke")).toBeInTheDocument()
    expect(names()).toEqual(["Alpha", "Alpha-1", "Alpha-2", "Beta", "Launch"])
  })

  it("F2 renames inline: Enter saves with version, Esc cancels", async () => {
    const user = userEvent.setup()
    const fetchMock = renderPlan()
    await screen.findByTitle("Alpha")
    act(() => nameButton("B").focus())
    await user.keyboard("{F2}")
    const input = screen.getByRole("textbox", { name: t.planRenameLabel.replace("{name}", "Beta") })
    await user.clear(input)
    await user.type(input, "Gamma{Enter}")
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/B`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/B`)[0])).toEqual({ name: "Gamma", version: 1 })
    await user.dblClick(nameButton("A1"))
    await user.keyboard("zzz{Escape}")
    expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(0)
    expect(nameButton("A1")).toBeInTheDocument()
  })

  it("collapse hides children and persists; expand all / collapse all", async () => {
    const user = userEvent.setup()
    renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `${t.planCollapse}: Alpha` }))
    expect(names()).toEqual(["Alpha", "Beta", "Launch"])
    expect(window.localStorage.getItem("kanflow:plan:p1")).toContain('"A"')
    await user.click(screen.getByRole("button", { name: t.planExpandAll }))
    expect(names()).toHaveLength(5)
    await user.click(screen.getByRole("button", { name: t.planCollapseAll }))
    expect(names()).toEqual(["Alpha", "Beta", "Launch"])
  })

  it("filters by name / state keep ancestors and show a count", async () => {
    const user = userEvent.setup()
    renderPlan()
    await screen.findByTitle("Alpha")
    await user.type(screen.getByRole("searchbox", { name: t.planSearch }), "alpha-2")
    expect(names()).toEqual(["Alpha", "Alpha-2"])
    await user.clear(screen.getByRole("searchbox", { name: t.planSearch }))
    await user.selectOptions(screen.getByRole("combobox", { name: t.planFilterState }), "done")
    expect(names()).toEqual(["Beta"])
    await user.click(screen.getByRole("button", { name: t.planClearFilters }))
    expect(names()).toHaveLength(5)
  })
})
