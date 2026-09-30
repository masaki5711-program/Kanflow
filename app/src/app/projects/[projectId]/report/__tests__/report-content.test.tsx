import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import type { Language } from "@/lib/i18n"
import { ReportContent } from "../report-content"
import type { BacklogItem, Sprint, SprintItem } from "../types"

vi.mock("@/components/burndown-chart", () => ({ default: ({ projectId }: { projectId: string }) => <div data-testid="burndown">{projectId}</div> }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

const DAY = 86_400_000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()

function task(p: Partial<SprintItem> & { id: string }): SprintItem {
  return {
    taskName: `task-${p.id}`, assignee: null, estimatedHours: null, actualHours: null, status: "todo",
    pbItem: { id: "pb1", displayId: 11, initiative: "Initiative One", epic: "Epic", userStory: null, workloadScore: 5 },
    ...p,
  }
}

function sprint(p: Partial<Sprint> & { id: string; status: string }): Sprint {
  return {
    sprintName: `Sprint ${p.id}`, startDate: iso(-5), endDate: iso(5), sprintGoal: null,
    capacity: 20, actualScore: 10, reviewComment: null, retrospectiveMemo: null,
    retrospectiveKeep: null, retrospectiveProblem: null, retrospectiveTry: null, items: [],
    ...p,
  }
}

const sprints: Sprint[] = [
  sprint({
    id: "act", status: "active", sprintGoal: "Ship it",
    i18n: { sprintName: { ja: "スプリント現在", id: "Sprint Kini", source: "ja", status: "done" } },
    items: [
      task({ id: "t1", status: "done", assignee: "Ann", estimatedHours: 3, actualHours: 4 }),
      task({ id: "t2", status: "in_progress", estimatedHours: 2 }),
      task({ id: "t3", pbItem: { id: "pb2", displayId: 12, initiative: null, epic: null, userStory: "As a user", workloadScore: 3 }, status: "done" }),
      task({ id: "t4", taskName: null }),
    ],
  }),
  sprint({ id: "rev", status: "review", endDate: iso(-3), startDate: iso(-17), capacity: 0, actualScore: 0 }),
  sprint({ id: "plan", status: "planning", startDate: iso(10), endDate: iso(24), sprintGoal: "Next goal" }),
  sprint({
    id: "done1", status: "done", startDate: iso(-40), endDate: iso(-26), capacity: 10, actualScore: 12,
    reviewComment: "Old review", retrospectiveKeep: "Keep this", retrospectiveProblem: "Problem that", retrospectiveTry: "Try more",
    retrospectiveMemo: "Other memo",
  }),
  sprint({ id: "arch", status: "archived", startDate: iso(-60), endDate: iso(-46), capacity: 10, actualScore: 7 }),
]

const backlog: BacklogItem[] = [
  { displayId: 1, initiative: "Ready A", epic: null, userStory: "Story A", workloadScore: 3, status: "ready", assignedPo: null, completedAt: null, productGoalTitle: "Goal X" },
  { displayId: 2, initiative: null, epic: "E", userStory: null, workloadScore: 2, status: "not_ready", assignedPo: null, completedAt: null, productGoalTitle: null },
  { displayId: 3, initiative: "Done C", epic: null, userStory: null, workloadScore: 8, status: "completed", assignedPo: null, completedAt: "2026-01-02T12:00:00Z", productGoalTitle: null },
]

function renderReport(language: Language = "en", overrides: Partial<React.ComponentProps<typeof ReportContent>> = {}) {
  return renderWithProviders(
    <ReportContent
      projectId="p1"
      projectName="Kanflow"
      projectDescription="The description"
      projectI18n={{ name: { ja: "カンフロー", id: "Kanflow ID", source: "ja", status: "done" } }}
      language={language}
      pointUnit="SP"
      members={[
        { id: "u1", name: "Paula", email: "p@x", role: "po" },
        { id: "u2", name: "Dev Dan", email: "d@x", role: "dev" },
        { id: "u3", name: "Odd", email: "o@x", role: "guest" },
      ]}
      productGoals={[{ id: "g1", title: "Goal X", description: "Goal desc" }, { id: "g2", title: "Goal Y", description: null }]}
      sprints={sprints}
      backlogItems={backlog}
      backlogSummary={{ ready: 1, notReady: 1, completed: 1, totalReadyWorkload: 3 }}
      icebox={{ unreviewed: 4, reviewed: 5, frozen: 6 }}
      events={[
        { id: "e1", title: "Demo", description: "Show", date: iso(2), endDate: null, color: "green" },
        { id: "e2", title: "Odd colour", description: null, date: iso(3), endDate: null, color: "teal" },
      ]}
      {...overrides}
    />,
    { language },
  )
}

describe("ReportContent", () => {
  afterEach(() => vi.restoreAllMocks())

  it("renders the header, overview, members and goals", () => {
    const t = tr("en")
    renderReport()
    expect(screen.getByRole("heading", { level: 1, name: t.reportTitle })).toBeInTheDocument()
    // en viewer → original (non ja/id locale)
    expect(screen.getByRole("heading", { level: 2, name: "Kanflow" })).toBeInTheDocument()
    expect(screen.getByText("The description")).toBeInTheDocument()
    expect(screen.getByText("PO")).toBeInTheDocument()
    expect(screen.getByText("Dev")).toBeInTheDocument()
    expect(screen.getByText("guest")).toBeInTheDocument()
    expect(screen.getByText(/Goal desc/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: new RegExp(t.back) })).toHaveAttribute("href", "/projects/p1")
    expect(screen.getByTestId("burndown")).toHaveTextContent("p1")
  })

  it("shows now-snapshot cards with remaining and overdue days", () => {
    const t = tr("en")
    renderReport()
    const nowSection = screen.getByRole("heading", { level: 3, name: t.reportSectionNow }).closest("section") as HTMLElement
    expect(within(nowSection).getByText(t.reportDaysRemaining)).toBeInTheDocument()
    expect(within(nowSection).getByText(t.reportDaysOverdue)).toBeInTheDocument()
    expect(within(nowSection).getByText("Ship it")).toBeInTheDocument()
    // 2 of 4 tasks done
    expect(within(nowSection).getByText("2/4")).toBeInTheDocument()
  })

  it("summary table groups sprints, averages past scores and signs the diff", () => {
    const t = tr("en")
    renderReport()
    expect(screen.getByText(t.reportSprintCount.replace("{n}", "2"), { exact: false })).toBeInTheDocument()
    // (12 + 7) / 2 = 9.5 → 10
    const avg = screen.getByText(t.settingsAvgScore, { exact: false })
    expect(within(avg).getByText("10")).toBeInTheDocument()
    const table = screen.getByRole("columnheader", { name: t.colSprint }).closest("table") as HTMLElement
    expect(within(table).getByText(`${t.reportSectionNow} (2)`)).toBeInTheDocument()
    expect(within(table).getByText(`${t.reportSectionUpcoming} (1)`)).toBeInTheDocument()
    expect(within(table).getByText(`${t.reportSectionHistory} (2)`)).toBeInTheDocument()
    expect(within(table).getByText("+2")).toHaveClass("text-green-800")
    expect(within(table).getByText("-3")).toHaveClass("text-red-700")
    expect(within(table).getByText("120%")).toBeInTheDocument()
  })

  it("renders sprint details: PBI grouping, task totals, retro notes", () => {
    const t = tr("en")
    renderReport()
    expect(screen.getAllByText("#11").length).toBeGreaterThan(0)
    expect(screen.getAllByText("As a user").length).toBeGreaterThan(0)
    // PBI #11 has 3 tasks → totals row est 5 / act 4
    expect(screen.getAllByText("Ann").length).toBeGreaterThan(0)
    expect(screen.getByText(`${t.sprintReviewComment} ${t.reportLegacy}:`)).toBeInTheDocument()
    expect(screen.getByText("Keep this")).toBeInTheDocument()
    expect(screen.getByText("Problem that")).toBeInTheDocument()
    expect(screen.getByText("Try more")).toBeInTheDocument()
    expect(screen.getByText("Other memo")).toBeInTheDocument()
    expect(screen.getByText(/Next goal/)).toBeInTheDocument()
  })

  it("renders backlog tables per status with completed date column only when needed", () => {
    const t = tr("en")
    renderReport()
    expect(screen.getByText(`${t.reportReadyItems} (1${t.reportItems})`)).toBeInTheDocument()
    expect(screen.getByText(`${t.reportNotReadyItems} (1${t.reportItems})`)).toBeInTheDocument()
    expect(screen.getByText(`${t.reportCompletedItems} (1${t.reportItems})`)).toBeInTheDocument()
    expect(screen.getAllByRole("columnheader", { name: t.backlogCompletedDate })).toHaveLength(1)
    expect(screen.getByText("Story A")).toHaveAttribute("title", "Story A")
  })

  it("renders icebox counts and events (unknown colour falls back)", () => {
    const t = tr("en")
    renderReport()
    expect(screen.getByText(t.iceboxStatusUnreviewed).nextSibling).toHaveTextContent("4")
    expect(screen.getByText(t.iceboxStatusReviewed).nextSibling).toHaveTextContent("5")
    expect(screen.getByText(t.iceboxStatusFrozen).nextSibling).toHaveTextContent("6")
    expect(screen.getByText("Demo")).toBeInTheDocument()
    expect(screen.getByText(/— Show/)).toBeInTheDocument()
    expect(screen.getByText("Odd colour")).toBeInTheDocument()
  })

  it("shows empty states when there are no sprints and no events", () => {
    const t = tr("en")
    renderReport("en", { sprints: [], events: [], backlogItems: [], productGoals: [], projectDescription: null })
    expect(screen.getByText(t.reportNoCurrentSprint)).toBeInTheDocument()
    expect(screen.getByText(t.sprintNoSprints)).toBeInTheDocument()
    expect(screen.getByText(t.reportNoEvents)).toBeInTheDocument()
    expect(screen.queryByText(t.settingsAvgScore, { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByText(t.reportSectionHistory)).not.toBeInTheDocument()
  })

  it("print button calls window.print and print events expand/restore <details>", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    const t = tr("en")
    const { container } = renderReport()
    await userEvent.click(screen.getByRole("button", { name: t.reportPrint }))
    expect(print).toHaveBeenCalled()

    const details = Array.from(container.querySelectorAll("details"))
    expect(details).toHaveLength(2)
    details[1].open = true
    fireEvent(window, new Event("beforeprint"))
    expect(details.every((d) => d.open)).toBe(true)
    fireEvent(window, new Event("afterprint"))
    expect(details[0].open).toBe(false)
    expect(details[1].open).toBe(true)
  })

  it.each(["ja", "id"] as const)("uses the %s translations and picks the viewer-locale project name", (lang) => {
    const t = tr(lang)
    renderReport(lang)
    expect(screen.getByRole("heading", { level: 1, name: t.reportTitle })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: lang === "ja" ? "カンフロー" : "Kanflow ID" })).toBeInTheDocument()
    expect(screen.getAllByText(lang === "ja" ? "スプリント現在" : "Sprint Kini").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: t.reportPrint })).toBeInTheDocument()
    expect(screen.getAllByText(t.sprintStatusActive).length).toBeGreaterThan(0)
  })
})
