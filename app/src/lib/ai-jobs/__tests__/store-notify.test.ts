import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: { __db: true } }))
vi.mock("@/services/ai-jobs/ai-jobs.repository")
vi.mock("@/services/_shared/notifications", () => ({ notify: vi.fn(async () => 1) }))

const repo = await import("@/services/ai-jobs/ai-jobs.repository")
const { notify } = await import("@/services/_shared/notifications")
const { createAiJobStore } = await import("../store")
const { notifyJobFinished } = await import("../notify")

const DB = { __db: true }
const NOW = new Date("2026-10-03T00:00:00.000Z")
const ROW = {
  id: "j1", projectId: "p1", userId: "u1", kind: "progress_report", params: '{"lang":"ja"}', status: "running",
  progress: 0, attempts: 1, resultReportId: null, error: null, createdAt: NOW, startedAt: NOW, finishedAt: null, user: null,
}

beforeEach(() => vi.clearAllMocks())

describe("createAiJobStore", () => {
  const store = () => createAiJobStore(DB as never, () => NOW)

  it("claims the oldest queued job with a conditional update", async () => {
    vi.mocked(repo.findOldestQueued).mockResolvedValue({ id: "j1" })
    vi.mocked(repo.markRunning).mockResolvedValue(true)
    vi.mocked(repo.loadJob).mockResolvedValue(ROW)
    expect(await store().claimNext()).toEqual({ id: "j1", projectId: "p1", userId: "u1", kind: "progress_report", params: { lang: "ja" }, attempts: 1 })
    expect(repo.markRunning).toHaveBeenCalledWith(DB, "j1", NOW)
  })

  it("moves on when another runner won the race; null when the queue is empty", async () => {
    vi.mocked(repo.findOldestQueued).mockResolvedValueOnce({ id: "j1" }).mockResolvedValueOnce(null)
    vi.mocked(repo.markRunning).mockResolvedValue(false)
    expect(await store().claimNext()).toBeNull()
    expect(repo.findOldestQueued).toHaveBeenCalledTimes(2)
  })

  it("delegates transitions with the clock", async () => {
    const s = store()
    await s.complete("j1", "r1")
    await s.fail("j1", "boom")
    await s.requeue("j1")
    await s.sweepStale(NOW, 2)
    expect(repo.markDone).toHaveBeenCalledWith(DB, "j1", "r1", NOW)
    expect(repo.markFailed).toHaveBeenCalledWith(DB, "j1", "boom", NOW)
    expect(repo.markRequeued).toHaveBeenCalledWith(DB, "j1")
    expect(repo.sweepStale).toHaveBeenCalledWith(DB, NOW, 2, NOW, expect.stringContaining("interrupted"))
  })
})

describe("notifyJobFinished", () => {
  const job = { id: "j1", projectId: "p1", userId: "u1", kind: "progress_report", params: {}, attempts: 1 }

  it("ready → ai_report_ready to the requester, once per job", async () => {
    await notifyJobFinished(job, { status: "done", result: { reportId: "r1", title: "📊" } }, DB as never)
    expect(notify).toHaveBeenCalledWith(DB, {
      recipientIds: ["u1"],
      type: "ai_report_ready",
      projectId: "p1",
      entityType: "ai_report",
      entityId: "r1",
      payload: { jobId: "j1", kind: "progress_report", reportId: "r1", title: "📊" },
      dedupeKey: "ai_report_ready:j1",
    })
  })

  it("failed → ai_report_failed with a short error", async () => {
    await notifyJobFinished(job, { status: "failed", error: "x".repeat(400) }, DB as never)
    const input = vi.mocked(notify).mock.calls[0][1]
    expect(input).toMatchObject({ type: "ai_report_failed", entityType: "ai_job", entityId: "j1", dedupeKey: "ai_report_failed:j1" })
    expect((input.payload as { error: string }).error).toHaveLength(300)
  })

  it("system jobs notify nobody", async () => {
    expect(await notifyJobFinished({ ...job, userId: null }, { status: "failed", error: "x" }, DB as never)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
})
