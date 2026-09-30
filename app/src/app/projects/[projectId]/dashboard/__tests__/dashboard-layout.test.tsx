import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders } from "@/app/__tests__/test-utils"

// Layout only: the widgets themselves are covered by their own tests.
function stub(name: string) {
  return function Stub() {
    return <div data-testid={name} />
  }
}
vi.mock("@/components/ai-reports-panel", () => ({ default: stub("ai") }))
vi.mock("../active-sprint-card", () => ({ ActiveSprintCard: stub("sprint") }))
vi.mock("../activity-feed", () => ({ ActivityFeed: stub("feed") }))
vi.mock("../attachments-section", () => ({ AttachmentsSection: stub("attachments") }))
vi.mock("../dashboard-header", () => ({ DashboardHeader: stub("header") }))
vi.mock("../description-editor", () => ({ DescriptionEditor: stub("description") }))
vi.mock("../my-project-tasks", () => ({ MyProjectTasks: stub("my-tasks") }))
vi.mock("../overview-cards", () => ({ OverviewCards: stub("overview") }))
vi.mock("../product-goals", () => ({ ProductGoals: stub("goals") }))
vi.mock("../progress-editor", () => ({ ProgressEditor: stub("progress") }))
vi.mock("../upcoming-due", () => ({ UpcomingDue: stub("due") }))

const { DashboardContent } = await import("../../dashboard-content")

function renderDashboard() {
  renderWithProviders(
    <DashboardContent projectId="p1" projectName="A very long project name" projectDescription={null}
      productGoals={[]} folders={[]} attachments={[]} iceboxCount={0} backlogCount={0} sprintCount={0}
      projectProgressPct={0} currentUserRole="dev" activeSprint={null} />,
  )
}

describe("dashboard grid on phones (P-17)", () => {
  it.each(["dashboard-row-now", "dashboard-row-feed"])("%s uses a shrinkable single column below lg", (rowId) => {
    renderDashboard()
    const row = screen.getByTestId(rowId)
    // grid-cols-1 = minmax(0, 1fr): a long name can no longer widen the column past the viewport.
    expect(row).toHaveClass("grid", "grid-cols-1", "lg:grid-cols-12")
    for (const cell of Array.from(row.children)) expect(cell).toHaveClass("min-w-0")
  })

  it("keeps the sprint card, my tasks and due items inside the first row", () => {
    renderDashboard()
    const row = screen.getByTestId("dashboard-row-now")
    for (const id of ["sprint", "my-tasks", "due"]) expect(row).toContainElement(screen.getByTestId(id))
  })
})
