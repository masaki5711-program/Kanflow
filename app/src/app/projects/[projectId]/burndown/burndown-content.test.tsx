import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"

const chartProps = vi.fn()
const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }))
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  const listeners = new Set<() => void>()
  nav.replace.mockImplementation((url: string) => {
    nav.search = url.split("?")[1] ?? ""
    listeners.forEach((l) => l())
  })
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  return {
    useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/projects/p1/burndown",
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => nav.search)),
  }
})
vi.mock("@/components/burndown-chart", () => ({
  default: (props: { projectId: string; refreshable?: boolean; sprintId?: string | null }) => {
    chartProps(props)
    return <div data-testid="chart">{props.sprintId ?? "all"}</div>
  },
}))
vi.mock("@/components/burndown/velocity-chart", () => ({
  default: ({ projectId }: { projectId: string }) => <div data-testid="velocity">{projectId}</div>,
}))

const { BurndownPageContent, defaultSprintSelection, splitArchived, sprintSelectionFromParam } = await import("./burndown-content")
const t = getTranslations("ja")

const sprints = [
  { id: "s3", name: "Sprint 3", status: "active" },
  { id: "s2", name: "Sprint 2", status: "done" },
  { id: "s1", name: "Sprint 1", status: "weird" },
]

describe("BurndownPageContent", () => {
  beforeEach(() => {
    nav.search = ""
    nav.replace.mockClear()
  })

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
    expect(nav.replace).toHaveBeenLastCalledWith("/projects/p1/burndown?sprint=s2", { scroll: false })
    await user.selectOptions(select, "")
    expect(screen.getByTestId("chart")).toHaveTextContent("all")
    expect(chartProps).toHaveBeenLastCalledWith({ projectId: "p1", sprintId: null, refreshable: true })
    expect(nav.replace).toHaveBeenLastCalledWith("/projects/p1/burndown?sprint=all", { scroll: false })
  })

  it("restores the whole-project choice from ?sprint=all after a reload", () => {
    nav.search = "sprint=all"
    render(<BurndownPageContent projectId="p1" sprints={sprints} />)
    expect((screen.getByRole("combobox", { name: t.burndownSprintSelect }) as HTMLSelectElement).value).toBe("")
    expect(chartProps).toHaveBeenLastCalledWith({ projectId: "p1", sprintId: null, refreshable: true })
  })

  it("reads a sprint id from the URL and ignores unknown ones", () => {
    expect(sprintSelectionFromParam("s2", sprints)).toBe("s2")
    expect(sprintSelectionFromParam("nope", sprints)).toBe("s3")
    expect(sprintSelectionFromParam(null, sprints)).toBe("s3")
    expect(sprintSelectionFromParam("all", sprints)).toBe("")
  })

  it("falls back to the whole project without an active sprint", () => {
    expect(defaultSprintSelection([{ id: "a", name: "A", status: "done" }])).toBe("")
    expect(defaultSprintSelection([])).toBe("")
  })
})

describe("archived sprints in the selector (S-10)", () => {
  const withArchived = [
    { id: "s3", name: "Sprint 3", status: "active" },
    { id: "s2", name: "Sprint 2", status: "archived" },
    { id: "s1", name: "Sprint 1", status: "archived" },
  ]

  beforeEach(() => {
    nav.search = ""
    nav.replace.mockClear()
  })

  it("lists archived sprints under their own group and opens their burndown", async () => {
    const user = userEvent.setup()
    render(<BurndownPageContent projectId="p1" sprints={withArchived} />)
    const group = screen.getByRole("group", { name: t.sprintStatusArchived })
    expect(Array.from(group.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Sprint 2", "Sprint 1"])
    await user.selectOptions(screen.getByRole("combobox", { name: t.burndownSprintSelect }), "s1")
    expect(chartProps).toHaveBeenLastCalledWith({ projectId: "p1", sprintId: "s1", refreshable: true })
    expect(nav.replace).toHaveBeenLastCalledWith("/projects/p1/burndown?sprint=s1", { scroll: false })
  })

  it("restores an archived sprint from the URL and omits the group without archived sprints", () => {
    nav.search = "sprint=s2"
    const { unmount } = render(<BurndownPageContent projectId="p1" sprints={withArchived} />)
    expect((screen.getByRole("combobox", { name: t.burndownSprintSelect }) as HTMLSelectElement).value).toBe("s2")
    unmount()
    render(<BurndownPageContent projectId="p1" sprints={sprints} />)
    expect(screen.queryByRole("group")).not.toBeInTheDocument()
  })

  it("splitArchived keeps order and separates archived sprints", () => {
    expect(splitArchived(withArchived)).toEqual({ live: [withArchived[0]], archived: [withArchived[1], withArchived[2]] })
  })
})
