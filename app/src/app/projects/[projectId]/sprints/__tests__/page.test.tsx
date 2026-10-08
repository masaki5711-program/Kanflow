import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { deferred, json, pb, renderWithProviders, sprint, stubFetch, t, task, type Routes } from "./helpers"

const session = vi.hoisted(() => ({ current: { user: { id: "u1", role: "admin" } } as unknown }))

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.current }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/pbi-detail-modal", () => ({
  default: ({ pbiId, onClose }: { pbiId: string; onClose: () => void }) => (
    <div role="dialog" aria-label={`pbi-detail-${pbiId}`}><button onClick={onClose}>close-detail</button></div>
  ),
}))
vi.mock("@/components/ai-result-modal", () => ({
  AIResultModal: ({ onClose, footer }: { onClose: () => void; footer: (text: string, done: boolean) => React.ReactNode }) => (
    <div data-testid="ai-modal">{footer("AI idea", true)}<button onClick={onClose}>close-ai</button></div>
  ),
}))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const pb1 = pb("pb1", { workloadScore: 8, epic: "Epic 1" })

function baseRoutes(sprints: unknown, extra: Routes = {}): Routes {
  return {
    [`${BASE}/sprints`]: sprints,
    [`${BASE}/backlog?status=ready`]: { readyItems: [{ ...pb("pb9"), status: "ready" }] },
    [`${BASE}/events`]: [
      { id: "e1", title: "Review meeting", description: null, date: "2026-09-10T00:00:00.000Z", endDate: null, color: "green", sprintId: "s1", sprint: null },
    ],
    [`${BASE}/members`]: [{ id: "m1", userId: "u1", role: "po", user: { id: "u1", name: "Alice", email: "a@x" } }],
    [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
    ...extra,
  }
}

const toggleLabel = (name: string, status: string) => `${name} — ${t.sprintStatusClickToggle.replace("{status}", status)}`

beforeEach(() => {
  session.current = { user: { id: "u1", role: "admin" } }
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("SprintsPage", () => {
  it("shows a loading skeleton while sprints are in flight", async () => {
    const pending = deferred<Response>()
    stubFetch(baseRoutes(() => pending.promise))
    renderWithProviders(<SprintsPage />)
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    pending.resolve(json([]))
    expect(await screen.findByText(t.sprintNoSprints)).toBeInTheDocument()
  })

  it("toasts the server error when the sprint list fails and falls back to the empty state", async () => {
    stubFetch(baseRoutes(() => json({ error: "DB down" }, 500)))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByText("DB down")).toBeInTheDocument()
    expect(screen.getByText(t.sprintNoSprints)).toBeInTheDocument()
  })

  it("opens the create form from the empty state and creates a sprint", async () => {
    const { calls } = stubFetch(baseRoutes([], { [`POST ${BASE}/sprints`]: { id: "new" } }))
    renderWithProviders(<SprintsPage />)
    await screen.findByText(t.sprintNoSprints)
    const createButtons = screen.getAllByRole("button", { name: t.sprintCreate })
    await userEvent.click(createButtons[createButtons.length - 1])
    expect(await screen.findByText(t.sprintNewSprint)).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText("Sprint-2026-03-W1"), "S-new")
    await userEvent.click(await screen.findByRole("checkbox"))
    await userEvent.click(screen.getByRole("button", { name: t.sprintCreateWithCount.replace("{count}", "1") }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === `${BASE}/sprints`)).toBe(true))
    const post = calls.find((c) => c.method === "POST")!
    expect(post.body).toMatchObject({ sprintName: "S-new", capacity: 10, selectedPbIds: ["pb9"] })
    expect(post.body).not.toHaveProperty("sprintGoal")
    expect(await screen.findByText(t.sprintCreated)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(t.sprintNewSprint)).not.toBeInTheDocument())
  })

  it("shows the blocked message when creating conflicts (409)", async () => {
    stubFetch(baseRoutes([], { [`POST ${BASE}/sprints`]: () => json({ error: "x" }, 409) }))
    renderWithProviders(<SprintsPage />)
    await screen.findByText(t.sprintNoSprints)
    await userEvent.click(screen.getAllByRole("button", { name: t.sprintCreate })[0])
    await userEvent.type(screen.getByPlaceholderText("Sprint-2026-03-W1"), "S")
    await userEvent.click(screen.getByRole("button", { name: t.sprintCreateWithCount.replace("{count}", "0") }))
    expect(await screen.findByText(t.sprintCreateBlocked)).toBeInTheDocument()
    expect(screen.getByText(t.sprintNewSprint)).toBeInTheDocument()
  })

  it("toasts a generic create failure and cancel closes the form", async () => {
    stubFetch(baseRoutes([], { [`POST ${BASE}/sprints`]: () => json({ error: "bad input" }, 400) }))
    renderWithProviders(<SprintsPage />)
    await screen.findByText(t.sprintNoSprints)
    await userEvent.click(screen.getAllByRole("button", { name: t.sprintCreate })[0])
    await userEvent.type(screen.getByPlaceholderText("Sprint-2026-03-W1"), "S")
    await userEvent.click(screen.getByRole("button", { name: t.sprintCreateWithCount.replace("{count}", "0") }))
    expect(await screen.findByText("bad input")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(screen.queryByText(t.sprintNewSprint)).not.toBeInTheDocument()
  })

  it("toggles a task status optimistically and rolls back when the PATCH fails", async () => {
    const patch = deferred<Response>()
    const s1 = sprint("s1", { items: [task("t1", pb1)] })
    const { calls } = stubFetch(baseRoutes([s1], { [`PATCH ${BASE}/sprints/s1/tasks/t1`]: () => patch.promise }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskTodo) }))
    // Optimistic: the row already shows "in progress" while the request is pending.
    expect(screen.getByRole("button", { name: toggleLabel("Task t1", t.taskInProgress) })).toBeInTheDocument()
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "in_progress" })
    patch.resolve(json({ error: "nope" }, 500))
    expect(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskTodo) })).toBeInTheDocument()
    expect(screen.getByText(t.sprintTaskStatusFailed)).toBeInTheDocument()
  })

  it("sends the loaded version and keeps the returned one for the next toggle", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { version: 3 })] })
    let v = 3
    const { calls } = stubFetch(baseRoutes([s1], {
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: () => json({ id: "t1", version: ++v }),
    }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskTodo) }))
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1))
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "in_progress", version: 3 })
    // Next toggle (in_progress → done asks for a completion comment first) uses the new version.
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskInProgress) }))
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: t.sprintTaskCompleteSkip }))
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2))
    expect(calls.filter((c) => c.method === "PATCH")[1].body).toMatchObject({ status: "done", version: 4 })
  })

  it("on a VERSION_CONFLICT rolls back, toasts the conflict message and reloads the sprints", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { version: 3 })] })
    let served = [s1]
    const { calls } = stubFetch(baseRoutes(() => json(served), {
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: () => {
        served = [sprint("s1", { items: [task("t1", pb1, { version: 5, status: "done" })] })]
        return json({ error: "stale", code: "VERSION_CONFLICT", current: { id: "t1", version: 5 } }, 409)
      },
    }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskTodo) }))
    expect(await screen.findByText(t.apiErrVersionConflict)).toBeInTheDocument()
    expect(screen.queryByText(t.sprintTaskStatusFailed)).not.toBeInTheDocument()
    await waitFor(() => expect(calls.filter((c) => c.url === `${BASE}/sprints` && c.method === "GET").length).toBe(2))
    expect(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskDone) })).toBeInTheDocument()
  })

  it("keeps the new status without reloading every sprint when the toggle succeeds", async () => {
    const patch = deferred<Response>()
    const { calls } = stubFetch(baseRoutes([sprint("s1", { items: [task("t1", pb1, { status: "done" })] })], {
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: () => patch.promise,
    }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskDone) }))
    // Leaving "done" asks first.
    expect(await screen.findByText(t.sprintReopenTaskConfirm)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintReopenTaskLabel }))
    patch.resolve(json({ id: "t1", status: "todo" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskTodo) })).toBeInTheDocument()
    // Let the resolved PATCH settle, then make sure the list was fetched only once.
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.filter((c) => c.url === `${BASE}/sprints` && c.method === "GET")).toHaveLength(1)
    expect(screen.getByRole("button", { name: toggleLabel("Task t1", t.taskTodo) })).toBeInTheDocument()
  })

  it("refetches after a status toggle inside a finished sprint (stored score changes)", async () => {
    let sprints = [sprint("s1", { status: "done", items: [task("t1", pb1, { status: "done" })] })]
    const { calls } = stubFetch(baseRoutes(() => json(sprints), {
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: (body: unknown) => {
        sprints = [sprint("s1", { status: "done", items: [task("t1", pb1, { status: (body as { status: string }).status })] })]
        return json({})
      },
    }))
    renderWithProviders(<SprintsPage />)
    // Finished sprints start collapsed.
    const details = await screen.findByRole("button", { name: t.sprintToggleDetails.replace("{name}", "Sprint s1") })
    expect(details).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(details)
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskDone) }))
    // Leaving "done" asks first.
    expect(await screen.findByText(t.sprintReopenTaskConfirm)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintReopenTaskLabel }))
    expect(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskTodo) })).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((c) => c.url === `${BASE}/sprints` && c.method === "GET").length).toBeGreaterThan(1))
  })

  it("expands only in-flight sprints by default", async () => {
    stubFetch(baseRoutes([
      sprint("s1", { status: "planning" }),
      sprint("s2", { status: "active" }),
      sprint("s3", { status: "review" }),
      sprint("s4", { status: "done" }),
    ]))
    renderWithProviders(<SprintsPage />)
    const expanded = (id: string) =>
      screen.getByRole("button", { name: t.sprintToggleDetails.replace("{name}", `Sprint ${id}`) }).getAttribute("aria-expanded")
    await screen.findByText("Sprint s4")
    expect(["s1", "s2", "s3", "s4"].map(expanded)).toEqual(["true", "true", "true", "false"])
  })

  it("requests only READY backlog items for sprint planning", async () => {
    const { calls } = stubFetch(baseRoutes([]))
    renderWithProviders(<SprintsPage />)
    await screen.findByText(t.sprintNoSprints)
    expect(calls.some((c) => c.url === `${BASE}/backlog?status=ready`)).toBe(true)
    expect(calls.some((c) => c.url === `${BASE}/backlog`)).toBe(false)
  })

  it("asks for a completion comment before marking a task done", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { status: "in_progress" })] })
    const { calls } = stubFetch(baseRoutes([s1], { [`PATCH ${BASE}/sprints/s1/tasks/t1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskInProgress) }))
    const dialog = await screen.findByRole("dialog")
    const confirmBtn = within(dialog).getByRole("button", { name: t.sprintTaskCompleteTitle })
    expect(confirmBtn).toBeDisabled()
    await userEvent.type(within(dialog).getByRole("textbox"), " Finished it ")
    await userEvent.click(confirmBtn)
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "done", completionComment: "Finished it" }))
  })

  it("can skip the completion comment", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { status: "in_progress" })] })
    const { calls } = stubFetch(baseRoutes([s1], { [`PATCH ${BASE}/sprints/s1/tasks/t1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: toggleLabel("Task t1", t.taskInProgress) }))
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: t.sprintTaskCompleteSkip }))
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "done", completionComment: null }))
  })

  it("edits the completion comment of a done task and sends a follow-up to the Icebox", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { status: "done", completionComment: "old note" })] })
    const { calls } = stubFetch(baseRoutes([s1], {
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: {},
      [`POST ${BASE}/icebox`]: {},
    }))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByText("old note")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintTaskEditComment }))
    const textarea = screen.getByPlaceholderText(t.sprintTaskCompletionCommentPlaceholder)
    expect(textarea).toHaveValue("old note")
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "   ")
    await userEvent.click(screen.getByRole("checkbox"))
    await userEvent.type(screen.getByPlaceholderText(t.completionToIceboxPlaceholder), "Follow up")
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/icebox"))?.body).toEqual({
      request: "Follow up", background: `(${t.sprintTaskCompletionComment}) Task t1`,
    }))
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ completionComment: null })
    expect(await screen.findByText(t.completionToIceboxSent)).toBeInTheDocument()
  })

  it("toasts failures of completion-comment save and icebox send", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { status: "done", completionComment: "note" })] })
    let patchFails = true
    stubFetch(baseRoutes([s1], {
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: () => (patchFails ? json({ error: "x" }, 500) : json({})),
      [`POST ${BASE}/icebox`]: () => json({ error: "y" }, 500),
    }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintTaskEditComment }))
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    expect(await screen.findByText(t.sprintTaskCommentSaveFailed)).toBeInTheDocument()
    patchFails = false
    await userEvent.click(screen.getByRole("checkbox"))
    await userEvent.type(screen.getByPlaceholderText(t.completionToIceboxPlaceholder), "later")
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    expect(await screen.findByText(t.sprintTaskIceboxFailed)).toBeInTheDocument()
    // Editor stays open because the Icebox send failed.
    expect(screen.getByPlaceholderText(t.completionToIceboxPlaceholder)).toBeInTheDocument()
  })

  it("deletes a sprint only after the confirmation is accepted", async () => {
    const s1 = sprint("s1", { status: "done" })
    const { calls } = stubFetch(baseRoutes([s1], { [`DELETE ${BASE}/sprints/s1`]: () => json(undefined, 204) }))
    renderWithProviders(<SprintsPage />)
    const del = await screen.findByRole("button", { name: t.sprintDeleteNamed.replace("{name}", "Sprint s1") })

    await userEvent.click(del)
    let dlg = await screen.findByRole("alertdialog")
    expect(dlg).toHaveTextContent(t.sprintDeleteFullConfirm)
    await userEvent.click(within(dlg).getByRole("button", { name: t.cancel }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(calls.some((c) => c.method === "DELETE")).toBe(false)
    expect(screen.getByText("Sprint s1")).toBeInTheDocument()

    await userEvent.click(del)
    dlg = await screen.findByRole("alertdialog")
    await userEvent.click(within(dlg).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(screen.queryByText("Sprint s1")).not.toBeInTheDocument())
    expect(calls.some((c) => c.method === "DELETE" && c.url === `${BASE}/sprints/s1`)).toBe(true)
    expect(await screen.findByText(t.sprintDeleted)).toBeInTheDocument()
  })

  it("restores the sprint when the delete request fails", async () => {
    stubFetch(baseRoutes([sprint("s1", { status: "done" })], { [`DELETE ${BASE}/sprints/s1`]: () => json({ error: "locked" }, 409) }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintDeleteNamed.replace("{name}", "Sprint s1") }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    expect(await screen.findByText("locked")).toBeInTheDocument()
    expect(screen.getByText("Sprint s1")).toBeInTheDocument()
  })

  it("starts planning → active after a summary confirm (A3-10), and active → review through the retro dialog", async () => {
    const { calls } = stubFetch(baseRoutes([sprint("s1", { status: "planning", items: [task("t1", pb1)] }), sprint("s2", { status: "active" })], {
      [`PATCH ${BASE}/sprints/s1`]: {},
      [`PATCH ${BASE}/sprints/s2`]: {},
    }))
    renderWithProviders(<SprintsPage />)
    const startButton = await screen.findByRole("button", { name: t.sprintMoveToStatus.replace("{status}", t.sprintStatusActive) })
    await userEvent.click(startButton)
    const confirmStart = await screen.findByRole("alertdialog")
    expect(confirmStart).toHaveTextContent(t.sprintStartConfirmTitle.replace("{name}", "Sprint s1"))
    expect(confirmStart).toHaveTextContent("PBI: 1 件 / タスク: 1 件")
    await userEvent.click(within(confirmStart).getByRole("button", { name: t.cancel }))
    expect(calls.some((c) => c.url === `${BASE}/sprints/s1` && c.method === "PATCH")).toBe(false)

    await userEvent.click(startButton)
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.sprintStartConfirmLabel }))
    await waitFor(() => expect(calls.find((c) => c.url === `${BASE}/sprints/s1`)?.body).toEqual({ status: "active" }))
    expect(await screen.findByText(t.sprintStatusChangedActive.replace("{name}", "Sprint s1"))).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: t.sprintMoveToStatus.replace("{status}", t.sprintStatusReview) }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(t.sprintReviewDialogTitle)).toBeInTheDocument()
    await userEvent.type(within(dialog).getByPlaceholderText(t.sprintKptKeepPlaceholder), "Pairing")
    await userEvent.click(within(dialog).getByRole("button", { name: t.sprintSubmitAndChangeStatus }))
    await waitFor(() => expect(calls.find((c) => c.url === `${BASE}/sprints/s2`)?.body).toMatchObject({ status: "review", retrospectiveKeep: "Pairing", reviewComment: null }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText(t.sprintStatusChangedReview.replace("{name}", "Sprint s2"))).toBeInTheDocument()
  })

  it("keeps the retro dialog open and toasts when the status change fails", async () => {
    stubFetch(baseRoutes([sprint("s2", { status: "active" })], { [`PATCH ${BASE}/sprints/s2`]: () => json({ error: "bad" }, 500) }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintMoveToStatus.replace("{status}", t.sprintStatusDone) }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: t.sprintSubmitAndChangeStatus }))
    expect(await screen.findByText(t.sprintStatusUpdateFailed)).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("opens the retro memo editor for a review sprint and appends AI suggestions to Try", async () => {
    const s = sprint("s1", { status: "review", retrospectiveTry: "Old try", reviewComment: "legacy review", retrospectiveKeep: "k", retrospectiveMemo: "memo" })
    stubFetch(baseRoutes([s], { [`PATCH ${BASE}/sprints/s1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintRetrospectiveMemo }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("legacy review")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: t.aiRetroSynthesis }))
    await userEvent.click(screen.getByRole("button", { name: t.aiAddToTry }))
    expect(within(dialog).getByPlaceholderText(t.sprintKptTryPlaceholder)).toHaveValue(`Old try\n\n${t.sprintKptAiSuggestionHeader}\nAI idea`)
    expect(within(dialog).getByRole("button", { name: t.save })).toBeInTheDocument()
  })

  it("opens the add-task modal from a PBI group and saves a new task", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { assignee: "Alice, Bob", estimatedHours: 3, actualHours: 1 })] })
    const { calls } = stubFetch(baseRoutes([s1], {
      [`POST ${BASE}/sprints/s1/tasks`]: {},
      [`${BASE}/backlog/pb1`]: { id: "pb1", initiative: "I", epic: null, userStory: null, acceptanceCriteria: null, referenceDoc: null, workloadScore: 8, status: "ready", assignedPo: null, poNote: null },
      "/api/user/fixed-tasks": [],
    }))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByText("Bob")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintAddTaskShort }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByPlaceholderText(t.taskNamePlaceholder), "Write docs")
    await userEvent.click(within(dialog).getByRole("button", { name: t.add }))
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ pbItemId: "pb1", taskName: "Write docs", assigneeIds: [], estimatedHours: null }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("bulk-adds fixed tasks from the task modal", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1)] })
    let failOne = false
    const { calls } = stubFetch(baseRoutes([s1], {
      [`POST ${BASE}/sprints/s1/tasks`]: (body: unknown) =>
        failOne && (body as { taskName: string }).taskName === "B" ? json({ error: "x" }, 500) : json({}),
      [`${BASE}/backlog/pb1`]: () => json({ error: "gone" }, 404),
      "/api/user/fixed-tasks": [{ id: "g1", taskName: "Release", items: [{ id: "i1", taskName: "A" }, { id: "i2", taskName: "B" }] }],
    }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintAddTaskShort }))
    let dialog = await screen.findByRole("dialog")
    await userEvent.selectOptions(await within(dialog).findByLabelText(t.fixedTasksApplyFromTemplate), "g1")
    await userEvent.click(within(dialog).getByRole("button", { name: `${t.fixedTasksBulkAdd} (2)` }))
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(2))
    expect(await screen.findByText(t.sprintTaskBulkAdded.replace("{count}", "2"))).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    failOne = true
    await userEvent.click(screen.getByRole("button", { name: t.sprintAddTaskShort }))
    dialog = await screen.findByRole("dialog")
    await userEvent.selectOptions(await within(dialog).findByLabelText(t.fixedTasksApplyFromTemplate), "g1")
    await userEvent.click(within(dialog).getByRole("button", { name: `${t.fixedTasksBulkAdd} (2)` }))
    expect(await screen.findByText(`${t.sprintAddFailed}: 1/2`)).toBeInTheDocument()
  })

  it("edits an existing task and toasts when the update fails", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1)] })
    stubFetch(baseRoutes([s1], {
      [`PATCH ${BASE}/sprints/s1/tasks/t1`]: () => json({ error: "conflict" }, 409),
      [`${BASE}/backlog/pb1`]: () => json({ error: "gone" }, 404),
    }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintTaskEditNamed.replace("{name}", "Task t1") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(t.sprintTaskEdit)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: t.update }))
    expect(await screen.findByText(t.sprintUpdateFailed)).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("deletes a task after confirmation and rolls back on failure", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1)] })
    stubFetch(baseRoutes([s1], { [`DELETE ${BASE}/sprints/s1/tasks/t1`]: () => json({ error: "x" }, 500) }))
    renderWithProviders(<SprintsPage />)
    const del = await screen.findByRole("button", { name: t.sprintTaskDeleteNamed.replace("{name}", "Task t1") })
    await userEvent.click(del)
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.cancel }))
    await userEvent.click(del)
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    expect(await screen.findByText(t.sprintTaskDeleteFailed)).toBeInTheDocument()
    expect(screen.getByText("Task t1")).toBeInTheDocument()
  })

  it("deletes a task with ?version= of the loaded row", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1, { version: 7 })] })
    const { calls } = stubFetch(baseRoutes([s1], { [`DELETE ${BASE}/sprints/s1/tasks/t1?version=7`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintTaskDeleteNamed.replace("{name}", "Task t1") }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("?version=7"))).toBe(true))
  })

  it("deletes a task successfully", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1)] })
    const { calls } = stubFetch(baseRoutes([s1], { [`DELETE ${BASE}/sprints/s1/tasks/t1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintTaskDeleteNamed.replace("{name}", "Task t1") }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true))
  })

  it("removes a PBI from the sprint after confirmation, toasting failures", async () => {
    const s1 = sprint("s1", { items: [task("t1", pb1)] })
    let fail = true
    const { calls } = stubFetch(baseRoutes([s1], { [`DELETE ${BASE}/sprints/s1/pbis`]: () => (fail ? json({ error: "x" }, 500) : json({})) }))
    renderWithProviders(<SprintsPage />)
    const btn = await screen.findByRole("button", { name: `${t.sprintRemovePbi}: #1` })
    await userEvent.click(btn)
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.cancel }))
    await userEvent.click(btn)
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    expect(await screen.findByText(t.sprintRemovePbiFailed)).toBeInTheDocument()
    fail = false
    await userEvent.click(btn)
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(2))
    expect(calls.find((c) => c.method === "DELETE")?.body).toEqual({ pbItemId: "pb1" })
  })

  it("opens the PBI detail and the add-PBI modal", async () => {
    stubFetch(baseRoutes([sprint("s1", { items: [task("t1", pb1)] })]))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: `${t.edit}: #1` }))
    expect(screen.getByRole("dialog", { name: "pbi-detail-pb1" })).toBeInTheDocument()
    await userEvent.click(screen.getByText("close-detail"))
    await userEvent.click(screen.getAllByRole("button", { name: t.sprintAddPbi })[0])
    expect(await screen.findByText(t.sprintAddPbiTitle)).toBeInTheDocument()
  })

  it("collapses a sprint card and expands the daily scrum section", async () => {
    stubFetch(baseRoutes([sprint("s1", { sprintGoal: "Ship it", items: [task("t1", pb1)] })], {
      [`${BASE}/sprints/s1/daily-scrums`]: [],
    }))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByText("Ship it")).toBeInTheDocument()
    expect(screen.getByText("Review meeting")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintDailyScrum }))
    expect(await screen.findByText(t.sprintDailyScrumEmpty)).toBeInTheDocument()
    const toggle = screen.getByRole("button", { name: t.sprintToggleDetails.replace("{name}", "Sprint s1") })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Task t1")).not.toBeInTheDocument()
  })

  it("lists archived sprints collapsed with a toggle and shows the average score", async () => {
    stubFetch(baseRoutes([sprint("s1", { status: "archived", actualScore: 10 }), sprint("s2", { status: "done", actualScore: 20 })]))
    renderWithProviders(<SprintsPage />)
    await screen.findByText("Sprint s2")
    expect(screen.getByText(`${t.sprintAvgScore.replace("{count}", "2")}: 15`, { exact: false })).toBeInTheDocument()
    const section = screen.getByRole("region", { name: t.sprintArchivedSprints })
    const toggle = within(section).getAllByRole("button")[0]
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Sprint s1")).not.toBeInTheDocument()
    await userEvent.click(toggle)
    expect(screen.getByText("Sprint s1")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.sprintToggleDetails.replace("{name}", "Sprint s1") }))
    expect(screen.getAllByText(t.sprintNoTasks).length).toBeGreaterThan(0)
  })

  it("edits a sprint through the edit dialog", async () => {
    const { calls } = stubFetch(baseRoutes([sprint("s1", { sprintGoal: "Goal" })], { [`PATCH ${BASE}/sprints/s1`]: {} }))
    renderWithProviders(<SprintsPage />)
    await userEvent.click(await screen.findByRole("button", { name: t.sprintEditMenu }))
    const dialog = await screen.findByRole("dialog")
    const name = within(dialog).getByDisplayValue("Sprint s1")
    await userEvent.clear(name)
    await userEvent.type(name, "Renamed")
    await userEvent.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ sprintName: "Renamed", sprintGoal: "Goal", capacity: 20 }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("shows the view-only PBI button for plain members", async () => {
    session.current = { user: { id: "u2" } }
    stubFetch(baseRoutes([sprint("s1", { items: [task("t1", pb1)] })]))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByRole("button", { name: `${t.view}: #1` })).toBeInTheDocument()
  })
})
