import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LiveAnnouncer, resetAnnouncer } from "@/components/live-announcer"
import { deferred, json, pb, renderWithProviders, sprint, stubFetch, t, task, type Routes } from "./helpers"
import { PATHNAME, currentSearch, replaceMock, resetNavigation, setSearch } from "./nav-mock"

const session = vi.hoisted(() => ({ current: { user: { id: "u1", role: "admin" } } as unknown }))

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.current }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/pbi-detail-modal", () => ({ default: () => null }))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const pb1 = pb("pb1", { displayId: 12, initiative: "Login page" })
const pb2 = pb("pb2", { displayId: 7, initiative: "Export" })
const TASKS_URL = `${BASE}/sprints/s1/tasks`

const MEMBERS = [
  { id: "m1", userId: "u1", role: "dev", user: { id: "u1", name: "Alice", email: "a@x" } },
  { id: "m2", userId: "u2", role: "dev", user: { id: "u2", name: "Bob", email: "b@x" } },
]

function sprintWithTasks() {
  return sprint("s1", {
    items: [
      task("t1", pb1, { version: 3, assignees: [{ id: "u1", name: "Alice" }], estimatedHours: 2 }),
      task("t2", pb2, { status: "in_progress", assignees: [{ id: "u2", name: "Bob" }], estimatedHours: 1.5 }),
      task("t3", pb1, { status: "done", estimatedHours: 3, actualHours: 2 }),
    ],
  })
}

function baseRoutes(sprints: unknown, extra: Routes = {}): Routes {
  return {
    [`${BASE}/sprints`]: sprints,
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: MEMBERS,
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

function renderPage() {
  return renderWithProviders(<><SprintsPage /><LiveAnnouncer /></>)
}

const cellOf = (column: string) => screen.getByRole("group", { name: column })
const cardName = (name: string, column: string) => t.sprintBoardCardLabel.replace("{name}", name).replace("{column}", column)
const findCard = (name: string, column: string) => screen.findByRole("listitem", { name: cardName(name, column) })
const announcer = () => screen.getByTestId("live-announcer")

beforeEach(() => {
  session.current = { user: { id: "u1", role: "admin" } }
  resetNavigation()
  resetAnnouncer()
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sprint view state", () => {
  it("shows the list by default and switches to the board via URL + per-user preference", async () => {
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    const listButton = await screen.findByRole("button", { name: t.sprintBoardViewList })
    expect(listButton).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("region", { name: t.sprintBoardLabel.replace("{name}", "Sprint s1") })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: t.sprintBoardViewBoard }))
    expect(replaceMock).toHaveBeenLastCalledWith(`${PATHNAME}?view=board`, { scroll: false })
    expect(window.localStorage.getItem("kanflow:sprintView:u1")).toBe("board")
    expect(await screen.findByRole("region", { name: t.sprintBoardLabel.replace("{name}", "Sprint s1") })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: t.sprintBoardViewList }))
    expect(replaceMock).toHaveBeenLastCalledWith(PATHNAME, { scroll: false })
    expect(window.localStorage.getItem("kanflow:sprintView:u1")).toBe("list")
  })

  it("uses the remembered view when the URL has none", async () => {
    window.localStorage.setItem("kanflow:sprintView:u1", "board")
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    expect(await findCard("Task t1", t.taskTodo)).toBeInTheDocument()
  })

  it("renders columns with counts and hour sums", async () => {
    setSearch("view=board")
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    await findCard("Task t1", t.taskTodo)
    const todoHeading = screen.getByRole("heading", { name: new RegExp(`^${t.taskTodo}`) })
    expect(todoHeading).toHaveTextContent(t.sprintBoardColumnCount.replace("{count}", "1"))
    expect(within(cellOf(t.taskDone)).getByText("Task t3")).toBeInTheDocument()
    expect(within(cellOf(t.taskInProgress)).getByText("Bob")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: new RegExp(`^${t.taskDone}`) }).nextElementSibling)
      .toHaveTextContent(`${t.sprintEstimatedHoursShort} 3 · ${t.sprintActualHoursShort} 2 ${t.sprintHoursUnit}`)
    // Task hours are hours, never the project's point unit.
    expect(screen.queryByText(/SP/)).not.toBeInTheDocument()
    // Parent PBI reference on the card.
    expect(within(cellOf(t.taskTodo)).getByText("#12")).toBeInTheDocument()
  })

  it("groups the board into swimlanes by assignee", async () => {
    setSearch("view=board&swim=assignee")
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    await findCard("Task t1", t.taskTodo)
    expect(screen.getByRole("group", { name: `${t.taskTodo} — Alice` })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: `${t.taskInProgress} — Bob` })).toBeInTheDocument()
    expect(within(screen.getByRole("group", { name: `${t.taskDone} — ${t.sprintUnassigned}` })).getByText("Task t3")).toBeInTheDocument()
  })
})

describe("filters", () => {
  it("filters the list by ?assignee=me and clears the filter", async () => {
    setSearch("assignee=me")
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    expect(await screen.findByText("Task t1")).toBeInTheDocument()
    expect(screen.queryByText("Task t2")).not.toBeInTheDocument()
    expect(screen.getByText(t.sprintBoardFilterCount.replace("{shown}", "1").replace("{total}", "3"))).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintBoardFilterClear }))
    expect(currentSearch()).toBe("")
    expect(await screen.findByText("Task t2")).toBeInTheDocument()
  })

  it("writes the assignee choice and (debounced) text to the URL", async () => {
    setSearch("view=board")
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    await findCard("Task t1", t.taskTodo)
    await userEvent.selectOptions(screen.getByLabelText(t.sprintBoardFilterAssignee), "u2")
    expect(currentSearch()).toBe("view=board&assignee=u2")
    expect(await findCard("Task t2", t.taskInProgress)).toBeInTheDocument()
    expect(screen.queryByText("Task t1")).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(t.sprintBoardFilterAssignee), "")
    await userEvent.type(screen.getByLabelText(t.sprintBoardFilterText), "login")
    await waitFor(() => expect(currentSearch()).toBe("view=board&q=login"))
    expect(await findCard("Task t1", t.taskTodo)).toBeInTheDocument()
    expect(screen.queryByText("Task t2")).not.toBeInTheDocument()
  })

  it("shows an empty state when nothing matches", async () => {
    setSearch("view=board&q=zzz")
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    expect(await screen.findByText(t.sprintBoardNoMatch)).toBeInTheDocument()
  })
})

describe("moving cards", () => {
  beforeEach(() => setSearch("view=board"))

  it("moves a card with the keyboard, announces each step and keeps focus on it", async () => {
    const { calls } = stubFetch(baseRoutes([sprintWithTasks()], {
      [`PATCH ${TASKS_URL}/t1`]: () => json({ id: "t1", version: 4 }),
    }))
    renderPage()
    const card = await findCard("Task t1", t.taskTodo)
    card.focus()
    await userEvent.keyboard(" ")
    expect(announcer()).toHaveTextContent(t.sprintBoardPickedUp.replace("{name}", "Task t1").split("{column}")[0].trim())
    await userEvent.keyboard("{ArrowRight}")
    expect(announcer()).toHaveTextContent(
      t.sprintBoardOverColumn.replace("{column}", t.taskInProgress).replace("{position}", "2").replace("{total}", "3"),
    )
    expect(within(cellOf(t.taskInProgress)).getByText(t.sprintBoardDropHere)).toBeInTheDocument()
    await userEvent.keyboard(" ")
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "in_progress", version: 3 }))
    const moved = await findCard("Task t1", t.taskInProgress)
    expect(within(cellOf(t.taskInProgress)).getByText("Task t1")).toBeInTheDocument()
    await waitFor(() => expect(moved).toHaveFocus())
    expect(announcer()).toHaveTextContent(t.sprintBoardDropped.replace("{name}", "Task t1").replace("{column}", t.taskInProgress))
  })

  it("Escape cancels a keyboard move without a request", async () => {
    const { calls } = stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    const card = await findCard("Task t1", t.taskTodo)
    card.focus()
    await userEvent.keyboard(" {ArrowRight}{Escape}")
    expect(announcer()).toHaveTextContent(t.sprintBoardCancelled.replace("{name}", "Task t1"))
    expect(screen.queryByText(t.sprintBoardDropHere)).not.toBeInTheDocument()
    expect(calls.some((c) => c.method === "PATCH")).toBe(false)
    expect(card).toHaveFocus()
  })

  it("dropping into Done asks for the completion comment first", async () => {
    const { calls } = stubFetch(baseRoutes([sprintWithTasks()], { [`PATCH ${TASKS_URL}/t2`]: () => json({ id: "t2" }) }))
    renderPage()
    const card = await findCard("Task t2", t.taskInProgress)
    card.focus()
    await userEvent.keyboard(" {ArrowRight} ")
    const dialog = await screen.findByRole("dialog")
    expect(calls.some((c) => c.method === "PATCH")).toBe(false)
    await userEvent.click(within(dialog).getByRole("button", { name: t.sprintTaskCompleteSkip }))
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ status: "done" }))
    expect(await findCard("Task t2", t.taskDone)).toBeInTheDocument()
  })

  it("reverts the optimistic move and toasts when the update fails", async () => {
    const patch = deferred<Response>()
    stubFetch(baseRoutes([sprintWithTasks()], { [`PATCH ${TASKS_URL}/t1`]: () => patch.promise }))
    renderPage()
    const card = await findCard("Task t1", t.taskTodo)
    card.focus()
    await userEvent.keyboard(" {ArrowRight} ")
    // Optimistic: already in the new column while the request is pending.
    expect(await findCard("Task t1", t.taskInProgress)).toBeInTheDocument()
    patch.resolve(json({ error: "nope" }, 500))
    expect(await findCard("Task t1", t.taskTodo)).toBeInTheDocument()
    expect(screen.getByText(t.sprintTaskStatusFailed)).toBeInTheDocument()
  })

  it("on a version conflict toasts the conflict and reloads the sprints", async () => {
    let served = [sprintWithTasks()]
    const { calls } = stubFetch(baseRoutes(() => json(served), {
      [`PATCH ${TASKS_URL}/t1`]: () => {
        served = [sprint("s1", { items: [task("t1", pb1, { version: 9, status: "done" })] })]
        return json({ error: "stale", code: "VERSION_CONFLICT", current: { id: "t1", version: 9 } }, 409)
      },
    }))
    renderPage()
    const card = await findCard("Task t1", t.taskTodo)
    card.focus()
    await userEvent.keyboard(" {ArrowRight} ")
    expect(await screen.findByText(t.apiErrVersionConflict)).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.url === `${BASE}/sprints`)).toHaveLength(2))
    expect(await findCard("Task t1", t.taskDone)).toBeInTheDocument()
  })

  it("moves a card from its move-to menu (touch alternative)", async () => {
    const { calls } = stubFetch(baseRoutes([sprintWithTasks()], { [`PATCH ${TASKS_URL}/t1`]: () => json({ id: "t1", version: 4 }) }))
    renderPage()
    await findCard("Task t1", t.taskTodo)
    await userEvent.click(screen.getByRole("button", { name: t.sprintBoardMoveTo.replace("{name}", "Task t1") }))
    await userEvent.click(screen.getByRole("button", { name: t.taskInProgress }))
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "in_progress", version: 3 }))
    expect(await findCard("Task t1", t.taskInProgress)).toBeInTheDocument()
    // The menu never opened the task dialog.
    expect(screen.queryByText(t.sprintTaskEdit)).not.toBeInTheDocument()
  })

  it("drags a card with the mouse to another column", async () => {
    const { calls } = stubFetch(baseRoutes([sprintWithTasks()], { [`PATCH ${TASKS_URL}/t1`]: () => json({ id: "t1", version: 4 }) }))
    renderPage()
    const card = await findCard("Task t1", t.taskTodo)
    const target = cellOf(t.taskInProgress)
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target })
    // jsdom has no PointerEvent: a MouseEvent named "pointerdown" carries button / coordinates.
    act(() => { card.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 })) })
    act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: 200, clientY: 20 })) })
    expect(within(target).getByText(t.sprintBoardDropHere)).toBeInTheDocument()
    act(() => { window.dispatchEvent(new MouseEvent("pointerup", { clientX: 200, clientY: 20 })) })
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "in_progress", version: 3 }))
    expect(await findCard("Task t1", t.taskInProgress)).toBeInTheDocument()
    Reflect.deleteProperty(document, "elementFromPoint")
  })

  it("a plain click opens the task edit dialog", async () => {
    stubFetch(baseRoutes([sprintWithTasks()]))
    renderPage()
    await userEvent.click(await findCard("Task t1", t.taskTodo))
    expect(await screen.findByText(t.sprintTaskEdit)).toBeInTheDocument()
  })
})
