import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import VelocityChart from "./velocity-chart"
import type { VelocityData } from "./velocity-geometry"
import { jsonResponse, renderWithProviders } from "../__tests__/helpers"
import { getTranslations } from "@/lib/i18n"

const t = getTranslations("en")

const DATA: VelocityData = {
  pointUnit: "SP",
  average: 6.5,
  sprints: [
    { id: "s1", name: "Sprint 1", status: "done", points: 5, capacity: 8, endDate: "2026-08-01T00:00:00.000Z" },
    { id: "s2", name: "Sprint with a long name", status: "archived", points: 8, capacity: 0, endDate: "2026-08-15T00:00:00.000Z" },
  ],
}

function serve(body: unknown, status = 200) {
  const fn = vi.fn<(url: RequestInfo | URL) => Promise<Response>>(async () => jsonResponse(body, status))
  vi.stubGlobal("fetch", fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe("VelocityChart", () => {
  it("draws bars with values, the average line and an accessible table", async () => {
    const fetchMock = serve(DATA)
    renderWithProviders(<VelocityChart projectId="p1" />)
    const unit = t.pointUnitSP
    const img = await screen.findByRole("img", {
      name: t.velocityChartLabel.replace("{count}", "2").replace("{average}", `6.5 ${unit}`),
    })
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/projects/p1/velocity")
    expect(screen.getByRole("heading", { name: t.velocityTitle })).toBeInTheDocument()
    expect(screen.getByText(t.velocityAverage.replace("{value}", `6.5 ${unit}`))).toBeInTheDocument()
    expect(within(img).getByText("6.5")).toBeInTheDocument() // average label
    expect(within(img).getAllByText("8").length).toBeGreaterThan(0)
    expect(within(img).getByText("Sprint wi…")).toBeInTheDocument()
    expect(img.querySelectorAll("rect[stroke-dasharray]")).toHaveLength(1) // capacity outline only where capacity > 0
    const table = screen.getByRole("table", { name: t.velocityTableCaption })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([`Sprint 15 ${unit}8`, `Sprint with a long name8 ${unit}0`])
  })

  it("shows the empty state without finished sprints", async () => {
    serve({ sprints: [], average: null, pointUnit: "SP" })
    renderWithProviders(<VelocityChart projectId="p1" />)
    expect(await screen.findByText(t.velocityEmpty)).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })

  it("shows the error when loading fails", async () => {
    serve({ error: "nope" }, 500)
    renderWithProviders(<VelocityChart projectId="p1" />)
    expect(await screen.findByText(t.error)).toBeInTheDocument()
    expect(screen.getAllByText("nope").length).toBeGreaterThan(0)
  })
})
