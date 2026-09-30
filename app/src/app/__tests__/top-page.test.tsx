import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { renderWithProviders, tr } from "./test-utils"
import type { MyTask } from "../my-sprint-tasks"

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
  ProjectList: ({ activeProjects }: { activeProjects: unknown[] }) => <div data-testid="project-list">{activeProjects.length}</div>,
}))

const { TopPage } = await import("../top-page")
const { MySprintTasks } = await import("../my-sprint-tasks")

function task(over: Partial<MyTask> & { id: string }): MyTask {
  return {
    taskName: "Write code",
    status: "todo",
    estimatedHours: null,
    actualHours: null,
    pbId: "pb1",
    pbDisplayId: 7,
    pbUserStory: "As a user",
    sprintId: "s1",
    sprintName: "Sprint 1",
    sprintStatus: "active",
    sprintStartDate: "2026-09-01T00:00:00.000Z",
    sprintEndDate: "2026-09-14T00:00:00.000Z",
    projectId: "p1",
    projectName: "Alpha",
    ...over,
  }
}

const tasks: MyTask[] = [
  task({ id: "t1", status: "in_progress", estimatedHours: 4, actualHours: 2 }),
  task({ id: "t2", status: "done", taskName: null, estimatedHours: 3 }),
  task({ id: "t3", status: "weird", taskName: "", pbUserStory: null, sprintId: "s2", sprintName: "Sprint 2", sprintStatus: "planning" }),
  task({ id: "t4", projectId: "p2", projectName: "Beta", sprintId: "s9", sprintStatus: "unknown" }),
]

describe("TopPage", () => {
  it("greets the user, shows stat tiles and the task badges", () => {
    const t = tr("ja")
    renderWithProviders(
      <TopPage activeProjects={[{} as never, {} as never]} archivedProjects={[]} categories={[]} isAdmin={false} myTasks={tasks} userName="Taro" />,
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.topGreetingWithName.replace("{name}", "Taro"))
    expect(screen.getByTestId("project-list")).toHaveTextContent("2")
    expect(screen.getByText(`2 ${t.projectListCount}`)).toBeInTheDocument()
    expect(screen.getByText(`${t.taskDone} 1`)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.categorySettingsTitle })).toHaveAttribute("href", "/settings/categories")
  })

  it("shows the empty my-tasks state and generic greeting without a name", () => {
    const t = tr("en")
    renderWithProviders(<TopPage activeProjects={[]} archivedProjects={[]} categories={[]} isAdmin myTasks={[]} userName={null} />, { language: "en" })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.topGreeting)
    expect(screen.getByText(t.topMyTasksEmpty)).toBeInTheDocument()
  })

  it("switches language from the hero selector and opens the fixed tasks modal", async () => {
    const user = userEvent.setup()
    renderWithProviders(<TopPage activeProjects={[]} archivedProjects={[]} categories={[]} isAdmin={false} myTasks={[]} userName="A" />)
    await user.selectOptions(screen.getByRole("combobox", { name: tr("ja").topLanguageLabel }), "id")
    const tid = tr("id")
    expect(screen.getByRole("heading", { name: tid.topMyTasksHeading })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: tid.fixedTasksManage }))
    expect(screen.getByRole("dialog", { name: "fixed-tasks" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "close-fixed" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("MySprintTasks", () => {
  it("groups tasks by project then sprint and falls back to story / placeholder text", () => {
    const t = tr("ja")
    renderWithProviders(<MySprintTasks tasks={tasks} />)
    const articles = screen.getAllByRole("article")
    expect(articles).toHaveLength(2)
    const alpha = articles[0]
    expect(within(alpha).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/p1")
    expect(within(alpha).getByText("Sprint 1")).toBeInTheDocument()
    expect(within(alpha).getByText("Sprint 2")).toBeInTheDocument()
    expect(within(alpha).getByText(t.sprintStatusPlanning)).toBeInTheDocument()
    expect(within(alpha).getByText("2/4h")).toBeInTheDocument()
    expect(within(alpha).getByText("3h")).toBeInTheDocument()
    expect(within(alpha).getByText("As a user")).toBeInTheDocument()
    expect(within(alpha).getByText(t.sprintNoTaskName)).toBeInTheDocument()
    expect(within(alpha).getByText("weird")).toBeInTheDocument()
    expect(within(alpha).getAllByText("9/1 - 9/14", { exact: false }).length).toBeGreaterThan(0)
    expect(within(articles[1]).getByText("unknown")).toBeInTheDocument()
  })

  it("shows translated task text for the viewer language", () => {
    const i18n = { taskName: { ja: "コードを書く", id: "Tulis kode", source: "ja", status: "done" } } as MyTask["i18n"]
    renderWithProviders(<MySprintTasks tasks={[task({ id: "x", taskName: "コードを書く", i18n })]} />, { language: "id" })
    expect(screen.getByText("Tulis kode")).toBeInTheDocument()
    expect(screen.getByText(tr("id").taskTodo)).toBeInTheDocument()
  })
})
