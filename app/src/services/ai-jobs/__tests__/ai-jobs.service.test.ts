import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../ai-jobs.repository")

const repo = await import("../ai-jobs.repository")
const svc = await import("../ai-jobs.service")
const { DEFAULT_DB, ACTOR, prismaError } = await import("@/services/__tests__/support")
const { ForbiddenError, NotFoundError, StatusError } = await import("@/services/_shared/errors")

const AT = new Date("2026-10-03T00:00:00.000Z")
function row(over: Partial<import("../ai-jobs.repository").JobRow> = {}): import("../ai-jobs.repository").JobRow {
  return {
    id: "j1",
    projectId: "p1",
    userId: "u1",
    kind: "progress_report",
    params: '{"lang":"ja"}',
    status: "queued",
    progress: null,
    attempts: 0,
    resultReportId: null,
    error: null,
    createdAt: AT,
    startedAt: null,
    finishedAt: null,
    user: { id: "u1", name: "Alice" },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.mocked(repo.insertJob).mockResolvedValue(row())
  vi.mocked(repo.findJob).mockResolvedValue(row())
})
afterEach(() => vi.unstubAllEnvs())

describe("toAiJobDto", () => {
  it("maps dates, params and requester; tolerates bad params JSON", () => {
    expect(svc.toAiJobDto(row({ startedAt: AT }))).toEqual({
      id: "j1",
      kind: "progress_report",
      status: "queued",
      progress: null,
      params: { lang: "ja" },
      resultReportId: null,
      error: null,
      requestedBy: { id: "u1", name: "Alice" },
      createdAt: AT.toISOString(),
      startedAt: AT.toISOString(),
      finishedAt: null,
    })
    expect(svc.toAiJobDto(row({ params: "{bad", user: null })).params).toEqual({})
  })
})

describe("enqueueAiJob", () => {
  it("inserts with the dedupe key", async () => {
    const out = await svc.enqueueAiJob({ projectId: "p1", userId: "u1", kind: "sprint_review", params: { sprintId: "s1" }, scope: "s1" })
    expect(out.deduped).toBe(false)
    expect(repo.insertJob).toHaveBeenCalledWith(DEFAULT_DB, {
      projectId: "p1",
      userId: "u1",
      kind: "sprint_review",
      params: '{"sprintId":"s1"}',
      activeKey: "p1:sprint_review:s1",
    })
  })

  it("returns the active job when one is already queued or running", async () => {
    vi.mocked(repo.insertJob).mockRejectedValue(prismaError("P2002"))
    vi.mocked(repo.findActiveByKey).mockResolvedValue(row({ id: "j0", status: "running" }))
    const out = await svc.enqueueAiJob({ projectId: "p1", userId: "u2", kind: "progress_report", params: {} })
    expect(out).toMatchObject({ deduped: true, job: { id: "j0", status: "running" } })
    expect(repo.findActiveByKey).toHaveBeenCalledWith(DEFAULT_DB, "p1:progress_report")
  })

  it("retries once when the active job finished in between", async () => {
    vi.mocked(repo.insertJob).mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce(row({ id: "j2" }))
    vi.mocked(repo.findActiveByKey).mockResolvedValue(null)
    expect((await svc.enqueueAiJob({ projectId: "p1", userId: "u1", kind: "progress_report", params: {} })).job.id).toBe("j2")
  })

  it("re-throws other database errors", async () => {
    vi.mocked(repo.insertJob).mockRejectedValue(new Error("db down"))
    await expect(svc.enqueueAiJob({ projectId: "p1", userId: "u1", kind: "progress_report", params: {} })).rejects.toThrow("db down")
  })
})

describe("requestAiJob", () => {
  it("queues a progress report with the language for the requester", async () => {
    vi.stubEnv("AI_JOB_RUNNER", "worker")
    await svc.requestAiJob("p1", { kind: "progress_report", lang: "id" }, ACTOR)
    expect(repo.insertJob).toHaveBeenCalledWith(DEFAULT_DB, expect.objectContaining({ userId: "u1", params: '{"lang":"id"}' }))
  })

  it("503 ai_jobs_disabled without a runner", async () => {
    vi.stubEnv("AI_JOB_RUNNER", "off")
    const err = await svc.requestAiJob("p1", { kind: "progress_report", lang: "ja" }, ACTOR).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StatusError)
    expect(err).toMatchObject({ status: 503, extra: { reason: "ai_jobs_disabled" } })
    expect(repo.insertJob).not.toHaveBeenCalled()
  })
})

describe("get / list / cancel", () => {
  it("get is project-scoped (404 otherwise)", async () => {
    vi.mocked(repo.findJob).mockResolvedValue(null)
    await expect(svc.getAiJob("p1", "j1")).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.findJob).toHaveBeenCalledWith(DEFAULT_DB, "p1", "j1")
  })

  it("lists active jobs with the runner location", async () => {
    vi.stubEnv("AI_JOB_RUNNER", "web")
    vi.mocked(repo.findActiveJobs).mockResolvedValue([row()])
    expect(await svc.listActiveAiJobs("p1")).toMatchObject({ runner: "web", items: [{ id: "j1" }] })
  })

  it("the requester or a manager may cancel; others get 403", async () => {
    await svc.cancelAiJob("p1", "j1", ACTOR, false)
    expect(repo.markCancelled).toHaveBeenCalledWith(DEFAULT_DB, "j1", expect.any(Date))
    const other = { ...ACTOR, userId: "u9" }
    await expect(svc.cancelAiJob("p1", "j1", other, false)).rejects.toBeInstanceOf(ForbiddenError)
    await svc.cancelAiJob("p1", "j1", other, true)
    expect(repo.markCancelled).toHaveBeenCalledTimes(2)
  })
})
