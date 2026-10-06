import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import type { PoHomeSummary } from "@/services/projects/po-home-summary.types"
import { buildHomeKpis } from "../home-kpi-tiles"

// The home messages block refreshes the (server) page on live notifications.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/fixed-tasks-modal", () => ({ default: () => null }))
vi.mock("../../project-list", () => ({ ProjectList: () => <div data-testid="project-list" /> }))

const { TopPage } = await import("../../top-page")

const t = tr("ja")
const po = (over: Partial<PoHomeSummary> = {}): PoHomeSummary => ({
  singleProjectId: "p1",
  notReady: 6,
  inReview: 0,
  activeSprints: 1,
  totalTasks: 4,
  doneTasks: 1,
  ...over,
})
const noTasks = { open: 0, overdue: 0, dueThisWeek: 0 }

describe("A3-16 buildHomeKpis", () => {
  it("PO: refinement + current sprint completion; review only when a sprint waits; no zero task tiles", () => {
    const m = buildHomeKpis(po(), noTasks, t)
    expect(m.hint).toBeNull()
    expect(m.tiles.map((x) => [x.key, x.value])).toEqual([
      ["refinement", "6"],
      ["completion", "25%"],
    ])
    expect(m.tiles[0].href).toBe("/projects/p1/backlog?status=not_ready")
    expect(m.tiles[1].note).toBe(t.topKpiTasksDone.replace("{done}", "1").replace("{total}", "4"))
    const withReview = buildHomeKpis(po({ inReview: 2 }), noTasks, t)
    expect(withReview.tiles.map((x) => x.key)).toEqual(["refinement", "review", "completion"])
  })

  it("PO without a running sprint gets a hint instead of 0%; several projects → no links", () => {
    const m = buildHomeKpis(po({ activeSprints: 0, totalTasks: 0, doneTasks: 0, singleProjectId: null }), noTasks, t)
    const completion = m.tiles.find((x) => x.key === "completion")!
    expect(completion.value).toBe("—")
    expect(completion.note).toBe(t.topKpiNoActiveSprint)
    expect(m.tiles.every((x) => !x.href)).toBe(true)
  })

  it("PO who also has tasks keeps open (and overdue) task counts", () => {
    const m = buildHomeKpis(po(), { open: 3, overdue: 1, dueThisWeek: 0 }, t)
    expect(m.tiles.map((x) => x.key)).toEqual(["refinement", "completion", "open", "overdue"])
    expect(m.tiles.find((x) => x.key === "overdue")?.alert).toBe(true)
  })

  it("developers keep the three task counters; no tasks → a hint instead of 0 / 0 / 0", () => {
    expect(buildHomeKpis(null, { open: 2, overdue: 0, dueThisWeek: 1 }, t).tiles.map((x) => x.key)).toEqual(["open", "overdue", "dueThisWeek"])
    expect(buildHomeKpis(null, noTasks, t)).toEqual({ tiles: [], hint: t.topKpiNoTasksHint })
  })
})

describe("A3-16 TopPage hero", () => {
  it("shows the PO tiles with links into the project", () => {
    renderWithProviders(<TopPage activeProjects={[]} archivedCount={0} categories={[]} isAdmin={false} myTasks={[]} userName="PO" poSummary={po({ inReview: 1 })} />)
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!
    expect(within(hero).getAllByRole("definition")).toHaveLength(3)
    expect(within(hero).getByRole("link", { name: `${t.topKpiRefinement}: 6` })).toHaveAttribute("href", "/projects/p1/backlog?status=not_ready")
    expect(within(hero).getByRole("link", { name: `${t.topKpiReview}: 1` })).toHaveAttribute("href", "/projects/p1/sprints")
    expect(within(hero).queryByText(t.topKpiOpen)).not.toBeInTheDocument()
  })

  it("a user without tasks and PO role sees a hint, not three zeros", () => {
    renderWithProviders(<TopPage activeProjects={[]} archivedCount={0} categories={[]} isAdmin={false} myTasks={[]} userName="Dev" />)
    expect(screen.queryAllByRole("definition")).toHaveLength(0)
    expect(screen.getByTestId("kpi-hint")).toHaveTextContent(t.topKpiNoTasksHint)
  })
})
