import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"

const chartProps = vi.fn()
vi.mock("@/components/burndown-chart", () => ({
  default: (props: { projectId: string; refreshable?: boolean; sprintId?: string | null }) => {
    chartProps(props)
    return <div data-testid="chart">{props.sprintId ?? "all"}</div>
  },
}))
vi.mock("@/components/burndown/velocity-chart", () => ({
  default: ({ projectId }: { projectId: string }) => <div data-testid="velocity">{projectId}</div>,
}))

const { BurndownPageContent, defaultSprintSelection } = await import("./burndown-content")
const t = getTranslations("ja")

const sprints = [
  { id: "s3", name: "Sprint 3", status: "active" },
  { id: "s2", name: "Sprint 2", status: "done" },
  { id: "s1", name: "Sprint 1", status: "weird" },
]

describe("BurndownPageContent", () => {
  it("defaults to the active sprint and renders velocity below", () => {
    render(<BurndownPageContent projectId="p1" sprints={sprints} />)
    expect(screen.getByRole("heading", { level: 1, name: t.burndownPageTitle })).toBeInTheDocument()
    expect(chartProps).toHaveBeenLastCalledWith({ projectId: "p1", sprintId: "s3", refreshable: true })
    expect(screen.getByTestId("velocity")).toHaveTextContent("p1")
    const select = screen.getByRole("combobox", { name: t.burndownSprintSelect }) as HTMLSelectElement
    expect(select.value).toBe("s3")
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      t.burndownSprintAll,
      `Sprint 3 · ${t.sprintStatusActive}`,
      `Sprint 2 · ${t.sprintStatusDone}`,
      "Sprint 1 · weird",
    ])
  })

  it("switches the chart to another sprint or the whole project", async () => {
    const user = userEvent.setup()
    render(<BurndownPageContent projectId="p1" sprints={sprints} />)
    const select = screen.getByRole("combobox", { name: t.burndownSprintSelect })
    await user.selectOptions(select, "s2")
    expect(screen.getByTestId("chart")).toHaveTextContent("s2")
    await user.selectOptions(select, "")
    expect(screen.getByTestId("chart")).toHaveTextContent("all")
    expect(chartProps).toHaveBeenLastCalledWith({ projectId: "p1", sprintId: null, refreshable: true })
  })

  it("falls back to the whole project without an active sprint", () => {
    expect(defaultSprintSelection([{ id: "a", name: "A", status: "done" }])).toBe("")
    expect(defaultSprintSelection([])).toBe("")
  })
})
