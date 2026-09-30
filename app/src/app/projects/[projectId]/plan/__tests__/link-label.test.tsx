import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { linkPlanName, linkTitle } from "../components/link-label"
import { PlanLinkSection } from "../components/plan-link-section"
import type { PlanLinksState } from "../hooks/use-plan-links"

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

const ft = (ja: string, id: string, source: "ja" | "id" = "id") => ({ ja, id, source, status: "done" as const })
const LEGACY = "Standarisasi Skema Database PFE\nPFEデータベーススキーマの標準化"

describe("linkTitle / linkPlanName (A4-04)", () => {
  it("shows the translated title in the viewer's language", () => {
    const p = { title: "Pemetaan Kondisi Aktual", i18n: { title: ft("現状の条件マッピング", "Pemetaan Kondisi Aktual") } }
    expect(linkTitle(p, "ja")).toBe("現状の条件マッピング")
    expect(linkTitle(p, "id")).toBe("Pemetaan Kondisi Aktual")
    expect(linkTitle({ title: "Plain" }, "ja")).toBe("Plain")
  })

  it("splits legacy bilingual source text (ID line + JA line) without a translation row", () => {
    expect(linkTitle({ title: LEGACY }, "ja")).toBe("PFEデータベーススキーマの標準化")
    expect(linkTitle({ title: LEGACY }, "id")).toBe("Standarisasi Skema Database PFE")
    // en has no side of its own: both lines, on one line
    expect(linkTitle({ title: LEGACY }, "en")).toBe("Standarisasi Skema Database PFE / PFEデータベーススキーマの標準化")
  })

  it("translates the name of the plan item a PBI is linked to", () => {
    expect(linkPlanName({ name: "Pemetaan", i18n: { name: ft("マッピング", "Pemetaan") } }, "ja")).toBe("マッピング")
  })
})

function state(over: Partial<PlanLinksState> = {}): PlanLinksState {
  return {
    isLoading: false, isSearching: false, selectedIds: [], chosen: [], moving: [], results: [], query: "",
    setQuery: vi.fn(), toggle: vi.fn(), isDirty: false, save: vi.fn(async () => true),
    ...over,
  } as PlanLinksState
}

describe("PlanLinkSection (ja)", () => {
  it("renders candidates, chosen PBIs, their tooltips and the move warning in Japanese", () => {
    const t = tr("ja")
    const results = [
      { id: "b6", displayId: 6, title: LEGACY, status: "ready", points: 1, planItem: { id: "other", name: "Pemetaan", i18n: { name: ft("マッピング", "Pemetaan") } }, i18n: { title: ft("PFEデータベーススキーマの標準化", "Standarisasi Skema Database PFE") } },
      { id: "b7", displayId: 7, title: LEGACY, status: "ready", points: 1, planItem: null },
    ]
    const chosen = [{ id: "b1", displayId: 1, title: "Pemetaan Kondisi Aktual", status: "ready", planItem: null, i18n: { title: ft("現状の条件マッピング", "Pemetaan Kondisi Aktual") } }]
    renderWithProviders(<PlanLinkSection links={state({ results, chosen, selectedIds: ["b1"] })} itemId="leaf" disabled={false} backlogHref="/b" />, { language: "ja" })
    expect(screen.getAllByText("PFEデータベーススキーマの標準化")).toHaveLength(2)
    expect(screen.getByTitle("現状の条件マッピング")).toHaveTextContent("現状の条件マッピング")
    expect(screen.getByText(t.planLinkMoveWarning.replace("{name}", "マッピング"))).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Standarisasi|Pemetaan/)
    for (const el of document.querySelectorAll("[title]")) expect(el.getAttribute("title")).not.toMatch(/Standarisasi|Pemetaan/)
  })
})
