import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { renderWithProviders } from "@/components/__tests__/helpers"
import type { PortfolioDto, PortfolioRow } from "@/services/portfolio/portfolio.types"

vi.mock("next/navigation", async () => {
  const nav = await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")
  return {
    useSearchParams: nav.useSearchParamsMock,
    usePathname: nav.usePathnameMock,
    useRouter: () => ({ replace: (url: string) => window.history.replaceState(null, "", url), push: () => {} }),
  }
})

const { resetUrl } = await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")
const { PortfolioView } = await import("../portfolio-view")

const t = getTranslations("en")

const row = (id: string, name: string, over: Partial<PortfolioRow> = {}): PortfolioRow => ({
  id,
  name,
  i18n: {},
  status: "active",
  sections: [],
  activeSprint: null,
  overdueTasks: 0,
  openPbis: 3,
  openPoints: 8,
  velocity: [],
  velocityTrend: null,
  surveillance: null,
  plan: { progressPct: null, delayed: 0, atRisk: 0, total: 0 },
  lastActivityAt: null,
  needsAttention: false,
  ...over,
})

const DATA: PortfolioDto = {
  asOf: "2026-10-06T03:00:00.000Z",
  scope: "sections",
  capped: false,
  sections: [{ id: "s1", name: "Design" }],
  rows: [
    row("a", "Alpha", {
      sections: [{ id: "s1", name: "Design" }],
      activeSprint: {
        id: "sp", name: "Sprint 5", i18n: {}, endDate: "2026-10-10T00:00:00.000Z", daysLeft: 4, tasksDone: 1, tasksTotal: 4,
        progressPct: 25, donePoints: 3, plannedPoints: 8, burn: [4, 3, 3],
      },
      velocity: [5, 6, 9],
      velocityTrend: "up",
      plan: { progressPct: 40, delayed: 0, atRisk: 1, total: 4 },
    }),
    row("b", "Beta", { overdueTasks: 5, needsAttention: true, surveillance: { severity: "critical", at: "2026-10-05T00:00:00.000Z" } }),
    row("c", "Gamma", { status: "archived" }),
  ],
}

function bodyRows(): string[] {
  const table = screen.getByRole("table", { name: t.portfolioTableCaption })
  return within(table).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("link")[0].textContent ?? "")
}

beforeEach(() => resetUrl("/portfolio"))

describe("PortfolioView", () => {
  it("shows the KPI strip and one row per project, most overdue first", () => {
    renderWithProviders(<PortfolioView data={DATA} />)
    expect(screen.getByRole("heading", { level: 1, name: t.portfolioTitle })).toBeInTheDocument()
    expect(screen.getByText(t.portfolioScopeSections)).toBeInTheDocument()
    const attention = screen.getByRole("button", { name: new RegExp(t.portfolioKpiAttention) })
    expect(attention).toHaveTextContent("1")
    expect(bodyRows()).toEqual(["Beta", "Alpha", "Gamma"])
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/a")
    expect(screen.getByText("4 days left")).toBeInTheDocument()
    expect(screen.getByText("Done 3 / 8 pt")).toBeInTheDocument()
    expect(screen.getAllByText(`${t.portfolioBurndownLabel}: 4 → 3 → 3`).length).toBeGreaterThan(0)
    expect(screen.getByText("1 at risk")).toBeInTheDocument()
    expect(screen.getByText(t.portfolioSeverityCritical)).toBeInTheDocument()
  })

  it("sorts by a column header and reflects it in aria-sort and the URL", async () => {
    renderWithProviders(<PortfolioView data={DATA} />)
    const header = screen.getByRole("columnheader", { name: new RegExp(t.portfolioColProject) })
    await userEvent.click(within(header).getByRole("button"))
    expect(header).toHaveAttribute("aria-sort", "ascending")
    expect(bodyRows()).toEqual(["Alpha", "Beta", "Gamma"])
    expect(window.location.search).toBe("?sort=name&dir=asc")
    await userEvent.click(within(header).getByRole("button"))
    expect(bodyRows()).toEqual(["Gamma", "Beta", "Alpha"])
  })

  it("filters by attention, section and status, with a clear action", async () => {
    renderWithProviders(<PortfolioView data={DATA} />)
    await userEvent.click(screen.getByRole("button", { name: t.portfolioAttentionOnly }))
    expect(bodyRows()).toEqual(["Beta"])
    expect(window.location.search).toBe("?attention=1")
    expect(screen.getByText("Showing 1 of 3")).toHaveAttribute("role", "status")

    await userEvent.click(screen.getByRole("button", { name: t.portfolioFilterClear }))
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.portfolioFilterSection }), "s1")
    expect(bodyRows()).toEqual(["Alpha"])
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.portfolioFilterSection }), "none")
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.portfolioFilterStatus }), "archived")
    expect(bodyRows()).toEqual(["Gamma"])
  })

  it("starts from the URL and shows an empty state when nothing matches", async () => {
    resetUrl("/portfolio?section=s1&attention=1")
    renderWithProviders(<PortfolioView data={DATA} />)
    expect(screen.getByText(t.portfolioEmptyFiltered)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole("button", { name: t.portfolioFilterClear }).at(-1)!)
    expect(bodyRows()).toHaveLength(3)
  })

  it("explains an empty portfolio and a capped list", () => {
    const { unmount } = renderWithProviders(<PortfolioView data={{ ...DATA, rows: [] }} />)
    expect(screen.getByText(t.portfolioEmpty)).toBeInTheDocument()
    unmount()
    renderWithProviders(<PortfolioView data={{ ...DATA, capped: true }} />)
    expect(screen.getByRole("note")).toHaveTextContent("first 3 projects")
  })
})
