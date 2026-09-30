import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runAgentInvestigation = vi.fn()
const aiLog = vi.fn()
const bilingualizeReportBody = vi.fn()
const bilingualizeStructuredReport = vi.fn()
const structuredReportToMarkdown = vi.fn()
const saveReplacingPrevious = vi.fn()
const enqueueAiJob = vi.fn()

vi.mock("@/lib/ai-agent", () => ({ runAgentInvestigation: (...a: unknown[]) => runAgentInvestigation(...a) }))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: (...a: unknown[]) => aiLog(...a) }))
vi.mock("@/lib/report-bilingual", () => ({
  bilingualizeReportBody: (...a: unknown[]) => bilingualizeReportBody(...a),
  bilingualizeStructuredReport: (...a: unknown[]) => bilingualizeStructuredReport(...a),
}))
vi.mock("@/lib/report-markdown", () => ({ structuredReportToMarkdown: (...a: unknown[]) => structuredReportToMarkdown(...a) }))
vi.mock("@/services/ai-reports/ai-reports.service", () => ({
  saveReplacingPrevious: (...a: unknown[]) => saveReplacingPrevious(...a),
}))

vi.mock("@/services/ai-jobs/ai-jobs.service", () => ({ enqueueAiJob: (...a: unknown[]) => enqueueAiJob(...a) }))

const { launchSprintCompletionReview, runSprintCompletionReview } = await import("../sprint-completion-review")

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("launchSprintCompletionReview without a job runner (in-process fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("AI_JOB_RUNNER", "off")
    saveReplacingPrevious.mockResolvedValue({ id: "r1", superseded: 0 })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("returns synchronously and saves a structured bilingual report", async () => {
    const structured = { headline: "H".repeat(600), sections: [] }
    runAgentInvestigation.mockResolvedValue({ structured: { raw: 1 }, report: "r", toolCalls: 3, iterations: 2, ms: 10 })
    bilingualizeStructuredReport.mockResolvedValue(structured)
    structuredReportToMarkdown.mockReturnValue("MD")

    expect(launchSprintCompletionReview("p1", "s1", "Sprint 1")).toBeUndefined()
    await flush()

    expect(runAgentInvestigation).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1", lang: "ja", label: "sprint-completed:Sprint 1" }))
    expect(structuredReportToMarkdown).toHaveBeenCalledWith(structured, "ja")
    const saved = saveReplacingPrevious.mock.calls[0][0]
    expect(saved).toMatchObject({ projectId: "p1", trigger: "sprint_completed", status: "done", body: "MD" })
    expect(saved.summary).toHaveLength(500)
    expect(JSON.parse(saved.structured)).toEqual(structured)
    expect(JSON.parse(saved.meta)).toEqual({ sprintId: "s1", toolCalls: 3, iterations: 2, durationMs: 10 })
    expect(bilingualizeReportBody).not.toHaveBeenCalled()
    expect(aiLog).toHaveBeenCalledWith("REPORT_SAVED", expect.stringContaining("r1"))
  })

  it("falls back to bilingualizing the plain report and logs superseded reviews", async () => {
    runAgentInvestigation.mockResolvedValue({ structured: null, report: "plain", toolCalls: 0, iterations: 1, ms: 1 })
    bilingualizeReportBody.mockResolvedValue("BI")
    saveReplacingPrevious.mockResolvedValue({ id: "r2", superseded: 2 })
    launchSprintCompletionReview("p1", "s1", "S")
    await flush()
    const saved = saveReplacingPrevious.mock.calls[0][0]
    expect(saved).toMatchObject({ body: "BI", summary: null, structured: null })
    expect(aiLog).toHaveBeenCalledWith("SURVEIL", expect.stringContaining("superseded 2"))
  })

  it("never throws: failures are logged as CHAT_ERROR", async () => {
    runAgentInvestigation.mockRejectedValue(new Error("ollama down"))
    launchSprintCompletionReview("p1", "s1", "S")
    await flush()
    expect(aiLog).toHaveBeenCalledWith("CHAT_ERROR", expect.stringContaining("ollama down"))
    expect(saveReplacingPrevious).not.toHaveBeenCalled()
  })

  it("logs non-Error rejections too", async () => {
    runAgentInvestigation.mockRejectedValue("weird")
    launchSprintCompletionReview("p1", "s1", "S")
    await flush()
    expect(aiLog).toHaveBeenCalledWith("CHAT_ERROR", expect.stringContaining("weird"))
  })
})

describe("launchSprintCompletionReview with a job runner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("AI_JOB_RUNNER", "worker")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("queues one sprint_review job per sprint for the completing user instead of running here", async () => {
    enqueueAiJob.mockResolvedValue({ job: { id: "j1" }, deduped: false })
    launchSprintCompletionReview("p1", "s1", "Sprint 1", "u1")
    await flush()
    expect(enqueueAiJob).toHaveBeenCalledWith({
      projectId: "p1",
      userId: "u1",
      kind: "sprint_review",
      params: { sprintId: "s1", sprintName: "Sprint 1" },
      scope: "s1",
    })
    expect(runAgentInvestigation).not.toHaveBeenCalled()
    expect(aiLog).toHaveBeenCalledWith("SURVEIL", expect.stringContaining("queued as job j1"))
  })

  it("logs a queueing failure", async () => {
    enqueueAiJob.mockRejectedValue(new Error("db down"))
    launchSprintCompletionReview("p1", "s1", "S")
    await flush()
    expect(aiLog).toHaveBeenCalledWith("CHAT_ERROR", expect.stringContaining("db down"))
  })
})

describe("runSprintCompletionReview", () => {
  it("passes the job signal through and returns the report id and title", async () => {
    vi.clearAllMocks()
    const signal = new AbortController().signal
    runAgentInvestigation.mockResolvedValue({ structured: null, report: "plain", toolCalls: 0, iterations: 1, ms: 1 })
    bilingualizeReportBody.mockResolvedValue("BI")
    saveReplacingPrevious.mockResolvedValue({ id: "r9", superseded: 0 })
    const out = await runSprintCompletionReview("p1", "s1", "S1", signal)
    expect(out).toEqual({ reportId: "r9", title: expect.stringContaining("S1") })
    expect(runAgentInvestigation).toHaveBeenCalledWith(expect.objectContaining({ signal }))
    expect(bilingualizeReportBody).toHaveBeenCalledWith("plain", signal)
  })
})
