import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { resetUrl } from "@/app/projects/[projectId]/backlog/__tests__/nav-mock"
import { PlanContent } from "../plan-content"
import { NAME_COLUMN_WIDTH } from "../lib/filter"
import { prefsKey } from "../lib/prefs"
import { freshState, planServer, stubMatchMedia, type ServerState } from "./plan-server"
import { installMemoryStorage } from "./fixtures"

vi.mock("next/navigation", async () => (await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

stubLayout()
const t = tr("en")
let state: ServerState
const CHART_WIDTH = 900

async function renderPlan() {
  const fetchMock = planServer(state)
  renderWithProviders(<PlanContent projectId="p1" canEdit />, { language: "en" })
  await screen.findByTitle("Alpha")
  return fetchMock
}

const chart = () => document.querySelector<HTMLElement>("[data-plan-chart]")!
const prefs = () => JSON.parse(window.localStorage.getItem(prefsKey("p1")) ?? "{}") as Record<string, unknown>

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
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("F-01 splitter", () => {
  it("resizes the name column from the keyboard and persists the width", async () => {
    const user = userEvent.setup()
    await renderPlan()
    const splitter = screen.getByRole("separator", { name: t.planSplitterLabel })
    await waitFor(() => expect(splitter).toHaveAttribute("aria-valuenow", String(NAME_COLUMN_WIDTH)))
    act(() => splitter.focus())
    await user.keyboard("{ArrowRight}")
    expect(splitter).toHaveAttribute("aria-valuenow", String(NAME_COLUMN_WIDTH + 16))
    expect(prefs().nameWidth).toBe(NAME_COLUMN_WIDTH + 16)
    expect(screen.getAllByRole("columnheader")[0]).toHaveStyle({ width: `${NAME_COLUMN_WIDTH + 16}px` })
    await user.keyboard("{End}")
    const max = Number(splitter.getAttribute("aria-valuemax"))
    expect(splitter).toHaveAttribute("aria-valuenow", String(max))
    // the timeline always keeps at least 200px of the chart box
    expect(max).toBeLessThanOrEqual(CHART_WIDTH - 200)
    await user.keyboard("{Home}")
    expect(splitter).toHaveAttribute("aria-valuenow", splitter.getAttribute("aria-valuemin"))
  })

  it("drags with the pointer", async () => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>
    proto.setPointerCapture = vi.fn()
    await renderPlan()
    const splitter = screen.getByRole("separator", { name: t.planSplitterLabel })
    const ptr = (type: string, clientX: number) => fireEvent(splitter, new MouseEvent(type, { bubbles: true, clientX, button: 0 }))
    ptr("pointerdown", 500)
    ptr("pointermove", 560)
    ptr("pointerup", 560)
    expect(prefs().nameWidth).toBe(NAME_COLUMN_WIDTH + 60)
  })

  it("hidden columns can be shown from the column menu (persisted)", async () => {
    const user = userEvent.setup()
    await renderPlan()
    await user.click(screen.getByRole("button", { name: t.planColumnsMenu }))
    expect(screen.getByRole("checkbox", { name: t.planColPeriod })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: t.planColOwner })).not.toBeChecked()
    await user.click(screen.getByRole("checkbox", { name: t.planColOwner }))
    expect(prefs().columns).toEqual(["period", "progress", "owner"])
    expect(within(document.querySelector<HTMLElement>('[data-plan-row="A1"]')!).getByText("Sato")).toBeInTheDocument()
  })
})

describe("F-01 off-screen indicators", () => {
  it("count the bars scrolled out of view and scroll back to the nearest one", async () => {
    const user = userEvent.setup()
    await renderPlan()
    const box = chart()
    let left = 3000
    Object.defineProperty(box, "scrollLeft", { configurable: true, get: () => left, set: (v: number) => (left = v) })
    fireEvent.scroll(box)
    const before = await screen.findByRole("button", { name: t.planOffscreenBefore.replace("{n}", "5") })
    expect(before).toHaveTextContent(t.planOffscreenCount.replace("{n}", "5"))
    expect(screen.queryByRole("button", { name: /after the visible period/ })).not.toBeInTheDocument()
    await user.click(before)
    expect(left).toBeLessThan(3000)
    left = 0
    fireEvent.scroll(box)
    await waitFor(() => expect(screen.queryByRole("button", { name: /before the visible period/ })).not.toBeInTheDocument())
  })
})

describe("F-04 print", () => {
  it("offers visible / whole-plan ranges and prints a page-fitted layout", async () => {
    const user = userEvent.setup()
    await renderPlan()
    let pageCss = ""
    let scaleWidth = 0
    const print = vi.fn(() => {
      pageCss = Array.from(document.querySelectorAll("style")).map((s) => s.textContent).join("")
      // the scale header's inline width = the fitted timeline width
      scaleWidth = parseFloat(document.querySelector<HTMLElement>('[data-plan-chart] [role="columnheader"][aria-label] > div')!.style.width)
    })
    vi.stubGlobal("print", print)
    await user.click(screen.getByRole("button", { name: t.planMoreActions }))
    await user.click(screen.getByRole("menuitem", { name: t.planPrint }))
    const dialog = await screen.findByRole("dialog", { name: t.planPrint })
    expect(within(dialog).getByRole("radio", { name: new RegExp(t.planPrintAll.replace(/[()]/g, "\\$&")) })).toBeChecked()
    expect(within(dialog).getByRole("radio", { name: new RegExp(t.planPrintVisible) })).not.toBeChecked()
    await user.click(within(dialog).getByRole("button", { name: t.planPrintSubmit }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(pageCss).toContain("A4 landscape")
    expect(scaleWidth).toBeGreaterThan(0)
    expect(scaleWidth).toBeLessThanOrEqual(1000)
    act(() => {
      window.dispatchEvent(new Event("afterprint"))
    })
    expect(screen.getByRole("separator", { name: t.planSplitterLabel })).toBeInTheDocument()
    expect(Array.from(document.querySelectorAll("style")).some((s) => s.textContent?.includes("A4 landscape"))).toBe(false)
  })

  it("a browser print (Ctrl+P) switches to the whole-plan layout too", async () => {
    await renderPlan()
    act(() => {
      window.dispatchEvent(new Event("beforeprint"))
    })
    expect(screen.queryByRole("separator", { name: t.planSplitterLabel })).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event("afterprint"))
    })
    expect(screen.getByRole("separator", { name: t.planSplitterLabel })).toBeInTheDocument()
  })
})

describe("row menu and editor details", () => {
  it("F-18: impossible moves are disabled", async () => {
    const user = userEvent.setup()
    await renderPlan()
    await user.click(screen.getByRole("button", { name: t.planMenuLabel.replace("{name}", "Alpha") }))
    expect(screen.getByRole("menuitem", { name: t.planMoveUp })).toBeDisabled()
    expect(screen.getByRole("menuitem", { name: t.planIndent })).toBeDisabled()
    expect(screen.getByRole("menuitem", { name: t.planOutdent })).toBeDisabled()
    expect(screen.getByRole("menuitem", { name: t.planMoveDown })).toBeEnabled()
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: t.planMenuLabel.replace("{name}", "Alpha-2") }))
    expect(screen.getByRole("menuitem", { name: t.planMoveDown })).toBeDisabled()
    expect(screen.getByRole("menuitem", { name: t.planIndent })).toBeEnabled()
    expect(screen.getByRole("menuitem", { name: t.planOutdent })).toBeEnabled()
  })

  it("F-12: switching a leaf without PBIs to 'From PBIs' keeps the status editable with a hint", async () => {
    const user = userEvent.setup()
    await renderPlan()
    await user.click(screen.getByRole("button", { name: t.planMenuLabel.replace("{name}", "Alpha-1") }))
    await user.click(screen.getByRole("menuitem", { name: t.planMenuEdit }))
    const dialog = await screen.findByRole("dialog", { name: t.planEditTitle })
    await user.click(within(dialog).getByRole("radio", { name: t.planProgressLinked }))
    const status = within(dialog).getByLabelText(t.planStatus)
    expect(status.tagName).toBe("SELECT")
    expect(status).toHaveAccessibleDescription(t.planStatusManualHint)
    expect(within(dialog).queryByText(t.planDerivedLinkedHint)).not.toBeInTheDocument()
  })
})
