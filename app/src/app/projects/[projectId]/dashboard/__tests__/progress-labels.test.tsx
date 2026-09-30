import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import type { ActiveSprint } from "../types"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const { ProgressEditor } = await import("../progress-editor")
const { ActiveSprintCard } = await import("../active-sprint-card")
const ja = tr("ja")

describe("dashboard progress numbers are labelled (A3-13)", () => {
  it("shows the PO's manual value as 'set by PO' and the computed plan progress beside it", () => {
    renderWithProviders(<ProgressEditor projectId="p1" initialProgress={0} canEdit={false} planProgressPct={2} />)
    expect(screen.getByText(ja.projectProgress)).toBeInTheDocument()
    expect(screen.getByText(ja.dashboardProgressSetByPo)).toBeInTheDocument()
    const plan = screen.getByTestId("dashboard-plan-progress")
    expect(plan).toHaveTextContent(`${ja.dashboardPlanProgress}2%`)
    expect(plan).toHaveTextContent(ja.dashboardPlanProgressHint)
    expect(screen.getByRole("link", { name: ja.dashboardPlanProgress })).toHaveAttribute("href", "/projects/p1/plan")
  })

  it("keeps the 'set by PO' tag for the PO too and says when there is no plan", () => {
    renderWithProviders(<ProgressEditor projectId="p1" initialProgress={40} canEdit planProgressPct={null} />)
    expect(screen.getByText(ja.dashboardProgressSetByPo)).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-plan-progress")).toHaveTextContent(ja.dashboardPlanProgressNone)
  })

  it("hides the plan line when the value is not provided", () => {
    renderWithProviders(<ProgressEditor projectId="p1" initialProgress={40} canEdit={false} />)
    expect(screen.queryByTestId("dashboard-plan-progress")).not.toBeInTheDocument()
  })

  it("names the active sprint's percentage 'sprint completion'", () => {
    const sprint: ActiveSprint = {
      id: "s1", name: "S", goal: null, startDate: "2026-09-01T00:00:00Z", endDate: "2026-09-14T00:00:00Z",
      capacity: 20, taskCounts: { todo: 2, inProgress: 0, done: 1 },
    }
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={sprint} now={new Date(2026, 8, 5)} />)
    expect(screen.getByText(ja.sprintCompletionRate)).toHaveAttribute("title", ja.sprintCompletionRateHint)
    expect(screen.getByRole("progressbar", { name: ja.sprintCompletionRate })).toHaveAttribute("aria-valuenow", "33")
  })
})
