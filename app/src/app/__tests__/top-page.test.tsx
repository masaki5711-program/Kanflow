import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "./test-utils"
import type { MyTask } from "../my-sprint-tasks"

// The home messages block refreshes the (server) page on live notifications.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@/components/fixed-tasks-modal", () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="fixed-tasks">
        <button type="button" onClick={onClose}>
          close-fixed
        </button>
      </div>
    ) : null,
}))
vi.mock("../project-list", () => ({
  ProjectList: ({ activeProjects, archivedCount }: { activeProjects: unknown[]; archivedCount: number }) => (
    <div data-testid="project-list">{`${activeProjects.length}/${archivedCount}`}</div>
  ),
}))

const { TopPage } = await import("../top-page")
const { MySprintTasks } = await import("../my-sprint-tasks")
const { useMyTaskStatuses } = await import("../_my-tasks/use-my-task-statuses")

afterEach(() => vi.unstubAllGlobals())

const DAY = 86_400_000
/** ISO of local noon `offset` days from today (urgency is by calendar day). */
function inDays(offset: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return new Date(d.getTime() + offset * DAY).toISOString()
}

function task(over: Partial<MyTask> & { id: string }): MyTask {
  return {
    taskName: "Write code",
    status: "todo",
    version: 1,
    estimatedHours: null,
    actualHours: null,
    pbId: "pb1",
    pbDisplayId: 7,
    pbUserStory: "As a user",
    sprintId: "s1",
    sprintName: "Sprint 1",
    sprintStatus: "active",
    sprintStartDate: inDays(-10),
    sprintEndDate: inDays(20),
    projectId: "p1",
    projectName: "Alpha",
    ...over,
  }
}

const tasks: MyTask[] = [
  task({ id: "t1", taskName: "Later work", status: "in_progress", estimatedHours: 4, actualHours: 2 }),
  task({ id: "t2", status: "done", taskName: null, estimatedHours: 3 }),
  task({ id: "t3", taskName: "", pbUserStory: null, sprintId: "s2", sprintName: "Sprint 2", sprintEndDate: inDays(-2) }),
  task({ id: "t4", taskName: "Beta soon", projectId: "p2", projectName: "Beta", sprintId: "s9", sprintEndDate: inDays(2) }),
]

function Harness({ list }: { list: MyTask[] }) {
  const statuses = useMyTaskStatuses(list)
  return <MySprintTasks tasks={list} statuses={statuses} now={new Date()} />
}

const PATCH_T1 = "/api/projects/p1/sprints/s1/tasks/t1"
const t = tr("ja")
const statusSelect = (name: string) => screen.getByRole("combobox", { name: t.topTaskStatusLabel.replace("{task}", name) }) as HTMLSelectElement
const kpiValue = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!.querySelector("dd")!.textContent

describe("TopPage", () => {
  it("greets the user with KPIs only (no duplicated header links)", () => {
    renderWithProviders(
      <TopPage activeProjects={[{} as never, {} as never]} archivedCount={5} categories={[]} isAdmin={false} myTasks={tasks} userName="Taro" />,
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.topGreetingWithName.replace("{name}", "Taro"))
    expect(screen.getAllByRole("definition")).toHaveLength(3)
    // open = t1, t3, t4 · overdue = t3 · due this week = t4
    expect(kpiValue(t.topKpiOpen)).toBe("3")
    expect(kpiValue(t.topKpiOverdue)).toBe("1")
    expect(kpiValue(t.topKpiDueThisWeek)).toBe("1")
    expect(screen.queryByRole("link", { name: t.myProfileMenu })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.categorySettingsTitle })).toHaveAttribute("href", "/settings/categories")
    expect(screen.getByTestId("project-list")).toHaveTextContent("2/5")
    expect(screen.getByText(`2 ${t.projectListCount}`)).toBeInTheDocument()
  })

  it("shows the empty my-tasks state and generic greeting without a name", () => {
    const te = tr("en")
    renderWithProviders(<TopPage activeProjects={[]} archivedCount={0} categories={[]} isAdmin myTasks={[]} userName={null} />, { language: "en" })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(te.topGreeting)
    expect(screen.getByText(te.topMyTasksEmpty)).toBeInTheDocument()
  })

  it("has no duplicate language selector and opens the fixed tasks modal", async () => {
    const user = userEvent.setup()
    renderWithProviders(<TopPage activeProjects={[]} archivedCount={0} categories={[]} isAdmin={false} myTasks={[]} userName="A" />, { language: "id" })
    const tid = tr("id")
    expect(screen.queryByRole("combobox", { name: tid.topLanguageLabel })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: tid.topMyTasksHeading })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: tid.fixedTasksManage }))
    expect(screen.getByRole("dialog", { name: "fixed-tasks" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "close-fixed" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("updates the KPIs when a task is marked done inline", async () => {
    const user = userEvent.setup()
    stubFetch([{ match: PATCH_T1, method: "PATCH", respond: () => jsonResponse({ id: "t1", status: "done", version: 2 }) }])
    renderWithProviders(<TopPage activeProjects={[]} archivedCount={0} categories={[]} isAdmin={false} myTasks={tasks} userName="A" />)
    await user.selectOptions(statusSelect("Later work"), "done")
    expect(kpiValue(t.topKpiOpen)).toBe("2")
  })
})

describe("MySprintTasks", () => {
  it("groups by project, most urgent first, and links tasks into the sprint board", () => {
    renderWithProviders(<Harness list={tasks} />)
    const articles = screen.getAllByRole("article")
    expect(articles.map((a) => within(a).getAllByRole("link")[0].textContent)).toEqual(["Alpha", "Beta"])
    const alpha = articles[0]
    expect(within(alpha).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/p1")
    // overdue (t3, placeholder name) → later (t1) → done (t2, story fallback)
    const titles = within(alpha)
      .getAllByRole("link")
      .slice(1)
      .map((a) => [a.textContent, a.getAttribute("href")])
    expect(titles).toEqual([
      [t.sprintNoTaskName, "/projects/p1/sprints?task=t3"],
      ["Later work", "/projects/p1/sprints?task=t1"],
      ["As a user", "/projects/p1/sprints?task=t2"],
    ])
    expect(within(alpha).getByText(t.topTaskOverdueBadge)).toBeInTheDocument()
    expect(within(alpha).getByText("2/4h")).toBeInTheDocument()
    expect(within(alpha).getByText("3h")).toBeInTheDocument()
    expect(within(alpha).getByText("Sprint 2")).toBeInTheDocument()
    expect(within(articles[1]).getByText(t.topTaskDueSoonBadge)).toBeInTheDocument()
  })

  it("shows the due date localized per UI language, not a hard-coded M/D (S-05)", () => {
    const due = new Date(2026, 8, 8, 12).toISOString()
    const list = [task({ id: "d1", taskName: "Due task", sprintEndDate: due })]
    const cases = [
      ["ja", "9/8(火)"],
      ["en", "Sep 8"],
      ["id", "8 Sep"],
    ] as const
    for (const [language, expected] of cases) {
      const { unmount } = renderWithProviders(<Harness list={list} />, { language })
      const dueText = tr(language).topTaskDueOn.replace("{date}", expected)
      expect(screen.getByText(dueText)).toBeInTheDocument()
      unmount()
    }
  })

  it("keeps an unknown status selectable and shows translated task text", () => {
    const i18n = { taskName: { ja: "コードを書く", id: "Tulis kode", source: "ja", status: "done" } } as MyTask["i18n"]
    renderWithProviders(<Harness list={[task({ id: "x", taskName: "コードを書く", i18n }), task({ id: "y", taskName: "R", status: "review" })]} />, {
      language: "id",
    })
    const tid = tr("id")
    expect(screen.getByText("Tulis kode")).toBeInTheDocument()
    const review = screen.getByRole("combobox", { name: tid.topTaskStatusLabel.replace("{task}", "R") }) as HTMLSelectElement
    expect(review.value).toBe("review")
    expect(within(review).getByRole("option", { name: tid.topTaskReview })).toBeInTheDocument()
  })

  it("changes the status optimistically and sends the loaded version", async () => {
    const user = userEvent.setup()
    let release: (r: Response) => void = () => {}
    const fetchMock = stubFetch([
      {
        match: PATCH_T1,
        method: "PATCH",
        respond: () =>
          new Promise<Response>((resolve) => {
            release = resolve
          }),
      },
    ])
    renderWithProviders(<Harness list={tasks} />)
    const select = statusSelect("Later work")
    await user.selectOptions(select, "done")
    expect(select.value).toBe("done")
    expect(select).toBeDisabled()
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ status: "done", version: 1 })
    release(jsonResponse({ id: "t1", status: "done", version: 2 }))
    await waitFor(() => expect(select).not.toBeDisabled())
    expect(select.value).toBe("done")
    // The next change carries the version the server returned.
    await user.selectOptions(select, "todo")
    release(jsonResponse({ id: "t1", status: "todo", version: 3 }))
    await waitFor(() => expect(select).not.toBeDisabled())
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ status: "todo", version: 2 })
  })

  it("reverts and toasts when the change fails", async () => {
    const user = userEvent.setup()
    stubFetch([{ match: PATCH_T1, method: "PATCH", respond: () => jsonResponse({ error: "denied" }, 403) }])
    renderWithProviders(<Harness list={tasks} />)
    const select = statusSelect("Later work")
    await user.selectOptions(select, "done")
    expect(await screen.findByText("denied")).toBeInTheDocument()
    expect(screen.getByText(t.topTaskStatusFailed)).toBeInTheDocument()
    expect(select.value).toBe("in_progress")
  })

  it("adopts the server row on a version conflict (or reverts without one)", async () => {
    const user = userEvent.setup()
    let withCurrent = true
    stubFetch([
      {
        match: PATCH_T1,
        method: "PATCH",
        respond: () =>
          jsonResponse(
            { error: "stale", code: "VERSION_CONFLICT", ...(withCurrent ? { current: { id: "t1", status: "todo", version: 9 } } : {}) },
            409,
          ),
      },
    ])
    renderWithProviders(<Harness list={tasks} />)
    const select = statusSelect("Later work")
    await user.selectOptions(select, "done")
    expect(await screen.findByText(t.apiErrVersionConflict)).toBeInTheDocument()
    await waitFor(() => expect(select.value).toBe("todo"))
    expect(screen.queryByText(t.topTaskStatusFailed)).not.toBeInTheDocument()

    withCurrent = false
    await user.selectOptions(select, "done")
    await waitFor(() => expect(select).not.toBeDisabled())
    expect(select.value).toBe("todo")
  })

  it("ignores selecting the current status", async () => {
    const fetchMock = stubFetch([])
    renderWithProviders(<Harness list={[task({ id: "t1", taskName: "A", status: "todo" })]} />)
    await userEvent.setup().selectOptions(screen.getByRole("combobox"), "todo")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
