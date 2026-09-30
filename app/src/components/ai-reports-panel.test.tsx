import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"

const reports = vi.hoisted(() => [
  { id: "r3", trigger: "surveillance", status: "done", title: "Newest", summary: "s3", body: "b3", structured: null, createdAt: "2026-09-23T06:30:00Z" },
  { id: "r2", trigger: "surveillance", status: "done", title: "Older A", summary: "s2", body: "b2", structured: null, createdAt: "2026-09-22T06:30:00Z" },
  { id: "r1", trigger: "manual", status: "done", title: "Older B", summary: "s1", body: "b1", structured: null, createdAt: "2026-09-21T06:30:00Z" },
])

const q = vi.hoisted(() => ({
  reports: [] as unknown[],
  jobs: [] as unknown[],
  refetchReports: vi.fn(),
  refetchJobs: vi.fn(),
}))

vi.mock("@/hooks", () => ({
  useApiQuery: (url: string) =>
    url.endsWith("/ai/jobs") ? { data: q.jobs, refetch: q.refetchJobs } : { data: q.reports, refetch: q.refetchReports },
}))
vi.mock("@/lib/language-context", async () => {
  const { getTranslations: get } = await import("@/lib/i18n")
  return { useLanguage: () => ({ t: get("ja"), language: "ja" }) }
})
vi.mock("@/components/structured-report-document", () => ({ ReportDocument: () => null, parseStructured: () => null }))

const { default: AiReportsPanel } = await import("./ai-reports-panel")
const t = getTranslations("ja")

beforeEach(() => {
  q.reports = reports
  q.jobs = []
  q.refetchReports.mockReset()
  q.refetchJobs.mockReset()
  window.history.replaceState(null, "", "/projects/p1")
})
afterEach(() => window.history.replaceState(null, "", "/"))

describe("AiReportsPanel", () => {
  it("marks only the newest report as latest and collapses older ones by default", async () => {
    render(<AiReportsPanel projectId="p1" />)

    expect(screen.getAllByText(t.aiReportLatest)).toHaveLength(1)
    const newest = screen.getByText("Newest").closest("li") as HTMLElement
    expect(within(newest).getByText(t.aiReportLatest)).toBeInTheDocument()
    expect(screen.queryByText("Older A")).not.toBeInTheDocument()

    const toggle = screen.getByRole("button", { name: t.aiReportOlderShow.replace("{count}", "2") })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveTextContent(t.aiReportOlderHide)
    const older = screen.getByText("Older A").closest("li") as HTMLElement
    expect(within(older).queryByText(t.aiReportLatest)).not.toBeInTheDocument()
    expect(screen.getByText("Older B")).toBeInTheDocument()
    expect(screen.getAllByText(t.aiReportLatest)).toHaveLength(1)
  })

  it("labels background progress reports (trigger manual)", async () => {
    window.history.replaceState(null, "", "/projects/p1?report=r1")
    render(<AiReportsPanel projectId="p1" />)
    const row = (await screen.findByText("Older B")).closest("li") as HTMLElement
    expect(within(row).getByText(t.aiReportTriggerProgress)).toBeInTheDocument()
  })

  it("?report= opens that report, expanding the older list when needed", async () => {
    window.history.replaceState(null, "", "/projects/p1?report=r2")
    render(<AiReportsPanel projectId="p1" />)
    const row = (await screen.findByText("Older A")).closest("li") as HTMLElement
    expect(within(row).getByRole("button")).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: t.aiReportOlderHide })).toHaveAttribute("aria-expanded", "true")
  })

  it("lists report jobs in progress, even before the first report exists", () => {
    q.reports = []
    q.jobs = [
      { id: "j1", kind: "progress_report", status: "running", progress: 40, params: {}, resultReportId: null, error: null, requestedBy: { id: "u1", name: "Alice" }, createdAt: "", startedAt: null, finishedAt: null },
      { id: "j2", kind: "sprint_review", status: "queued", progress: null, params: {}, resultReportId: null, error: null, requestedBy: null, createdAt: "", startedAt: null, finishedAt: null },
    ]
    render(<AiReportsPanel projectId="p1" />)
    expect(screen.getByRole("heading", { name: t.aiJobInProgressTitle })).toBeInTheDocument()
    expect(screen.getByText(t.aiJobKindProgressReport)).toBeInTheDocument()
    expect(screen.getByText(t.aiJobRequestedBy.replace("{name}", "Alice"))).toBeInTheDocument()
    expect(screen.getByText(`${t.aiJobStatusRunning} 40%`)).toBeInTheDocument()
    expect(screen.getByText(t.aiJobKindSprintReview)).toBeInTheDocument()
    expect(screen.getByText(t.aiJobStatusQueued)).toBeInTheDocument()
  })

  it("stays hidden without reports and jobs", () => {
    q.reports = []
    const { container } = render(<AiReportsPanel projectId="p1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("reloads reports and jobs when a report was produced on this page", () => {
    render(<AiReportsPanel projectId="p1" />)
    act(() => {
      window.dispatchEvent(new Event("kanflow:ai-reports-changed"))
    })
    expect(q.refetchReports).toHaveBeenCalled()
    expect(q.refetchJobs).toHaveBeenCalled()
  })

  it("reloads reports when a listed job finishes", () => {
    const job = { id: "j1", kind: "progress_report", status: "running", progress: 10, params: {}, resultReportId: null, error: null, requestedBy: null, createdAt: "", startedAt: null, finishedAt: null }
    q.jobs = [job]
    const { rerender } = render(<AiReportsPanel projectId="p1" />)
    expect(q.refetchReports).not.toHaveBeenCalled()
    q.jobs = []
    rerender(<AiReportsPanel projectId="p1" />)
    expect(q.refetchReports).toHaveBeenCalledTimes(1)
  })

  it("shows the viewer's side of a bilingual report and says when a report is in another language (S-14)", async () => {
    const pairs = "Kecepatan tim stabil dan semua tugas selesai.\nチームの速度は安定しています。"
    q.reports = [
      { id: "b1", trigger: "sprint_completed", status: "done", title: "🏁 スプリント完了レビュー / Tinjauan penyelesaian sprint: S-9", summary: pairs, body: pairs, structured: null, createdAt: "2026-09-23T06:30:00Z" },
      { id: "p1", trigger: "manual", status: "done", title: "📊 Laporan progres", summary: "Progres proyek sudah sesuai rencana", body: "Progres proyek sudah sesuai rencana", structured: null, createdAt: "2026-09-22T06:30:00Z" },
    ]
    render(<AiReportsPanel projectId="p1" />)
    expect(screen.getByText("🏁 スプリント完了レビュー: S-9")).toBeInTheDocument()
    await userEvent.click(screen.getByText("🏁 スプリント完了レビュー: S-9"))
    const bilingual = screen.getByText("🏁 スプリント完了レビュー: S-9").closest("li") as HTMLElement
    expect(within(bilingual).getByText("チームの速度は安定しています。")).toBeInTheDocument()
    expect(within(bilingual).queryByText(/Kecepatan tim/)).not.toBeInTheDocument()
    expect(within(bilingual).queryByTestId("ai-report-language-note")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: t.aiReportOlderShow.replace("{count}", "1") }))
    await userEvent.click(screen.getByText("📊 進捗レポート"))
    expect(screen.getByTestId("ai-report-language-note")).toHaveTextContent(t.aiReportWrittenIn.replace("{language}", "Bahasa Indonesia"))
  })
})
