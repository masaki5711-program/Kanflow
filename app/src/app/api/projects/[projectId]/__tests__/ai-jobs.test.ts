import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/ai-jobs/ai-jobs.service", () => ({
  listActiveAiJobs: vi.fn(),
  requestAiJob: vi.fn(),
  getAiJob: vi.fn(),
  cancelAiJob: vi.fn(),
}))

const svc = await import("@/services/ai-jobs/ai-jobs.service")
const list = await import("@/app/api/projects/[projectId]/ai/jobs/route")
const one = await import("@/app/api/projects/[projectId]/ai/jobs/[jobId]/route")
const { StatusError, NotFoundError } = await import("@/services/_shared")

const JOB = { id: "j1", status: "queued" }
const jCtx = () => ctx({ jobId: "j1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
  vi.mocked(svc.listActiveAiJobs).mockResolvedValue({ items: [], runner: "worker" })
  vi.mocked(svc.requestAiJob).mockResolvedValue({ job: JOB, deduped: false } as never)
  vi.mocked(svc.getAiJob).mockResolvedValue(JOB as never)
  vi.mocked(svc.cancelAiJob).mockResolvedValue({ ...JOB, status: "cancelled" } as never)
})

describe("POST /ai/jobs", () => {
  it("queues a progress report (202) for any member", async () => {
    asRole("dev")
    expect(await read(await list.POST(req("POST", { kind: "progress_report", lang: "en" }), ctx()))).toEqual({
      status: 202,
      body: { job: JOB, deduped: false },
    })
    expect(svc.requestAiJob).toHaveBeenCalledWith(PROJECT_ID, { kind: "progress_report", lang: "en" }, ACTOR)
  })

  it("defaults the language; rejects unknown or system-only kinds", async () => {
    asRole("dev")
    await list.POST(req("POST", { kind: "progress_report" }), ctx())
    expect(svc.requestAiJob).toHaveBeenCalledWith(PROJECT_ID, { kind: "progress_report", lang: "ja" }, ACTOR)
    expect((await list.POST(req("POST", { kind: "sprint_review" }), ctx())).status).toBe(400)
    expect((await list.POST(req("POST", "{bad"), ctx())).status).toBe(400)
  })

  it("503 with reason when jobs are disabled", async () => {
    asRole("dev")
    vi.mocked(svc.requestAiJob).mockRejectedValue(
      new StatusError(503, "disabled", { reason: "ai_jobs_disabled" }, "SERVICE_UNAVAILABLE")
    )
    expect(await read(await list.POST(req("POST", { kind: "progress_report" }), ctx()))).toEqual({
      status: 503,
      body: { error: "disabled", code: "SERVICE_UNAVAILABLE", reason: "ai_jobs_disabled" },
    })
  })

  it("401 / 404 / 403 (section managers cannot use AI)", async () => {
    signedOut()
    expect((await list.POST(req("POST", { kind: "progress_report" }), ctx())).status).toBe(401)
    asRole(null)
    expect((await list.POST(req("POST", { kind: "progress_report" }), ctx())).status).toBe(404)
    asRole(null, "section_manager")
    const { sectionFindFirst } = await import("./route-harness")
    sectionFindFirst.mockResolvedValue({ sectionId: "s" })
    expect((await list.POST(req("POST", { kind: "progress_report" }), ctx())).status).toBe(403)
  })
})

describe("GET /ai/jobs and /ai/jobs/[jobId]", () => {
  it("lists active jobs and reads one", async () => {
    asRole("dev")
    expect(await read(await list.GET(req("GET"), ctx()))).toEqual({ status: 200, body: { items: [], runner: "worker" } })
    expect(await read(await one.GET(req("GET"), jCtx()))).toEqual({ status: 200, body: JOB })
    expect(svc.getAiJob).toHaveBeenCalledWith(PROJECT_ID, "j1")
  })

  it("404 for a job of another project", async () => {
    asRole("dev")
    vi.mocked(svc.getAiJob).mockRejectedValue(new NotFoundError("AI job not found"))
    expect((await one.GET(req("GET"), jCtx())).status).toBe(404)
  })
})

describe("DELETE /ai/jobs/[jobId]", () => {
  it("passes the manage right: dev false, PO true", async () => {
    asRole("dev")
    await one.DELETE(req("DELETE"), jCtx())
    expect(svc.cancelAiJob).toHaveBeenLastCalledWith(PROJECT_ID, "j1", ACTOR, false)
    asRole("po")
    expect(await read(await one.DELETE(req("DELETE"), jCtx()))).toEqual({ status: 200, body: { id: "j1", status: "cancelled" } })
    expect(svc.cancelAiJob).toHaveBeenLastCalledWith(PROJECT_ID, "j1", ACTOR, true)
  })
})
