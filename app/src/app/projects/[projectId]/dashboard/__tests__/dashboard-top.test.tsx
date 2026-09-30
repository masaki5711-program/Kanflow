import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { ActiveSprint, DashboardMyTask } from "../types"
import type { DueItem } from "../dashboard-summary"
import type { FeedEntry } from "../activity-sentence"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const { ActiveSprintCard } = await import("../active-sprint-card")
const { MyProjectTasks, MY_TASKS_VISIBLE } = await import("../my-project-tasks")
const { UpcomingDue } = await import("../upcoming-due")
const { ActivityFeed, parseFeedPage } = await import("../activity-feed")

const en = tr("en")
const ja = tr("ja")

afterEach(() => vi.unstubAllGlobals())

describe("ActiveSprintCard (sprint pulse)", () => {
  const now = new Date(2026, 8, 10, 9)
  const sprint: ActiveSprint = {
    id: "s1", name: "Sprint 7", goal: "Finish login", startDate: "2026-09-01T00:00:00Z", endDate: "2026-09-14T00:00:00Z",
    capacity: 20, taskCounts: { todo: 1, inProgress: 1, done: 2 },
    sparkline: { ideal: [4, 2, 0], actual: [4, 3, null], total: 4, remaining: 3 },
  }

  it("shows days left, progress and the sparkline linking to the burndown", () => {
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={sprint} now={now} />, { language: "en" })
    expect(screen.getByRole("heading", { level: 2, name: "Sprint 7" })).toBeInTheDocument()
    expect(screen.getByText(en.dashboardPulseDaysLeft.replace("{days}", "4"))).toBeInTheDocument()
    expect(screen.getByText(en.dashboardPulseProgress.replace("{done}", "2").replace("{total}", "4"))).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50")
    expect(screen.getByRole("img", { name: en.dashboardPulseSparkline.replace("{total}", "4").replace("{remaining}", "3") })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: en.dashboardPulseOpenBurndown })).toHaveAttribute("href", "/projects/p1/burndown")
    expect(screen.getByRole("link", { name: "Sprint 7" })).toHaveAttribute("href", "/projects/p1/sprints")
  })

  it("flags the last day and an overrun sprint", () => {
    const { unmount } = renderWithProviders(<ActiveSprintCard projectId="p1" sprint={sprint} now={new Date(2026, 8, 14, 20)} />, { language: "en" })
    expect(screen.getByText(en.dashboardPulseEndsToday)).toBeInTheDocument()
    unmount()
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={sprint} now={new Date(2026, 8, 17)} />, { language: "en" })
    expect(screen.getByText(en.dashboardPulseOverdue.replace("{days}", "3"))).toBeInTheDocument()
  })

  it("omits the sparkline without enough days and the badge for a bad date", () => {
    renderWithProviders(
      <ActiveSprintCard projectId="p1" sprint={{ ...sprint, endDate: "bad", sparkline: { ideal: [1], actual: [1], total: 1, remaining: 1 } }} now={now} />,
    )
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.queryByText(ja.dashboardPulseOpenBurndown)).not.toBeInTheDocument()
  })

  it("shows the empty state without an active sprint", () => {
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={null} />, { language: "en" })
    expect(screen.getByText(en.dashboardNoActiveSprint)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: en.dashboardOpenSprints })).toHaveAttribute("href", "/projects/p1/sprints")
  })
})

describe("MyProjectTasks", () => {
  const task = (id: string, over: Partial<DashboardMyTask> = {}): DashboardMyTask => ({
    id, taskName: `Task ${id}`, status: "todo", pbDisplayId: 1, pbUserStory: "Story", ...over,
  })

  it("links each task into the sprint board with its status", () => {
    renderWithProviders(<MyProjectTasks projectId="p1" tasks={[task("a", { status: "in_progress" }), task("b", { taskName: null }), task("c", { taskName: "", pbUserStory: null, status: "odd" })]} />)
    const links = screen.getAllByRole("link")
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/projects/p1/sprints?task=a", "/projects/p1/sprints?task=b", "/projects/p1/sprints?task=c"])
    expect(links[1]).toHaveTextContent("Story")
    expect(links[2]).toHaveTextContent(ja.sprintNoTaskName)
    expect(screen.getByText(ja.taskInProgress)).toBeInTheDocument()
    expect(screen.getByText("odd")).toBeInTheDocument()
  })

  it("caps the list with a link to the rest", () => {
    const many = Array.from({ length: MY_TASKS_VISIBLE + 2 }, (_, i) => task(`t${i}`))
    renderWithProviders(<MyProjectTasks projectId="p1" tasks={many} />, { language: "en" })
    expect(screen.getAllByRole("listitem")).toHaveLength(MY_TASKS_VISIBLE)
    expect(screen.getByRole("link", { name: en.dashboardMyTasksMore.replace("{count}", "2") })).toHaveAttribute("href", "/projects/p1/sprints")
  })

  it("shows an empty state", () => {
    renderWithProviders(<MyProjectTasks projectId="p1" tasks={[]} />)
    expect(screen.getByText(ja.dashboardMyTasksEmpty)).toBeInTheDocument()
  })
})

describe("UpcomingDue", () => {
  const item = (id: string, kind: DueItem["kind"], days: number): DueItem => ({ id, kind, name: `Item ${id}`, date: "2026-10-01T00:00:00.000Z", days })

  it("labels each item by kind and urgency and links to its page", () => {
    renderWithProviders(
      <UpcomingDue projectId="p1" items={[item("a", "plan_item", -2), item("s", "sprint_end", 0), item("m", "milestone", 5)]} />,
      { language: "en" },
    )
    const links = screen.getAllByRole("link")
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/projects/p1/plan", "/projects/p1/sprints", "/projects/p1/plan"])
    expect(links[0]).toHaveTextContent(`${en.dashboardDuePlanItem} · 2026/10/01`)
    expect(links[0]).toHaveTextContent(en.dashboardDueOverdue)
    expect(links[1]).toHaveTextContent(en.dashboardDueSprintEnd)
    expect(links[1]).toHaveTextContent(en.dashboardDueToday)
    expect(links[2]).toHaveTextContent(en.dashboardDueMilestone)
    expect(links[2]).toHaveTextContent(en.dashboardDueInDays.replace("{days}", "5"))
  })

  it("shows an empty state", () => {
    renderWithProviders(<UpcomingDue projectId="p1" items={[]} />)
    expect(screen.getByText(ja.dashboardDueEmpty)).toBeInTheDocument()
  })
})

describe("ActivityFeed", () => {
  const FEED = "/api/projects/p1/activity"
  const entry = (id: string, over: Partial<FeedEntry> = {}): FeedEntry => ({
    id, entityType: "pbi", entityId: `pb-${id}`, action: "create", actor: { id: "u1", name: "Alice" }, changes: null,
    label: `Story ${id}`, meta: null, createdAt: new Date().toISOString(), ...over,
  })

  it("renders localized sentences with entity links (none for deleted items)", async () => {
    const fetchMock = stubFetch([
      {
        match: FEED,
        respond: () =>
          jsonResponse({
            items: [
              entry("1"),
              entry("2", { entityType: "sprint_task", entityId: "t9", action: "status_change", label: "Docs", changes: { status: { from: "todo", to: "done" } } }),
              entry("3", { action: "delete", actor: null }),
              { id: "broken" },
            ],
            nextCursor: null,
          }),
      },
    ])
    renderWithProviders(<ActivityFeed projectId="p1" />, { language: "en" })
    const pbi = await screen.findByRole("link", { name: "PBI “Story 1”" })
    expect(pbi).toHaveAttribute("href", "/projects/p1/backlog?pbi=pb-1")
    expect(pbi.closest("p")).toHaveTextContent("Alice created PBI “Story 1”")
    const task = screen.getByRole("link", { name: "task “Docs”" })
    expect(task).toHaveAttribute("href", "/projects/p1/sprints?task=t9")
    expect(task.closest("p")).toHaveTextContent(`Alice changed the status of task “Docs” → ${en.taskDone}`)
    expect(screen.getByText(`${en.historySystem} deleted`, { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "PBI “Story 3”" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${FEED}?limit=20`)
    expect(screen.queryByRole("button", { name: en.dashboardFeedLoadMore })).not.toBeInTheDocument()
  })

  it("loads more pages with the cursor and reports a failed page", async () => {
    const user = userEvent.setup()
    let failNext = false
    stubFetch([
      {
        match: FEED,
        respond: (url) => {
          if (!url.includes("cursor=")) return jsonResponse({ items: [entry("1")], nextCursor: "c/1" })
          if (failNext) return jsonResponse({ error: "gone" }, 500)
          return jsonResponse({ items: [entry("2")], nextCursor: "c2" })
        },
      },
    ])
    renderWithProviders(<ActivityFeed projectId="p1" />, { language: "en" })
    await user.click(await screen.findByRole("button", { name: en.dashboardFeedLoadMore }))
    expect(await screen.findByRole("link", { name: "PBI “Story 2”" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    failNext = true
    await user.click(screen.getByRole("button", { name: en.dashboardFeedLoadMore }))
    expect(await screen.findByText("gone")).toBeInTheDocument()
    expect(screen.getByText(en.dashboardFeedLoadFailed)).toBeInTheDocument()
  })

  it("shows an empty state, and an error with retry", async () => {
    const user = userEvent.setup()
    let calls = 0
    stubFetch([{ match: FEED, respond: () => (++calls === 1 ? jsonResponse({ error: "down" }, 500) : jsonResponse({ items: [], nextCursor: null })) }])
    renderWithProviders(<ActivityFeed projectId="p1" />)
    expect(await screen.findByText(ja.dashboardFeedLoadFailed)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: ja.dashboardFeedRetry }))
    expect(await screen.findByText(ja.dashboardFeedEmpty)).toBeInTheDocument()
  })

  it("parseFeedPage tolerates garbage", () => {
    expect(parseFeedPage(null)).toEqual({ items: [], nextCursor: null })
    expect(parseFeedPage({ items: [{ id: "x", action: "create", createdAt: "t" }], nextCursor: 5 })).toEqual({ items: [], nextCursor: null })
  })
})

describe("sprint section heading", () => {
  it("keeps the sprint pulse reachable by heading", async () => {
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={null} />)
    await waitFor(() => expect(within(document.body).getByRole("heading", { name: ja.dashboardActiveSprint })).toBeInTheDocument())
  })
})
