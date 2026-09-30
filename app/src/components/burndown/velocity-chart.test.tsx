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
    expect([...img.querySelectorAll("tspan")].map((n) => n.textContent)).toContain("Sprint with a long name") // wide slot: one line
    expect(img.querySelectorAll("title")[1].textContent).toBe("Sprint with a long name") // full name on hover
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

  it("shows sprint names in the viewer's language with distinct axis labels (A4-02)", async () => {
    const ja = getTranslations("ja")
    const i18n = (n: number) => ({ sprintName: { ja: `第${n}週スプリント`, id: `Sprint Minggu ke ${n}`, source: "id" as const, status: "done" as const } })
    const sprints = [5, 6, 7, 8].map((n) => ({
      id: `s${n}`, name: `Sprint Minggu ke ${n}`, status: "done", points: n, capacity: 0, endDate: "2026-08-01T00:00:00.000Z", i18n: i18n(n),
    }))
    serve({ pointUnit: "SP", average: 6.5, sprints })
    renderWithProviders(<VelocityChart projectId="p1" />, "ja")
    const table = await screen.findByRole("table", { name: ja.velocityTableCaption })
    const heads = within(table).getAllByRole("rowheader").map((h) => h.textContent)
    expect(heads).toEqual(["第5週スプリント", "第6週スプリント", "第7週スプリント", "第8週スプリント"])
    const img = screen.getByRole("img")
    const labels = [...img.querySelectorAll("text")].filter((n) => n.querySelector("tspan")).map((n) => n.textContent)
    expect(labels).toHaveLength(4)
    expect(new Set(labels).size).toBe(4)
    expect(img.textContent).not.toContain("Minggu")
  })

  it("disambiguates source names that share a long prefix", async () => {
    const sprints = ["Sprint penentuan tema A", "Sprint penentuan tema B"].map((name, i) => ({
      id: `s${i}`, name, status: "done", points: 1, capacity: 0, endDate: "2026-08-01T00:00:00.000Z",
    }))
    serve({ pointUnit: "SP", average: 1, sprints })
    renderWithProviders(<VelocityChart projectId="p1" />)
    const img = await screen.findByRole("img")
    const labels = [...img.querySelectorAll("text")].filter((n) => n.querySelector("tspan")).map((n) => n.textContent)
    expect(labels).toHaveLength(2)
    expect(labels[0]).not.toBe(labels[1])
  })
})
