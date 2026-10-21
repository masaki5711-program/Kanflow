import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, t } from "./helpers"
import SprintCreateForm from "../components/sprint-create-form"
import type { CarryOverSource } from "../lib/sprint-metrics"
import type { ReadyPbItem, Sprint } from "../components/types"

const settings = { defaultCapacity: 10, sprintDurationDays: 7, pointUnit: "SP", pointDescription: null }

const pbi = (id: string, displayId: number, initiative: string, workloadScore: number) =>
  ({ id, displayId, initiative, epic: null, userStory: null, workloadScore, status: "ready" }) as unknown as ReadyPbItem

const source: CarryOverSource = {
  sprint: { id: "s0", sprintName: "Sprint 0", i18n: {} } as unknown as Sprint,
  candidates: [
    { pbItem: pbi("a", 1, "Login page", 3), openTasks: 2 },
    { pbItem: pbi("c", 3, "Reports", 2), openTasks: 0 },
  ],
}

// "a" is unfinished in Sprint 0 and also Ready in the backlog; "b" is only Ready.
const ready = [pbi("a", 1, "Login page", 3), pbi("b", 2, "Search", 5)]

function renderForm(carryOverSource: CarryOverSource | null = source) {
  const onCreate = vi.fn(async () => true)
  renderWithProviders(
    <SprintCreateForm readyPbItems={ready} carryOverSource={carryOverSource} settings={settings} pointUnitLabel="SP"
      avgActual={null} doneSprintCount={0} onCreate={onCreate} onClose={vi.fn()} onViewPbi={vi.fn()} />,
  )
  return onCreate
}

const submitLabel = (count: number) => t.sprintCreateWithCount.replace("{count}", String(count))

describe("SprintCreateForm carry-over", () => {
  it("offers the previous sprint's unfinished PBIs ticked, and sends them with the sprint", async () => {
    const onCreate = renderForm()
    expect(screen.getByText(t.sprintCarryOver)).toBeInTheDocument()
    // Carried PBIs are not listed a second time in the backlog list.
    expect(screen.getAllByText("Login page")).toHaveLength(1)
    expect(screen.getByText("Search")).toBeInTheDocument()

    await userEvent.type(screen.getAllByRole("textbox")[0], "Sprint 1")
    await userEvent.click(screen.getByRole("button", { name: submitLabel(2) }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      sprintName: "Sprint 1",
      selectedPbIds: [],
      carryOver: { fromSprintId: "s0", pbItemIds: ["a", "c"] },
    }))
  })

  it("leaves an unticked PBI out of the carry-over and offers it in the backlog list again", async () => {
    const onCreate = renderForm()
    await userEvent.click(screen.getByRole("checkbox", { name: /Login page/ }))
    expect(screen.getAllByText("Login page")).toHaveLength(2)

    await userEvent.type(screen.getAllByRole("textbox")[0], "Sprint 1")
    await userEvent.click(screen.getByRole("button", { name: submitLabel(1) }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ carryOver: { fromSprintId: "s0", pbItemIds: ["c"] } }))
  })

  it("shows no carry-over section and sends none when nothing is left over", async () => {
    const onCreate = renderForm(null)
    expect(screen.queryByText(t.sprintCarryOver)).not.toBeInTheDocument()
    await userEvent.type(screen.getAllByRole("textbox")[0], "Sprint 1")
    await userEvent.click(screen.getByRole("button", { name: submitLabel(0) }))
    expect(onCreate.mock.calls[0]).not.toHaveProperty("0.carryOver")
  })
})
