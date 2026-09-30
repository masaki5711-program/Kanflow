import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders, stubFetch } from "./providers"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }) }))

const { default: GanttPage } = await import("../page")
const t = getTranslations("ja")

function iso(offsetDays: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

const pb = (id: string, displayId: number, extra: Record<string, unknown> = {}) => ({
  id,
  displayId,
  initiative: null,
  epic: null,
  userStory: null,
  workloadScore: 0,
  ...extra,
})

const sprints = [
  {
    id: "s2",
    sprintName: "Sprint Two",
    startDate: iso(20),
    endDate: iso(30),
    sprintGoal: null,
    capacity: 8,
    actualScore: 0,
    status: "planning",
    items: [],
  },
  {
    id: "s1",
    sprintName: "Sprint One",
    startDate: iso(-3),
    endDate: iso(10),
    sprintGoal: null,
    capacity: 20,
    actualScore: 0,
    status: "active",
    items: [
      { id: "t1", taskName: "Task A", assignee: "Taro Yamada", estimatedHours: 4, actualHours: 2, status: "done", pbItem: pb("p1", 11, { initiative: "Login" }) },
      { id: "t2", taskName: "Task B", assignee: null, estimatedHours: null, actualHours: null, status: "in_progress", pbItem: pb("p1", 11, { initiative: "Login" }) },
      { id: "t3", taskName: null, assignee: null, estimatedHours: null, actualHours: null, status: "todo", pbItem: pb("p2", 12, { workloadScore: 5 }) },
    ],
  },
]

const events = [
  { id: "e1", title: "Review day", date: iso(2), endDate: null, color: "red", sprintId: null },
  { id: "e2", title: "Far away", date: iso(400), endDate: null, color: "blue", sprintId: null },
]

let scrollTo: ReturnType<typeof vi.fn>

beforeEach(() => {
  scrollTo = vi.fn()
  Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function routes(sprintBody: unknown = sprints) {
  return stubFetch((url) => {
    if (url.endsWith("/sprints")) return jsonResponse(sprintBody)
    if (url.endsWith("/events")) return jsonResponse(events)
    return jsonResponse({ error: "nope" }, 404)
  })
}

describe("GanttPage", () => {
  it("shows the empty state when there are no sprints", async () => {
    routes([])
    renderWithProviders(<GanttPage />)
    expect(await screen.findByText(t.ganttNoData)).toBeInTheDocument()
    expect(screen.getByText(t.ganttNoDataHint)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.ganttGoToSprints })).toHaveAttribute("href", "/projects/p1/sprints")
  })

  it("renders sprints sorted by date with pbi/task rows, stats and events", async () => {
    const fetchMock = routes()
    renderWithProviders(<GanttPage />)

    const one = await screen.findByRole("button", { name: /Sprint One/ })
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/sprints", expect.anything())
    const two = screen.getByRole("button", { name: /Sprint Two/ })
    // Sorted by start date: Sprint One comes first in the DOM.
    expect(one.compareDocumentPosition(two) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getByText(t.ganttSprintCount.replace("{n}", "2"))).toBeInTheDocument()
    expect(screen.getByText(t.ganttTaskCount.replace("{n}", "2"))).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: t.ganttCompletion })).toHaveAttribute("aria-valuenow", "50")

    // Task rows: hours and assignee initials
    expect(screen.getByText(t.ganttHours.replace("{actual}", "2").replace("{estimated}", "4"))).toBeInTheDocument()
    expect(screen.getByText("TY")).toBeInTheDocument()
    expect(screen.getByText(`${t.ganttAssignee}: Taro Yamada`)).toBeInTheDocument()
    // PBI row with workload badge
    expect(screen.getByText(`${t.sprintWorkload}: 5`)).toBeInTheDocument()

    // Events: in-range flag rendered, far one skipped
    const evList = screen.getByRole("list", { name: t.ganttEvents })
    expect(within(evList).getByText("Review day")).toBeInTheDocument()
    expect(within(evList).queryByText("Far away")).not.toBeInTheDocument()

    // Bars exposed as images with descriptive labels
    expect(screen.getByRole("img", { name: /^Sprint One \|/ })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /^#11 Login \|/ })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /^Task A \|.*Taro Yamada/ })).toBeInTheDocument()

    // Auto-scroll to today once after first load
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1))
  })

  it("collapses and expands sprint and PBI rows via aria-expanded toggle buttons", async () => {
    routes()
    const user = userEvent.setup()
    renderWithProviders(<GanttPage />)

    const sprintBtn = await screen.findByRole("button", { name: /Sprint One/ })
    expect(sprintBtn).toHaveAttribute("aria-expanded", "true")
    expect(screen.getAllByText("Task A").length).toBeGreaterThan(0)

    const pbiBtn = screen.getByRole("button", { name: /#11/ })
    await user.click(pbiBtn)
    expect(pbiBtn).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Task A")).not.toBeInTheDocument()
    expect(screen.queryByRole("img", { name: /^Task A/ })).not.toBeInTheDocument()
    await user.click(pbiBtn)
    expect(screen.getByRole("button", { name: /#11/ })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getAllByText("Task A").length).toBeGreaterThan(0)

    await user.click(sprintBtn)
    expect(screen.getByRole("button", { name: /Sprint One/ })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: /#11/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /#12/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Sprint One/ }))
    expect(screen.getByRole("button", { name: /#12/ })).toBeInTheDocument()
  })

  it("switches zoom, scrolls to today on demand, and syncs vertical scroll", async () => {
    routes()
    const user = userEvent.setup()
    renderWithProviders(<GanttPage />)
    await screen.findByRole("button", { name: /Sprint One/ })

    const group = screen.getByRole("group", { name: t.ganttZoomLabel })
    const month = within(group).getByRole("button", { name: t.ganttZoomMonth })
    expect(within(group).getByRole("button", { name: t.ganttZoom2Weeks })).toHaveAttribute("aria-pressed", "true")
    await user.click(month)
    expect(month).toHaveAttribute("aria-pressed", "true")

    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole("button", { name: t.ganttToday }))
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo.mock.calls[1][0]).toMatchObject({ behavior: "smooth" })

    const timeline = screen.getByRole("region", { name: t.ganttTimelineLabel })
    const left = screen.getByText(t.ganttColumnHeader).nextElementSibling as HTMLDivElement
    timeline.scrollTop = 120
    fireEvent.scroll(timeline)
    expect(left.scrollTop).toBe(120)
    left.scrollTop = 40
    fireEvent.scroll(left)
    expect(timeline.scrollTop).toBe(40)
  })

  it("highlights hovered rows in both panels", async () => {
    routes()
    renderWithProviders(<GanttPage />)
    const btn = await screen.findByRole("button", { name: /Sprint One/ })
    const li = btn.closest("li") as HTMLElement
    fireEvent.mouseEnter(li)
    expect(li.className).toContain("bg-primary-soft/40")
    fireEvent.mouseLeave(li)
    expect(li.className).not.toContain("bg-primary-soft/40")
  })

  it("shows an error view (not the empty state) when sprints fail to load, and retries", async () => {
    let fail = true
    const fetchMock = stubFetch((url) => {
      if (url.endsWith("/sprints")) return fail ? jsonResponse({ error: "boom" }, 500) : jsonResponse(sprints)
      if (url.endsWith("/events")) return jsonResponse(events)
      return jsonResponse({ error: "nope" }, 404)
    })
    const user = userEvent.setup()
    renderWithProviders(<GanttPage />)

    expect(await screen.findByText(t.ganttLoadFailed)).toBeInTheDocument()
    expect(screen.queryByText(t.ganttNoData)).not.toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole("button", { name: t.errorRetry }))
    expect(await screen.findByRole("button", { name: /Sprint One/ })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/sprints"))).toHaveLength(2)
  })

  it("hides and shows the left task list from the toolbar", async () => {
    routes()
    const user = userEvent.setup()
    renderWithProviders(<GanttPage />)
    await screen.findByRole("button", { name: /Sprint One/ })

    const hide = screen.getByRole("button", { name: t.ganttHideList })
    expect(hide).toHaveAttribute("aria-expanded", "true")
    const panel = document.getElementById(hide.getAttribute("aria-controls") as string) as HTMLElement
    expect(panel).toBeVisible()
    expect(panel.className).toContain("w-44")

    await user.click(hide)
    expect(panel).not.toBeVisible()
    const show = screen.getByRole("button", { name: t.ganttShowList })
    expect(show).toHaveAttribute("aria-expanded", "false")
    // Timeline stays usable while the list is hidden.
    expect(screen.getByRole("region", { name: t.ganttTimelineLabel })).toBeInTheDocument()

    await user.click(show)
    expect(panel).toBeVisible()
  })
})
