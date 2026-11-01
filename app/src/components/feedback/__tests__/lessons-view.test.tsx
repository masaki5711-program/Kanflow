import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import { getTranslations } from "@/lib/i18n"
import { LessonsView } from "../lessons-view"
import type { LessonListView, LessonView, MetricsView } from "../feedback-types"

stubLayout()

const t = getTranslations("en")

function lesson(over: Partial<LessonView>): LessonView {
  return {
    id: "l1",
    signature: "a".repeat(64),
    scope: "global",
    state: "draft",
    symptom: "cargo test hangs on the lock",
    cause: "stale runner",
    fix: "restart the runner",
    verify: "cargo test -p forge-db",
    evidence: ["https://gitlab.example.test/mr/1"],
    errorCode: "FG-DB-0007",
    confidential: false,
    hits: 5,
    resolvedCount: 2,
    lastSeenAt: "2026-10-30T09:00:00.000Z",
    confirmedBy: null,
    systemizedRef: null,
    ...over,
  }
}

const METRICS: MetricsView = {
  windowDays: 30,
  reports: 12,
  recurrenceRate: 0.25,
  resolveMinutes: { withLesson: 8, withoutLesson: 31.5, withLessonCount: 3, withoutLessonCount: 4 },
  systemizedRate: 0.5,
  top: [{ signature: "a".repeat(64), signatureText: "lock timeout", tool: "cargo", errorCode: "FG-DB-0007", count: 7, lessonState: "confirmed" }],
}

let list: LessonListView
let metrics: MetricsView | null
const calls: Array<{ method: string; url: string; body?: unknown }> = []

beforeEach(() => {
  calls.length = 0
  metrics = METRICS
  list = {
    lessons: [lesson({ id: "l1", state: "draft" }), lesson({ id: "l2", state: "confirmed", scope: "tech:rust", symptom: "clippy denies unwrap", errorCode: null, fix: "use ?" })],
    truncated: false,
    canCurate: true,
    curatable: { l1: true, l2: true },
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase()
      calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (String(url).startsWith("/api/feedback/metrics")) return jsonResponse({ metrics })
      if (String(url).startsWith("/api/feedback/lessons?")) return jsonResponse(list)
      if (method === "GET" && /\/api\/feedback\/lessons\/l\d$/.test(String(url))) {
        return jsonResponse({
          failures: [{ id: "f1", tool: "cargo test", errorCode: "FG-DB-0007", source: "agent", branch: "feat/x", repeatCount: 3, createdAt: "2026-10-30T08:00:00.000Z", projectName: "Forge", excerpt: "lock timeout after 30s", resolution: { diffSummary: "restarted", createdAt: "2026-10-30T08:10:00.000Z" } }],
        })
      }
      return jsonResponse({ lesson: lesson({ state: "confirmed" }) })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe("Lessons screen", () => {
  it("lists lessons with state (text + dot), scope, hits, last seen and the analysis", async () => {
    renderWithProviders(<LessonsView />)
    const items = await screen.findAllByRole("listitem", {}, { timeout: 3000 })
    const first = items.find((i) => i.getAttribute("data-lesson-id") === "l1")!
    expect(within(first).getByText(t.feedbackStateDraft)).toBeInTheDocument()
    expect(within(first).getByText(t.feedbackScopeGlobal)).toBeInTheDocument()
    expect(within(first).getByText("5 hits")).toBeInTheDocument()
    expect(within(first).getByText("FG-DB-0007")).toBeInTheDocument()
    expect(within(first).getByText("restart the runner")).toBeInTheDocument()
    expect(within(first).getByText("cargo test -p forge-db")).toBeInTheDocument()
    const second = items.find((i) => i.getAttribute("data-lesson-id") === "l2")!
    expect(within(second).getByText("Tech: rust")).toBeInTheDocument()
    expect(within(second).getByText(t.feedbackStateConfirmed)).toBeInTheDocument()
  })

  it("shows the dashboard to a curator: recurrence rate, time to resolve with / without a lesson, systemized share, top failures", async () => {
    renderWithProviders(<LessonsView />)
    const panel = await screen.findByRole("region", { name: /Last 30 days/ })
    expect(within(panel).getByText("25%")).toBeInTheDocument()
    expect(within(panel).getByText("8 min (3)")).toBeInTheDocument()
    expect(within(panel).getByText("31.5 min (4)")).toBeInTheDocument()
    expect(within(panel).getByText("50%")).toBeInTheDocument()
    expect(within(panel).getByText(/lock timeout/)).toBeInTheDocument()
  })

  it("a viewer who curates nothing sees the lessons but no dashboard and no action buttons", async () => {
    metrics = null
    list = { lessons: [lesson({ id: "l2", state: "confirmed" })], truncated: false, canCurate: false, curatable: { l2: false } }
    renderWithProviders(<LessonsView />)
    await screen.findByText("cargo test hangs on the lock")
    expect(screen.queryByRole("region", { name: /Last 30 days/ })).toBeNull()
    for (const name of [t.feedbackConfirm, t.feedbackRetire, t.feedbackSystemize, t.feedbackHistoryShow]) expect(screen.queryByRole("button", { name })).toBeNull()
  })

  it("offers confirm for a draft, systemize for a confirmed lesson, retire for both", async () => {
    renderWithProviders(<LessonsView />)
    await screen.findAllByRole("listitem")
    const draft = document.querySelector("[data-lesson-id='l1']") as HTMLElement
    const confirmed = document.querySelector("[data-lesson-id='l2']") as HTMLElement
    expect(within(draft).getByRole("button", { name: /Confirm lesson/ })).toBeInTheDocument()
    expect(within(draft).queryByRole("button", { name: /Systemize lesson/ })).toBeNull()
    expect(within(draft).getByRole("button", { name: /Retire lesson/ })).toBeInTheDocument()
    expect(within(confirmed).queryByRole("button", { name: /Confirm lesson/ })).toBeNull()
    expect(within(confirmed).getByRole("button", { name: /Systemize lesson/ })).toBeInTheDocument()
  })

  it("Confirm POSTs the action and re-reads the list", async () => {
    const user = userEvent.setup()
    renderWithProviders(<LessonsView />)
    await screen.findAllByRole("listitem")
    const listReads = () => calls.filter((c) => c.method === "GET" && c.url.startsWith("/api/feedback/lessons?")).length
    const before = listReads()
    await user.click(within(document.querySelector("[data-lesson-id='l1']") as HTMLElement).getByRole("button", { name: /Confirm lesson/ }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/feedback/lessons/l1/confirm")).toBe(true))
    await waitFor(() => expect(listReads()).toBeGreaterThan(before))
  })

  it("Retire asks first, and only then POSTs", async () => {
    const user = userEvent.setup()
    renderWithProviders(<LessonsView />)
    await screen.findAllByRole("listitem")
    await user.click(within(document.querySelector("[data-lesson-id='l2']") as HTMLElement).getByRole("button", { name: /Retire lesson/ }))
    expect(await screen.findByText(t.feedbackRetireTitle)).toBeInTheDocument()
    expect(calls.some((c) => c.method === "POST")).toBe(false)
    await user.click(screen.getByRole("button", { name: t.feedbackRetire }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/feedback/lessons/l2/retire")).toBe(true))
  })

  it("Systemize needs a link: Save stays disabled until one is typed, then POSTs { kind, ref }", async () => {
    const user = userEvent.setup()
    renderWithProviders(<LessonsView />)
    await screen.findAllByRole("listitem")
    await user.click(within(document.querySelector("[data-lesson-id='l2']") as HTMLElement).getByRole("button", { name: /Systemize lesson/ }))
    const form = await screen.findByRole("form", { name: t.feedbackSystemizeTitle })
    const save = within(form).getByRole("button", { name: t.feedbackSave })
    expect(save).toBeDisabled()
    await user.selectOptions(within(form).getByLabelText(new RegExp(t.feedbackSystemizeKind)), "gate")
    await user.type(within(form).getByLabelText(new RegExp(t.feedbackSystemizeRef)), "ci/no-unwrap")
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.url === "/api/feedback/lessons/l2/systemize")?.body).toEqual({ kind: "gate", ref: "ci/no-unwrap" }),
    )
  })

  it("shows the failure history of the signature on demand", async () => {
    const user = userEvent.setup()
    renderWithProviders(<LessonsView />)
    await screen.findAllByRole("listitem")
    await user.click(within(document.querySelector("[data-lesson-id='l1']") as HTMLElement).getByRole("button", { name: t.feedbackHistoryShow }))
    const history = await screen.findByRole("list", { name: t.feedbackHistory })
    expect(within(history).getByText("lock timeout after 30s")).toBeInTheDocument()
    expect(within(history).getByText(/Fixed: restarted/)).toBeInTheDocument()
    expect(within(history).getByText("3 reports folded")).toBeInTheDocument()
  })

  it("filters: the search text and the state go to the server", async () => {
    const user = userEvent.setup()
    renderWithProviders(<LessonsView />)
    await screen.findAllByRole("listitem")
    await user.type(screen.getByLabelText(t.feedbackSearchLabel), "lock")
    await user.selectOptions(screen.getByLabelText(t.feedbackStateLabel), "draft")
    await waitFor(() => expect(calls.some((c) => c.url.includes("q=lock") && c.url.includes("state=draft"))).toBe(true))
  })

  it("an empty list says so", async () => {
    list = { lessons: [], truncated: false, canCurate: false, curatable: {} }
    renderWithProviders(<LessonsView />)
    expect(await screen.findByText(t.feedbackEmpty)).toBeInTheDocument()
  })
})
