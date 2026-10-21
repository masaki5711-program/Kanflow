import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { currentSearch, resetNavigation } from "./nav-mock"
import { pb, pickMenuItem, renderWithProviders, sprint, stubFetch, t, task, type Routes } from "./helpers"

const session = vi.hoisted(() => ({ current: { user: { id: "u1", role: "admin" } } as unknown }))

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.current }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/pbi-detail-modal", () => ({ default: () => null }))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const pb1 = pb("pb1")
const ann = { id: "u1", name: "Alice" }
const bob = { id: "u2", name: "Bob" }

function routes(sprints: unknown, extra: Routes = {}): Routes {
  return {
    [`${BASE}/sprints`]: sprints,
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: [
      { id: "m1", userId: "u1", role: "po", user: { id: "u1", name: "Alice", email: "a@x" } },
      { id: "m2", userId: "u2", role: "dev", user: { id: "u2", name: "Bob", email: "b@x" } },
    ],
    [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
    ...extra,
  }
}

/** Node 25 ships its own (incomplete) global localStorage; use a plain in-memory Storage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k) },
    setItem: (k: string, v: string) => { data.set(k, String(v)) },
  }
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true })
})
afterEach(() => {
  resetNavigation()
  vi.unstubAllGlobals()
})

describe("sprint tab usability", () => {
  it("renames a task in place from its menu and saves on Enter", async () => {
    const { calls } = stubFetch(routes([sprint("s1", { items: [task("t1", pb1, { version: 2 })] })], { [`PATCH ${BASE}/sprints/s1/tasks/t1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await pickMenuItem("Task t1", t.sprintUxRenameTask.replace("{name}", "Task t1"))
    const input = await screen.findByRole("textbox", { name: t.sprintUxRenameTask.replace("{name}", "Task t1") })
    await userEvent.clear(input)
    await userEvent.type(input, "Renamed{Enter}")
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ taskName: "Renamed", version: 2 }))
  })

  it("Escape leaves the name as it was without saving", async () => {
    const { calls } = stubFetch(routes([sprint("s1", { items: [task("t1", pb1)] })]))
    renderWithProviders(<SprintsPage />)
    await pickMenuItem("Task t1", t.sprintUxRenameTask.replace("{name}", "Task t1"))
    await userEvent.type(await screen.findByRole("textbox", { name: t.sprintUxRenameTask.replace("{name}", "Task t1") }), "x{Escape}")
    expect(screen.queryByRole("textbox", { name: t.sprintUxRenameTask.replace("{name}", "Task t1") })).not.toBeInTheDocument()
    expect(calls.some((c) => c.method === "PATCH")).toBe(false)
  })

  it("edits the estimate in place (empty clears it)", async () => {
    const { calls } = stubFetch(routes([sprint("s1", { items: [task("t1", pb1, { estimatedHours: 2 })] })], { [`PATCH ${BASE}/sprints/s1/tasks/t1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintUxEditHours.replace("{name}", "Task t1") }))
    const input = screen.getByRole("spinbutton", { name: t.sprintUxEditHours.replace("{name}", "Task t1") })
    await userEvent.clear(input)
    await userEvent.type(input, "3.5{Enter}")
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ estimatedHours: 3.5 }))
  })

  it("picks an owner from the list and unassigns by picking the owner again", async () => {
    const owned = task("t1", pb1, { assignees: [ann] })
    const { calls } = stubFetch(routes([sprint("s1", { items: [owned] })], { [`PATCH ${BASE}/sprints/s1/tasks/t1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintUxChangeAssignee.replace("{name}", "Task t1") }))
    await userEvent.click(within(screen.getByRole("listbox", { name: t.sprintAssignee })).getByRole("button", { name: "Bob" }))
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ assigneeIds: ["u2"] }))
    await userEvent.click(screen.getByRole("button", { name: t.sprintUxChangeAssignee.replace("{name}", "Task t1") }))
    await userEvent.click(within(screen.getByRole("listbox", { name: t.sprintAssignee })).getByRole("button", { name: "Alice" }))
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")[1].body).toMatchObject({ assigneeIds: [] }))
  })

  it("adds a task from the quick-add row with Enter and clears the field", async () => {
    const { calls } = stubFetch(routes([sprint("s1", { items: [task("t1", pb1)] })], { [`POST ${BASE}/sprints/s1/tasks`]: { id: "n1" } }))
    renderWithProviders(<SprintsPage />)
    const input = await screen.findByRole("textbox", { name: t.sprintUxQuickAddLabel.replace("{pbi}", "#1") })
    await userEvent.type(input, "  Write docs  {Enter}")
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/tasks"))?.body).toEqual({
      pbItemId: "pb1", taskName: "Write docs", assigneeIds: [], estimatedHours: null,
    }))
    await waitFor(() => expect(input).toHaveValue(""))
  })

  it("shows the sprint stepper with the current step marked", async () => {
    stubFetch(routes([sprint("s1", { status: "review" })]))
    renderWithProviders(<SprintsPage />)
    const steps = await screen.findByRole("list", { name: t.sprintUxStepperLabel })
    expect(within(steps).getByText(t.sprintStatusReview).closest("li")).toHaveAttribute("aria-current", "step")
    expect(within(steps).getByText(t.sprintStatusPlanning).closest("li")).not.toHaveAttribute("aria-current")
  })

  it("flags unassigned open work in the sprint header", async () => {
    stubFetch(routes([sprint("s1", { items: [task("t1", pb1), task("t2", pb1, { assignees: [ann] })] })]))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByText(t.sprintUxAttentionUnassigned.replace("{n}", "1"))).toBeInTheDocument()
  })

  it("the my-tasks chip counts the viewer's open tasks and filters to them", async () => {
    const items = [task("t1", pb1, { assignees: [ann] }), task("t2", pb1, { assignees: [bob] }), task("t3", pb1, { assignees: [ann], status: "done" })]
    stubFetch(routes([sprint("s1", { items })]))
    renderWithProviders(<SprintsPage />)
    const chip = await screen.findByRole("button", { name: t.sprintUxMyOpen.replace("{n}", "1") })
    expect(chip).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(chip)
    expect(currentSearch()).toContain("assignee=me")
  })

  it("groups the list by assignee and remembers the choice", async () => {
    const items = [task("t1", pb1, { assignees: [ann] }), task("t2", pb1, { assignees: [bob] }), task("t3", pb1)]
    stubFetch(routes([sprint("s1", { items })]))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintUxGroupAssignee }))
    expect(screen.getByRole("region", { name: "Alice" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Bob" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: t.sprintUnassigned })).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem("kanflow:sprintListPrefs") ?? "{}")).toMatchObject({ groupBy: "assignee" })
  })

  it("opens the daily scrum in a side panel", async () => {
    stubFetch(routes([sprint("s1")], { [`${BASE}/sprints/s1/daily-scrum`]: [], [`${BASE}/sprints/s1/daily-scrums`]: [] }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintDailyScrum }))
    expect(await screen.findByRole("dialog", { name: t.sprintDailyScrum })).toBeInTheDocument()
  })

  it("an empty tab says so instead of showing nothing", async () => {
    stubFetch(routes([sprint("s1", { status: "active" })]))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("tab", { name: new RegExp(t.sprintUxTabPlanning) }))
    expect(screen.getByText(t.sprintUxNoPlanning)).toBeInTheDocument()
  })

  it("lets a planned sprint be added from the planning tab while one is running", async () => {
    stubFetch(routes([sprint("s1", { status: "active" })]))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("tab", { name: new RegExp(t.sprintUxTabPlanning) }))
    await userEvent.click(screen.getByRole("button", { name: t.sprintUxAddPlanning }))
    expect(await screen.findByText(t.sprintNewSprint)).toBeInTheDocument()
  })

  it("offers Git's suggestions on the running sprint and applies one", async () => {
    const hint = { kind: "complete", action: "complete", pbItemId: "pb1", displayId: 1, title: "Login", taskCount: 1 }
    const { calls } = stubFetch(routes([sprint("s1", { status: "active", items: [task("t1", pb1)] })], {
      [`${BASE}/sprints/s1/git`]: { enabled: true, hints: [hint] },
      [`POST ${BASE}/sprints/s1/git`]: { updated: 1 },
    }))
    renderWithProviders(<SprintsPage />)
    const text = t.sprintUxGitComplete.replace("{n}", "1").replace("{title}", "Login")
    expect(await screen.findByText(text)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintUxGitCompleteAction }))
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/git"))?.body).toEqual({ pbItemId: "pb1", action: "complete" }))
  })

  it("shows no Git panel when the integration is off", async () => {
    stubFetch(routes([sprint("s1", { status: "active", items: [task("t1", pb1)] })], { [`${BASE}/sprints/s1/git`]: { enabled: false, hints: [] } }))
    renderWithProviders(<SprintsPage />)
    await screen.findByText("Task t1")
    expect(screen.queryByRole("region", { name: t.sprintUxGitTitle })).not.toBeInTheDocument()
  })

  it("opens the release note of a sprint from its merged MRs", async () => {
    const note = { enabled: true, text: "# S release notes\n- [!5](https://g/5) do A", mergedCount: 1 }
    stubFetch(routes([sprint("s1", { status: "active", items: [task("t1", pb1)] })], { [`${BASE}/sprints/s1/git?view=release&lang=ja`]: note }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintUxReleaseNote }))
    expect(await screen.findByText(/do A/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.sprintUxReleaseAi })).toBeInTheDocument()
  })

  it("starts a Daily Scrum note from Git activity", async () => {
    stubFetch(routes([sprint("s1")], {
      [`${BASE}/sprints/s1/daily-scrums`]: [],
      [`${BASE}/sprints/s1/git?view=draft&lang=ja`]: { enabled: true, text: "【Git の動き】\n- PBI-1 Login: コミット 2 件" },
    }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintDailyScrum }))
    await userEvent.click(await screen.findByRole("button", { name: t.sprintUxGitDraft }))
    await waitFor(() => expect(screen.getByRole("textbox", { name: new RegExp(t.sprintDailyScrumContentLabel) })).toHaveValue("【Git の動き】\n- PBI-1 Login: コミット 2 件"))
  })
})
