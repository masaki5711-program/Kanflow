import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const localIdleForMs = vi.fn()
const gateState = { local_high_active: 0 }
vi.mock("@/lib/translation/priority-gate", () => ({
  gate: {
    get local_high_active() {
      return gateState.local_high_active
    },
    localIdleForMs: () => localIdleForMs(),
  },
}))

const { GET } = await import("../ai-busy/route")

function req(headers: Record<string, string>) {
  return new Request("http://127.0.0.1:3000/api/internal/ai-busy", { headers })
}

describe("GET /api/internal/ai-busy", () => {
  const saved = process.env.INTERNAL_API_TOKEN
  beforeEach(() => {
    process.env.INTERNAL_API_TOKEN = "s3cret"
    localIdleForMs.mockReset().mockReturnValue(1234)
    gateState.local_high_active = 2
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.INTERNAL_API_TOKEN
    else process.env.INTERNAL_API_TOKEN = saved
  })

  it("404 for a non-loopback host", async () => {
    const res = GET(req({ host: "kanflow.example.com", "x-internal-token": "s3cret" }))
    expect(res.status).toBe(404)
  })

  it("404 when relayed for a remote client", async () => {
    const res = GET(req({ host: "localhost:3000", "x-forwarded-for": "10.0.0.5", "x-internal-token": "s3cret" }))
    expect(res.status).toBe(404)
  })

  it("503 when the token is not configured", async () => {
    delete process.env.INTERNAL_API_TOKEN
    const res = GET(req({ host: "localhost:3000", "x-internal-token": "x" }))
    expect(res.status).toBe(503)
  })

  it("403 with a wrong token", async () => {
    const res = GET(req({ host: "localhost:3000", "x-internal-token": "nope" }))
    expect(res.status).toBe(403)
  })

  it("reports busy state with no-store", async () => {
    const res = GET(req({ host: "127.0.0.1:3000", "x-internal-token": "s3cret" }))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual({ busyHigh: 2, idleForMs: 1234, pid: process.pid })
  })

  it("reports idleForMs null when never active", async () => {
    localIdleForMs.mockReturnValue(Infinity)
    const res = GET(req({ host: "localhost", "x-internal-token": "s3cret" }))
    expect((await res.json()).idleForMs).toBeNull()
  })
})
