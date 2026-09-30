import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { json, pb, renderWithProviders, sprint, stubFetch, t, task } from "./helpers"
import SprintProgress from "../components/sprint-progress"
import SprintStatusDialog from "../components/sprint-status-dialog"
import { computeSprintMetrics } from "../lib/sprint-metrics"
import { statusDialogFor } from "../lib/task-payload"

const session = vi.hoisted(() => ({ current: { user: { id: "u1", role: "admin" } } as unknown }))
vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.current }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const pbA = pb("pb1", { workloadScore: 8 })
const pbB = pb("pb2", { workloadScore: 4 })
const items = [
  task("t1", pbA, { status: "done" }), task("t2", pbA, { status: "done" }),
  task("t3", pbB, { status: "todo" }), task("t4", pbB, { status: "in_progress" }),
  task("p3", pb("pb3", { workloadScore: 1 }), { taskName: "" }),
]

afterEach(() => vi.unstubAllGlobals())

describe("sprint completion dialog (S-08)", () => {
  it("summarizes unfinished work and what completing does", () => {
    const s = sprint("s1", { items })
    renderWithProviders(<SprintStatusDialog projectId="p1" sprint={s} initial={statusDialogFor(s, "done")}
      onSubmit={async () => true} onClose={vi.fn()} />)
    const summary = screen.getByTestId("sprint-completion-summary")
    expect(summary).toHaveTextContent(t.sprintCompleteUnfinished.replace("{tasks}", "2").replace("{pbis}", "2"))
    expect(summary).toHaveTextContent(t.sprintCompleteArchiveNote)
    expect(summary).toHaveTextContent(t.sprintCompleteCarryOverNote)
  })

  it("names the sprint in the viewer's language", () => {
    const i18n = { sprintName: { ja: "第5スプリント", id: "Sprint Kelima", source: "id" as const, status: "done" as const } }
    const s = sprint("s1", { sprintName: "Sprint Kelima", i18n } as never)
    renderWithProviders(<SprintStatusDialog projectId="p1" sprint={s} initial={statusDialogFor(s, "review")}
      onSubmit={async () => true} onClose={vi.fn()} />)
    expect(screen.getByText("第5スプリント")).toBeInTheDocument()
    expect(screen.queryByText("Sprint Kelima")).not.toBeInTheDocument()
  })

  it("says everything is done, and shows no summary when only moving to review", () => {
    const s = sprint("s1", { items: [task("t1", pbA, { status: "done" })] })
    const { unmount } = renderWithProviders(<SprintStatusDialog projectId="p1" sprint={s} initial={statusDialogFor(s, "done")}
      onSubmit={async () => true} onClose={vi.fn()} />)
    expect(screen.getByTestId("sprint-completion-summary")).toHaveTextContent(t.sprintCompleteAllDone)
    expect(screen.queryByText(t.sprintCompleteCarryOverNote)).not.toBeInTheDocument()
    unmount()
    renderWithProviders(<SprintStatusDialog projectId="p1" sprint={s} initial={statusDialogFor(s, "review")}
      onSubmit={async () => true} onClose={vi.fn()} />)
    expect(screen.queryByTestId("sprint-completion-summary")).not.toBeInTheDocument()
  })
})

describe("SprintProgress labels (S-13)", () => {
  it("labels done tasks with their share and keeps the load % next to the workload", () => {
    const s = sprint("s1", { capacity: 26, items })
    renderWithProviders(<SprintProgress capacity={26} metrics={computeSprintMetrics(s)} />)
    expect(screen.getByText(t.sprintProgressDoneTasks.replace("{done}", "2").replace("{total}", "4").replace("{pct}", "50"))).toBeInTheDocument()
    const load = screen.getByText(t.sprintProgressLoadPct.replace("{pct}", "50"))
    expect(load.parentElement).toHaveTextContent(`${t.sprintWorkload}: 13 / 26`)
    expect(screen.getByText(`${t.sprintActualScore}: 8 / 13`)).toBeInTheDocument()
  })
})

describe("task edit after a 409 (S-09)", () => {
  it("replaces the stale form with the server's values and shows a notice", async () => {
    const s1 = sprint("s1", { items: [task("t1", pbA, { version: 3 })] })
    const current = { ...task("t1", pbA), taskName: "Task t1 (SM edit)", estimatedHours: 4, version: 4 }
    const { calls } = stubFetch({
      [`${BASE}/sprints`]: [s1],
      [`${BASE}/backlog?status=ready`]: { readyItems: [] },
      [`${BASE}/events`]: [],
      [`${BASE}/members`]: [{ id: "m1", userId: "u1", role: "po", user: { id: "u1", name: "Alice", email: "a@x" } }],
      [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
      [`${BASE}/backlog/pb1`]: () => json({ error: "gone" }, 404),
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: () => json({ error: "stale", code: "VERSION_CONFLICT", current }, 409),
    })
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintTaskEditNamed.replace("{name}", "Task t1") }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByDisplayValue("Task t1"), " (PO edit)")
    await userEvent.click(within(dialog).getByRole("button", { name: t.update }))

    expect(await within(dialog).findByText(t.sprintEditConflictNotice)).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Task t1 (SM edit)")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("4")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ taskName: "Task t1 (PO edit)", version: 3 })
    await waitFor(() => expect(calls.filter((c) => c.url === `${BASE}/sprints` && c.method === "GET").length).toBe(2))
  })
})
