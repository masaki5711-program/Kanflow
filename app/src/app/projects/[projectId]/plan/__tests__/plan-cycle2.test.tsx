import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { resetUrl } from "@/app/projects/[projectId]/backlog/__tests__/nav-mock"
import { PlanContent } from "../plan-content"
import { ROW_HEIGHT } from "../lib/geometry"
import { PHONE_TIMELINE_PEEK } from "../lib/grid-layout"
import { PLAN_COLUMNS, prefsKey } from "../lib/prefs"
import { HEADER_HEIGHT } from "../components/plan-scale-header"
import { freshState, planServer, stubMatchMedia, type ServerState } from "./plan-server"
import { installMemoryStorage } from "./fixtures"

vi.mock("next/navigation", async () => (await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

stubLayout()
const t = tr("en")
let state: ServerState
let chartWidth = 1200

async function renderPlan() {
  planServer(state)
  renderWithProviders(<PlanContent projectId="p1" canEdit />, { language: "en" })
  await screen.findByTitle("Alpha")
}

const chart = () => document.querySelector<HTMLElement>("[data-plan-chart]")!
const setPrefs = (p: Record<string, unknown>) => window.localStorage.setItem(prefsKey("p1"), JSON.stringify(p))
/** matchMedia where only the queries containing one of `widths` match (e.g. "1023" = tablet). */
function stubMedia(...widths: string[]) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: widths.some((w) => query.includes(w)),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  state = freshState()
  chartWidth = 1200
  installMemoryStorage()
  stubMatchMedia(false)
  resetUrl("/projects/p1/plan")
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-plan-chart") ? chartWidth : 0
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("N-01 row menu", () => {
  it("is portaled out of the chart scroll box and flips above a button near the viewport bottom", async () => {
    const user = userEvent.setup()
    await renderPlan()
    const button = screen.getByRole("button", { name: t.planMenuLabel.replace("{name}", "Launch") })
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ top: 700, bottom: 728, left: 300, right: 328, width: 28, height: 28, x: 300, y: 700, toJSON: () => ({}) })
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "menu" ? 330 : 0
    })
    await user.click(button)
    const menu = screen.getByRole("menu", { name: t.planMenuLabel.replace("{name}", "Launch") })
    expect(menu.closest("[data-plan-chart]")).toBeNull()
    expect(menu.parentElement).toBe(document.body)
    // 768px jsdom viewport: 36px below the button is too little → the menu opens upward
    await waitFor(() => expect(menu.style.top).toBe(`${700 - 4 - 330}px`))
    expect(menu.style.position).toBe("fixed")
    expect(within(menu).getByRole("menuitem", { name: t.delete })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })
})

describe("N-02 / N-04 today and count pills", () => {
  it("shows a distinct 'Today' pill in the header band when today is off-screen; a click scrolls to today", async () => {
    const user = userEvent.setup()
    await renderPlan()
    const box = chart()
    let left = 900
    Object.defineProperty(box, "scrollLeft", { configurable: true, get: () => left, set: (v: number) => (left = v) })
    fireEvent.scroll(box)
    const pill = await screen.findByRole("button", { name: /^Today \(.+\) is before the visible period/ })
    expect(pill).toHaveTextContent(t.planToday)
    expect(pill).toHaveAttribute("data-plan-today-pill", "before")
    expect(pill).not.toHaveAttribute("data-plan-offscreen")
    // placed in the scale header band (never over bar labels)
    const top = parseFloat((pill.parentElement as HTMLElement).style.top)
    expect(top).toBeGreaterThan(0)
    expect(top + 22).toBeLessThanOrEqual(HEADER_HEIGHT + 1)
    const count = screen.getByRole("button", { name: /before the visible period\. Click to show$/ })
    expect(count.parentElement).toBe(pill.parentElement)
    await user.click(pill)
    expect(left).toBeLessThan(100)
    fireEvent.scroll(box)
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Today \(/ })).not.toBeInTheDocument())
  })
})

describe("F-10 sticky grid cell", () => {
  it("is a full row tall with its own bottom border (covers the row border line)", async () => {
    await renderPlan()
    const cell = document.querySelector<HTMLElement>('[data-plan-row="A1"] [data-plan-grid-cell]')!
    expect(cell.style.height).toBe(`${ROW_HEIGHT}px`)
    expect(cell.className).toMatch(/\bsticky\b/)
    expect(cell.className).toMatch(/\bborder-b\b/)
    expect(cell.className).toMatch(/\bbg-surface\b/)
  })
})

describe("N-03 / N-08 / F-07 grid width", () => {
  it("N-03: columns that do not fit next to a 160px name are left out and marked in the column menu", async () => {
    const user = userEvent.setup()
    chartWidth = 900
    setPrefs({ columns: [...PLAN_COLUMNS] })
    await renderPlan()
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent)
    expect(headers).toContain(t.planColPeriod)
    expect(headers).not.toContain(t.planColDuration)
    expect(parseFloat(screen.getAllByRole("columnheader")[0].style.width)).toBeGreaterThanOrEqual(160)
    await user.click(screen.getByRole("button", { name: t.planColumnsMenu }))
    const duration = screen.getByRole("checkbox", { name: new RegExp(t.planColDuration) })
    expect(duration).toBeChecked()
    expect(duration).toHaveAccessibleDescription(t.planColumnHiddenNarrow)
    expect(screen.getByRole("checkbox", { name: new RegExp(t.planColPeriod) })).not.toHaveAccessibleDescription()
  })

  it("N-08: below lg the default grid is name + progress", async () => {
    stubMedia("1023")
    await renderPlan()
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent)
    expect(headers).toContain(t.planColProgress)
    expect(headers).not.toContain(t.planColPeriod)
  })

  it("F-07: phones switch between names first and timeline first (persisted)", async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    chartWidth = 343
    await renderPlan()
    const group = screen.getByRole("group", { name: t.planPhoneLayoutLabel })
    expect(within(group).getByRole("button", { name: t.planPhoneTimelineFirst })).toHaveAttribute("aria-pressed", "true")
    const nameHeader = () => parseFloat(screen.getAllByRole("columnheader")[0].style.width)
    expect(nameHeader()).toBe(180)
    await user.click(within(group).getByRole("button", { name: t.planPhoneNamesFirst }))
    await waitFor(() => expect(nameHeader()).toBe(343 - PHONE_TIMELINE_PEEK))
    expect(screen.queryByRole("separator", { name: t.planSplitterLabel })).not.toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(prefsKey("p1"))!).phoneLayout).toBe("names")
  })
})
