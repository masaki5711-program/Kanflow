import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { BacklogItemCard } from "../backlog-item-card"
import { pbi } from "./fixtures"

const t = tr("ja")
const noop = vi.fn()
const actions = { onMove: noop, onStatusChange: noop, onEdit: noop, onDelete: noop, onView: noop, onInvest: noop }

describe("BacklogItemCard", () => {
  it("shows epic, goal, icebox chips and a de-duplicated in-sprint badge", () => {
    const item = pbi("a", 1, {
      epic: "Payments",
      productGoal: { id: "g", title: "Grow revenue" },
      iceboxItem: { id: "ib", displayId: 3, request: "Customer asked" },
      userStory: null,
      sprintItems: [
        { sprint: { id: "s1", sprintName: "Sprint 1", status: "active" } },
        { sprint: { id: "s1", sprintName: "Sprint 1", status: "active" } },
        { sprint: { id: "s2", sprintName: "Sprint 2", status: "planning" } },
      ],
    })
    renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" canEdit isFirst isLast={false} {...actions} />
      </ul>,
    )
    expect(screen.getByText(t.backlogInSprintBadge)).toBeInTheDocument()
    expect(screen.getByText("(Sprint 1, Sprint 2)")).toBeInTheDocument()
    expect(screen.getByText("Payments")).toBeInTheDocument()
    expect(screen.getByText("Grow revenue")).toBeInTheDocument()
    expect(screen.getByTitle(t.backlogIceboxChip.replace("{text}", "Customer asked"))).toBeInTheDocument()
    expect(screen.getAllByText(t.sprintNotEntered).length).toBeGreaterThan(0)
  })

  it("renders completed items read-only with a completed badge", () => {
    renderWithProviders(
      <ul>
        <BacklogItemCard item={pbi("c", 9, { status: "completed" })} section="completed" canEdit isFirst isLast {...actions} />
      </ul>,
    )
    expect(screen.getByText(t.backlogStatusCompleted)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.edit })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.backlogMoveUp.replace("{id}", "9") })).not.toBeInTheDocument()
  })
})
