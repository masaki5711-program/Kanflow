import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runSurveillance = vi.fn()
vi.mock("@/worker/jobs/surveillance", () => ({
  runSurveillance: (...a: unknown[]) => runSurveillance(...a),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s: string) => s }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

delete (globalThis as Record<string, unknown>).__kanflowSurveillanceRunner
const { GET, POST } = await import("../route")

const URL_BASE = "http://localhost/api/surveillance"
function req(method: string, token: string | null, query = "") {
  const headers: Record<string, string> = {}
  if (token !== null) headers["x-surveillance-token"] = token
  return new Request(`${URL_BASE}${query}`, { method, headers })
}

describe("/api/surveillance", () => {
  const saved = process.env.SURVEILLANCE_TOKEN
  beforeEach(() => {
    process.env.SURVEILLANCE_TOKEN = "tok"
    runSurveillance.mockReset()
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.SURVEILLANCE_TOKEN
    else process.env.SURVEILLANCE_TOKEN = saved
  })

  it("503 when token not configured", async () => {
    delete process.env.SURVEILLANCE_TOKEN
    expect((await POST(req("POST", "tok"))).status).toBe(503)
    expect((await GET(req("GET", "tok"))).status).toBe(503)
  })

  it("403 with missing or wrong token", async () => {
    expect((await POST(req("POST", null))).status).toBe(403)
    expect((await POST(req("POST", "bad"))).status).toBe(403)
    expect((await GET(req("GET", "bad"))).status).toBe(403)
    expect(runSurveillance).not.toHaveBeenCalled()
  })

  it("POST starts a job (202), a concurrent POST reports alreadyRunning, GET returns the record", async () => {
    let finish: (v: unknown) => void = () => undefined
    runSurveillance.mockImplementation(() => new Promise((r) => (finish = r)))

    const first = await POST(req("POST", "tok"))
    expect(first.status).toBe(202)
    const a = await first.json()
    expect(a.alreadyRunning).toBe(false)
    expect(a.status).toBe("running")

    const second = await POST(req("POST", "tok"))
    const b = await second.json()
    expect(b.alreadyRunning).toBe(true)
    expect(b.jobId).toBe(a.jobId)

    const listing = await (await GET(req("GET", "tok"))).json()
    expect(listing.running.id).toBe(a.jobId)
    expect(Array.isArray(listing.recent)).toBe(true)

    await vi.waitFor(() => expect(runSurveillance).toHaveBeenCalledTimes(1))
    expect(runSurveillance.mock.calls[0][0]).toEqual({ signal: expect.any(AbortSignal) })
    finish({ ok: true })

    await vi.waitFor(async () => {
      const job = await (await GET(req("GET", "tok", `?jobId=${a.jobId}`))).json()
      expect(job.status).toBe("done")
    })
  })

  it("GET rejects malformed jobId (400) and unknown jobId (404)", async () => {
    expect((await GET(req("GET", "tok", "?jobId=../../etc"))).status).toBe(400)
    const res = await GET(req("GET", "tok", "?jobId=00000000-0000-0000-0000-000000000000"))
    expect(res.status).toBe(404)
  })
})
