import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { ActiveSprint } from "../types"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/ai-result-modal", () => ({
  AIResultModal: ({ title, fetchUrl, fetchBody, onClose }: { title: string; fetchUrl: string; fetchBody: unknown; onClose: () => void }) => (
    <div role="dialog" aria-label={title}>
      <span>{fetchUrl}</span>
      <span>{JSON.stringify(fetchBody)}</span>
      <button onClick={onClose}>close-ai</button>
    </div>
  ),
}))

const { ProgressEditor } = await import("../progress-editor")
const { DescriptionEditor } = await import("../description-editor")
const { ProductGoals } = await import("../product-goals")
const { OverviewCards } = await import("../overview-cards")
const { ActiveSprintCard } = await import("../active-sprint-card")
const { DashboardHeader } = await import("../dashboard-header")
const ja = tr("ja")

afterEach(() => vi.unstubAllGlobals())

describe("ProgressEditor", () => {
  it("is read-only for non-PO users", () => {
    renderWithProviders(<ProgressEditor projectId="p1" initialProgress={140} canEdit={false} />)
    expect(screen.getByText(ja.dashboardProgressSetByPo)).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("PO edits and saves a clamped value inline without a success toast", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => jsonResponse({}) }])
    renderWithProviders(<ProgressEditor projectId="p1" initialProgress={30} canEdit />)
    await user.click(screen.getByRole("button", { name: new RegExp(ja.projectProgress) }))
    const num = screen.getByRole("spinbutton", { name: ja.dashboardProgressPercent })
    await user.clear(num)
    await user.type(num, "75")
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75")
    await user.click(screen.getByRole("button", { name: ja.save }))
    await waitFor(() => expect(screen.getByRole("button", { name: new RegExp(`${ja.projectProgress}: 75%`) })).toBeInTheDocument())
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ progressPct: 75 })
    expect(screen.queryByText(ja.saved)).not.toBeInTheDocument()
  })

  it("keeps editing and toasts when saving fails; cancel restores", async () => {
    const user = userEvent.setup()
    stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => jsonResponse({ error: "denied" }, 403) }])
    renderWithProviders(<ProgressEditor projectId="p1" initialProgress={10} canEdit />)
    await user.click(screen.getByRole("button", { name: new RegExp(ja.projectProgress) }))
    await user.click(screen.getByRole("button", { name: ja.save }))
    expect(await screen.findByText("denied")).toBeInTheDocument()
    expect(screen.getByRole("spinbutton")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: ja.cancel }))
    expect(screen.getByRole("button", { name: new RegExp(`${ja.projectProgress}: 10%`) })).toBeInTheDocument()
  })
})

describe("DescriptionEditor", () => {
  let addSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { addSpy = vi.spyOn(window, "addEventListener") })
  afterEach(() => addSpy.mockRestore())

  const beforeUnloadRegistered = () => addSpy.mock.calls.some((c) => c[0] === "beforeunload")

  it("shows the placeholder when empty and guards unsaved edits", async () => {
    const user = userEvent.setup()
    renderWithProviders(<DescriptionEditor projectId="p1" initialDescription={null} i18n={undefined} onI18nChange={vi.fn()} />)
    expect(screen.getByText(ja.dashboardDescriptionPlaceholder)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: ja.edit }))
    expect(beforeUnloadRegistered()).toBe(false)
    await user.type(screen.getByRole("textbox", { name: ja.dashboardDescription }), "Hello")
    expect(beforeUnloadRegistered()).toBe(true)
    const ev = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    await user.click(screen.getByRole("button", { name: ja.cancel }))
    expect(screen.getByText(ja.dashboardDescriptionPlaceholder)).toBeInTheDocument()
  })

  it("saves, drops stale translation and shows the stored text", async () => {
    const user = userEvent.setup()
    const onI18nChange = vi.fn()
    stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => jsonResponse({ description: "Stored" }) }])
    renderWithProviders(<DescriptionEditor projectId="p1" initialDescription="Old" i18n={{ name: { ja: "N" } } as never} onI18nChange={onI18nChange} />)
    await user.click(screen.getByRole("button", { name: ja.edit }))
    const box = screen.getByRole("textbox")
    expect(box).toHaveValue("Old")
    await user.clear(box)
    await user.type(box, "New")
    await user.click(screen.getByRole("button", { name: ja.save }))
    expect(await screen.findByText("Stored")).toBeInTheDocument()
    expect(onI18nChange).toHaveBeenCalledWith({ name: { ja: "N" }, description: undefined })
  })

  it("does not reset translation when text is unchanged and reports errors", async () => {
    const user = userEvent.setup()
    const onI18nChange = vi.fn()
    let failing = false
    stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => (failing ? jsonResponse({ error: "bad" }, 500) : new Response(null, { status: 204 })) }])
    renderWithProviders(<DescriptionEditor projectId="p1" initialDescription="Same" i18n={undefined} onI18nChange={onI18nChange} />)
    await user.click(screen.getByRole("button", { name: ja.edit }))
    await user.click(screen.getByRole("button", { name: ja.save }))
    await waitFor(() => expect(screen.getByRole("button", { name: ja.edit })).toBeInTheDocument())
    expect(onI18nChange).not.toHaveBeenCalled()

    failing = true
    await user.click(screen.getByRole("button", { name: ja.edit }))
    await user.click(screen.getByRole("button", { name: ja.save }))
    expect(await screen.findByText("bad")).toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })
})

describe("ProductGoals + GoalFormModal", () => {
  const goals = [{ id: "g1", title: "Ship v1", description: "desc one" }, { id: "g2", title: "Grow", description: null }]

  it("shows empty state and adds a goal", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([{ match: "/api/projects/p1/goals", method: "POST", respond: () => jsonResponse({ id: "g9", title: "New goal", description: "" }) }])
    renderWithProviders(<ProductGoals projectId="p1" initialGoals={[]} />)
    expect(screen.getByText(ja.dashboardNoGoals)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: ja.dashboardAddGoal }))
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(ja.dashboardProductGoals) }), "New goal")
    await user.click(within(dialog).getByRole("button", { name: ja.add }))
    expect(await screen.findByText("New goal")).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][1]!.method).toBe("POST")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("edits a goal via PATCH", async () => {
    const user = userEvent.setup()
    stubFetch([{ match: "/api/projects/p1/goals/g1", method: "PATCH", respond: () => jsonResponse({ id: "g1", title: "Ship v2", description: "d" }) }])
    renderWithProviders(<ProductGoals projectId="p1" initialGoals={goals} />)
    expect(screen.getByText("desc one")).toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: ja.edit })[0])
    const dialog = screen.getByRole("dialog")
    const title = within(dialog).getByRole("textbox", { name: new RegExp(ja.dashboardProductGoals) })
    expect(title).toHaveValue("Ship v1")
    await user.clear(title)
    await user.type(title, "Ship v2")
    await user.click(within(dialog).getByRole("button", { name: ja.update }))
    expect(await screen.findByText("Ship v2")).toBeInTheDocument()
    expect(screen.queryByText("Ship v1")).not.toBeInTheDocument()
  })

  it("toasts when saving the goal fails and keeps the modal open", async () => {
    const user = userEvent.setup()
    stubFetch([{ match: "/api/projects/p1/goals", method: "POST", respond: () => jsonResponse({ error: "invalid" }, 400) }])
    renderWithProviders(<ProductGoals projectId="p1" initialGoals={[]} />)
    await user.click(screen.getByRole("button", { name: ja.dashboardAddGoal }))
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(ja.dashboardProductGoals) }), "x")
    await user.click(within(dialog).getByRole("button", { name: ja.add }))
    expect(await screen.findByText("invalid")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("asks to discard unsaved changes when cancelling a dirty goal form", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ProductGoals projectId="p1" initialGoals={[]} />)
    await user.click(screen.getByRole("button", { name: ja.dashboardAddGoal }))
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(ja.dashboardProductGoals) }), "draft")
    await user.click(within(dialog).getByRole("button", { name: ja.cancel }))
    const confirm = await screen.findByRole("alertdialog")
    await user.click(within(confirm).getAllByRole("button").find((b) => b.textContent !== ja.cancel)!)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("confirms before deleting and rolls back on failure", async () => {
    const user = userEvent.setup()
    let failing = true
    stubFetch([{ match: /goals\/g1$/, method: "DELETE", respond: () => (failing ? jsonResponse({ error: "locked" }, 409) : jsonResponse({})) }])
    renderWithProviders(<ProductGoals projectId="p1" initialGoals={goals} />)

    await user.click(screen.getAllByRole("button", { name: ja.delete })[0])
    let confirm = await screen.findByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: ja.cancel }))
    expect(screen.getByText("Ship v1")).toBeInTheDocument()

    await user.click(screen.getAllByRole("button", { name: ja.delete })[0])
    confirm = await screen.findByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: ja.delete }))
    expect(await screen.findByText("locked")).toBeInTheDocument()
    expect(screen.getByText("Ship v1")).toBeInTheDocument()

    failing = false
    await user.click(screen.getAllByRole("button", { name: ja.delete })[0])
    confirm = await screen.findByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: ja.delete }))
    await waitFor(() => expect(screen.queryByText("Ship v1")).not.toBeInTheDocument())
  })
})

describe("OverviewCards", () => {
  it.each(["ja", "en", "id"] as const)("links counters to their pages (%s)", (lang) => {
    renderWithProviders(<OverviewCards projectId="p1" iceboxCount={3} backlogCount={5} sprintCount={2} />, { language: lang })
    expect(screen.getByRole("heading", { name: tr(lang).dashboardOverview })).toBeInTheDocument()
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual(["/projects/p1/icebox", "/projects/p1/backlog", "/projects/p1/sprints"])
    expect(screen.getAllByRole("link").map((a) => a.textContent?.replace(/\D/g, ""))).toEqual(["3", "5", "2"])
  })
})

describe("ActiveSprintCard", () => {
  const sprint: ActiveSprint = {
    id: "s1", name: "Sprint 7", goal: "Finish login", startDate: "2026-09-01T00:00:00Z", endDate: "2026-09-14T00:00:00Z",
    capacity: 20, taskCounts: { todo: 1, inProgress: 1, done: 2 },
  }

  it("shows the empty state without an active sprint", () => {
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={null} />, { language: "en" })
    expect(screen.getByText(tr("en").dashboardNoActiveSprint)).toBeInTheDocument()
  })

  it("summarises tasks with a progress bar", () => {
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={sprint} />)
    expect(screen.getByRole("link")).toHaveAttribute("href", "/projects/p1/sprints")
    expect(screen.getByText("Sprint 7")).toBeInTheDocument()
    expect(screen.getByText("Finish login")).toBeInTheDocument()
    expect(screen.getByText(/2026\/09\/01 ~ 2026\/09\/14/)).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50")
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("handles a sprint with no tasks and no goal", () => {
    renderWithProviders(<ActiveSprintCard projectId="p1" sprint={{ ...sprint, goal: null, taskCounts: { todo: 0, inProgress: 0, done: 0 } }} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
    expect(screen.queryByText("Finish login")).not.toBeInTheDocument()
  })
})

describe("DashboardHeader", () => {
  it("falls back to the streaming AI progress report when no job runner exists (503), and links to the report", async () => {
    const user = userEvent.setup()
    const en = tr("en")
    stubFetch([
      {
        match: "/api/projects/p1/ai/jobs",
        method: "POST",
        respond: () => jsonResponse({ error: "disabled", code: "SERVICE_UNAVAILABLE", reason: "ai_jobs_disabled" }, 503),
      },
    ])
    renderWithProviders(<DashboardHeader projectId="p1" />, { language: "en" })
    expect(screen.getByRole("heading", { level: 1, name: en.dashboardTitle })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: en.reportTitle })).toHaveAttribute("href", "/projects/p1/report")
    await user.click(screen.getByRole("button", { name: new RegExp(en.aiProgressReport) }))
    const dialog = await screen.findByRole("dialog", { name: en.aiProgressReportTitle })
    expect(dialog).toHaveTextContent("/api/projects/p1/ai/progress-report")
    expect(dialog).toHaveTextContent('{"lang":"en"}')
    await user.click(screen.getByText("close-ai"))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("DashboardHeader — background progress report", () => {
  const job = (status: string, progress: number | null = null) => ({
    id: "j1", kind: "progress_report", status, progress, params: { lang: "ja" }, resultReportId: status === "done" ? "r1" : null,
    error: null, requestedBy: { id: "u1", name: "Alice" }, createdAt: "", startedAt: null, finishedAt: null,
  })

  it("queues a job, shows its status chip and tells the user when it is ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let status = "queued"
    const fetchMock = stubFetch([
      { match: "/api/projects/p1/ai/jobs", method: "POST", respond: () => jsonResponse({ job: job("queued"), deduped: false }, 202) },
      { match: "/api/projects/p1/ai/jobs/j1", method: "GET", respond: () => jsonResponse(job(status, status === "running" ? 40 : null)) },
    ])
    const changed = vi.fn()
    window.addEventListener("kanflow:ai-reports-changed", changed)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<DashboardHeader projectId="p1" />)
    const button = screen.getByRole("button", { name: new RegExp(ja.aiProgressReport) })
    await user.click(button)

    expect(await screen.findByText(ja.aiJobStarted)).toBeInTheDocument()
    expect(screen.getAllByRole("status").some((el) => el.textContent?.includes(ja.aiJobStatusQueued))).toBe(true)
    expect(button).toBeDisabled()
    const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST")!
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ kind: "progress_report", lang: "ja" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    status = "running"
    await vi.advanceTimersByTimeAsync(4000)
    await waitFor(() => expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("40%"))).toBe(true))
    status = "done"
    await vi.advanceTimersByTimeAsync(4000)
    expect(await screen.findByText(ja.aiJobDone)).toBeInTheDocument()
    expect(changed).toHaveBeenCalled()
    expect(button).toBeEnabled()
    window.removeEventListener("kanflow:ai-reports-changed", changed)
    vi.useRealTimers()
  })

  it("says so when the same report is already being generated", async () => {
    stubFetch([
      { match: "/api/projects/p1/ai/jobs", method: "POST", respond: () => jsonResponse({ job: job("running", 10), deduped: true }, 202) },
      { match: "/api/projects/p1/ai/jobs/j1", method: "GET", respond: () => jsonResponse(job("running", 10)) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<DashboardHeader projectId="p1" />)
    await user.click(screen.getByRole("button", { name: new RegExp(ja.aiProgressReport) }))
    expect(await screen.findByText(ja.aiJobAlreadyRunning)).toBeInTheDocument()
  })

  it("shows an error toast when the job cannot be queued", async () => {
    stubFetch([{ match: "/api/projects/p1/ai/jobs", method: "POST", respond: () => jsonResponse({ error: "x" }, 500) }])
    const user = userEvent.setup()
    renderWithProviders(<DashboardHeader projectId="p1" />)
    await user.click(screen.getByRole("button", { name: new RegExp(ja.aiProgressReport) }))
    expect(await screen.findByText(ja.aiJobStartFailed)).toBeInTheDocument()
  })
})
