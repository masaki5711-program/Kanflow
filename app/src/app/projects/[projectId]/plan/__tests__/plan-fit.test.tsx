import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { resetUrl } from "@/app/projects/[projectId]/backlog/__tests__/nav-mock"
import { PlanContent } from "../plan-content"
import { AUTO_NAME_MAX, AUTO_NAME_MIN, NAME_COLUMN_WIDTH } from "../lib/grid-layout"
import { freshState, planServer, stubMatchMedia, type ServerState } from "./plan-server"
import { installMemoryStorage, mkItem } from "./fixtures"

vi.mock("next/navigation", async () => (await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

stubLayout()
const t = tr("en")
let state: ServerState
const CHART_WIDTH = 1200
const scrollLefts = new WeakMap<HTMLElement, number>()

const chart = () => document.querySelector<HTMLElement>("[data-plan-chart]")!
const zoomParam = () => new URLSearchParams(window.location.search).get("zoom")

/** matchMedia that reports only the listed queries as matching. */
function stubQueries(matching: string[]) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

async function renderPlan(firstName = "Alpha") {
  planServer(state)
  renderWithProviders(<PlanContent projectId="p1" canEdit />, { language: "en" })
  await screen.findByTitle(firstName)
}

beforeEach(() => {
  state = freshState()
  installMemoryStorage()
  stubMatchMedia(false)
  resetUrl("/projects/p1/plan")
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-plan-chart") ? CHART_WIDTH : 0
  })
  vi.spyOn(HTMLElement.prototype, "scrollLeft", "get").mockImplementation(function (this: HTMLElement) {
    return scrollLefts.get(this) ?? 0
  })
  vi.spyOn(HTMLElement.prototype, "scrollLeft", "set").mockImplementation(function (this: HTMLElement, v: number) {
    scrollLefts.set(this, v)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("A3-09 plan first view / 全体を表示", () => {
  it("an all-overdue plan opens zoomed out to show every live bar (no empty timeline)", async () => {
    state.items = [
      mkItem({ id: "O1", name: "Old one", sortOrder: 1, plannedStart: "2026-06-01", plannedEnd: "2026-06-20", status: "in_progress", scheduleState: "delayed" }),
      mkItem({ id: "O2", name: "Old two", sortOrder: 2, plannedStart: "2026-06-15", plannedEnd: "2026-07-03", scheduleState: "delayed" }),
    ]
    await renderPlan("Old one")
    await waitFor(() => expect(zoomParam()).toBe("month"))
    await waitFor(() => expect(screen.getByRole("button", { name: t.planZoomMonth })).toHaveAttribute("aria-pressed", "true"))
    // nothing is counted off-screen once the fit applied
    await waitFor(() => expect(screen.queryByRole("button", { name: /before the visible period/ })).not.toBeInTheDocument())
  })

  it("a plan with current work keeps the default zoom; the fit button zooms to show everything", async () => {
    state.items = [
      ...state.items,
      mkItem({ id: "F", name: "Far", sortOrder: 9, plannedStart: "2027-03-01", plannedEnd: "2027-03-20" }),
    ]
    const user = userEvent.setup()
    await renderPlan()
    expect(zoomParam()).toBeNull()
    const fit = screen.getByRole("button", { name: t.planFitAll })
    await user.click(fit)
    await waitFor(() => expect(zoomParam()).toBe("quarter"))
    await waitFor(() => expect(screen.queryByRole("button", { name: /after the visible period/ })).not.toBeInTheDocument())
    expect(chart()).toBeInTheDocument()
  })
})

describe("A4-06 name column default width", () => {
  const splitter = () => screen.getByRole("separator", { name: t.planSplitterLabel })

  it("is sized to the longest name at ≥ 1280 px (clamped to [200, 360])", async () => {
    stubQueries(["(min-width: 1280px)"])
    await renderPlan()
    // short seed names → the lower clamp
    await waitFor(() => expect(splitter()).toHaveAttribute("aria-valuenow", String(AUTO_NAME_MIN)))
  })

  it("grows for long names up to the upper clamp", async () => {
    stubQueries(["(min-width: 1280px)"])
    state.items = [mkItem({ id: "L", name: "現状の条件マッピングと各部門で既に運用されている手順の棚卸し", sortOrder: 1 }), ...state.items]
    await renderPlan()
    await waitFor(() => expect(splitter()).toHaveAttribute("aria-valuenow", String(AUTO_NAME_MAX)))
  })

  it("keeps the fixed default below 1280 px", async () => {
    await renderPlan()
    await waitFor(() => expect(splitter()).toHaveAttribute("aria-valuenow", String(NAME_COLUMN_WIDTH)))
  })
})
