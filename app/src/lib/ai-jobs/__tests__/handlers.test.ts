import { beforeEach, describe, expect, it, vi } from "vitest"

const buildProjectContext = vi.fn()
const generateProgressReport = vi.fn()
const saveReport = vi.fn()
const runSprintCompletionReview = vi.fn()

vi.mock("@/lib/project-context", () => ({ buildProjectContext: (...a: unknown[]) => buildProjectContext(...a) }))
vi.mock("@/lib/progress-report", async (orig) => ({
  ...(await orig<typeof import("@/lib/progress-report")>()),
  generateProgressReport: (...a: unknown[]) => generateProgressReport(...a),
}))
vi.mock("@/services/ai-reports/ai-reports.service", () => ({ saveReport: (...a: unknown[]) => saveReport(...a) }))
vi.mock("@/services/sprints/sprint-completion-review", () => ({
  runSprintCompletionReview: (...a: unknown[]) => runSprintCompletionReview(...a),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn() }))

const { AI_JOB_HANDLERS, runProgressReportJob, runSprintReviewJob } = await import("../handlers")

const REPORT = {
  headline: "On track",
  overview: "Fine",
  followUps: [],
  findings: [],
  metrics: [],
  causes: [],
  actions: [],
  outlook: null,
}

function ctx() {
  return { signal: new AbortController().signal, progress: vi.fn(async () => undefined) }
}

beforeEach(() => {
  vi.clearAllMocks()
  buildProjectContext.mockResolvedValue("CTX")
  generateProgressReport.mockResolvedValue(REPORT)
  saveReport.mockResolvedValue({ id: "r1" })
})

describe("runProgressReportJob", () => {
  it("generates in the requested language and stores a manual AiReport", async () => {
    const c = ctx()
    const job = { id: "j1", projectId: "p1", userId: "u1", kind: "progress_report", params: { lang: "en" }, attempts: 1 }
    expect(await runProgressReportJob(job, c)).toEqual({ reportId: "r1", title: "📊 Progress report" })
    expect(buildProjectContext).toHaveBeenCalledWith("p1")
    const [messages, opts] = generateProgressReport.mock.calls[0]
    expect(messages[0].content).toContain("English")
    expect(messages[1]).toEqual({ role: "user", content: "CTX" })
    expect(opts).toMatchObject({ signal: c.signal })
    const saved = saveReport.mock.calls[0][0]
    expect(saved).toMatchObject({ projectId: "p1", trigger: "manual", status: "done", title: "📊 Progress report", summary: "On track" })
    expect(JSON.parse(saved.structured)).toEqual(REPORT)
    expect(JSON.parse(saved.meta)).toMatchObject({ jobId: "j1", lang: "en", requestedBy: "u1" })
    expect((c.progress.mock.calls as unknown as number[][]).map((x) => x[0])).toEqual([5, 20, 90])
  })

  it("defaults to Japanese for an unknown language", async () => {
    const job = { id: "j1", projectId: "p1", userId: null, kind: "progress_report", params: { lang: "xx" }, attempts: 1 }
    expect((await runProgressReportJob(job, ctx())).title).toBe("📊 進捗レポート")
  })
})

describe("runSprintReviewJob", () => {
  it("runs the sprint review with the job signal", async () => {
    runSprintCompletionReview.mockResolvedValue({ reportId: "r2", title: "T" })
    const c = ctx()
    const job = { id: "j2", projectId: "p1", userId: "u1", kind: "sprint_review", params: { sprintId: "s1", sprintName: "S1" }, attempts: 1 }
    expect(await runSprintReviewJob(job, c)).toEqual({ reportId: "r2", title: "T" })
    expect(runSprintCompletionReview).toHaveBeenCalledWith("p1", "s1", "S1", c.signal)
  })

  it("rejects a job without a sprint id", async () => {
    const job = { id: "j2", projectId: "p1", userId: null, kind: "sprint_review", params: {}, attempts: 1 }
    await expect(runSprintReviewJob(job, ctx())).rejects.toThrow("without sprintId")
  })
})

it("every kind has a handler", () => {
  expect(Object.keys(AI_JOB_HANDLERS).sort()).toEqual(["progress_report", "sprint_review"])
})
