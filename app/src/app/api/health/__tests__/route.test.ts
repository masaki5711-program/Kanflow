import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const queryRaw = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}))

import { GET } from "../route"
import { resetBuildIdCache } from "../build-id"

const fetchMock = vi.fn()
let tmp: string
const savedEnv = { ...process.env }

/** $queryRaw is a tagged template: the first argument is the strings array. */
function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join("?")
}

function answer(opts: { db?: "ok" | "fail" | "hang"; backlog?: unknown[] | "fail" } = {}) {
  queryRaw.mockImplementation((...args: unknown[]) => {
    const sql = sqlOf(args)
    if (sql.includes("field_translation")) {
      if (opts.backlog === "fail") return Promise.reject(new Error("backlog boom"))
      return Promise.resolve(opts.backlog ?? [])
    }
    if (opts.db === "fail") return Promise.reject(new Error("Access denied for user 'scrum_app' password=secret"))
    if (opts.db === "hang") return new Promise(() => {})
    return Promise.resolve([{ 1: 1 }])
  })
}

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "error").mockImplementation(() => {})
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kanflow-health-"))
    process.env.WORKER_HEARTBEAT_FILE = path.join(tmp, "worker-heartbeat.json")
    delete process.env.AI_TRANSLATION_WORKER
    delete process.env.NEXT_DIST_DIR
    resetBuildIdCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fs.rmSync(tmp, { recursive: true, force: true })
    process.env = { ...savedEnv }
    resetBuildIdCache()
  })

  it("returns 200 with db ok and ollama ok when both respond", async () => {
    answer()
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe("ok")
    expect(body.db).toBe("ok")
    expect(body.ollama).toBe("ok")
    expect(typeof body.uptime).toBe("number")
    expect(body).not.toHaveProperty("version")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("stays 200 when ollama is unreachable (non-fatal)", async () => {
    answer()
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ollama).toBe("unreachable")
  })

  it("reports ollama unreachable on non-2xx", async () => {
    answer()
    fetchMock.mockResolvedValue(new Response("", { status: 500 }))

    const body = await (await GET()).json()

    expect(body.ollama).toBe("unreachable")
  })

  it("returns 503 without leaking error details when the database fails", async () => {
    answer({ db: "fail", backlog: "fail" })
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))

    const res = await GET()
    const text = await res.text()
    const body = JSON.parse(text)

    expect(res.status).toBe(503)
    expect(body.status).toBe("error")
    expect(body.db).toBe("error")
    expect(body.translation).toBeNull()
    expect(text).not.toContain("secret")
    expect(text).not.toContain("scrum_app")
    expect(text).not.toContain("boom")
  })

  it("returns 503 when the database does not answer within 3s", async () => {
    vi.useFakeTimers()
    answer({ db: "hang" })
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))

    const pending = GET()
    await vi.advanceTimersByTimeAsync(3001)
    const res = await pending

    expect(res.status).toBe(503)
    expect((await res.json()).db).toBe("error")
  })

  describe("translation backlog", () => {
    it("reports pending count, oldest pending age, running and failed", async () => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-09-23T10:00:00Z"))
      answer({
        backlog: [
          { status: "pending", n: BigInt(12), oldest: new Date("2026-09-23T09:55:00Z") },
          { status: "running", n: 1, oldest: new Date("2026-09-23T09:59:00Z") },
          { status: "failed", n: BigInt(4), oldest: "2026-09-15T01:28:28.607Z" },
        ],
      })
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))

      const body = await (await GET()).json()

      expect(body.translation).toEqual({ pending: 12, oldestPendingAgeSec: 300, running: 1, failed: 4 })
      const backlogCall = queryRaw.mock.calls.map(sqlOf).find((s) => s.includes("field_translation"))
      expect(backlogCall).toContain("GROUP BY status")
    })

    it("an empty queue is zeros with no age", async () => {
      answer({ backlog: [] })
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const body = await (await GET()).json()
      expect(body.translation).toEqual({ pending: 0, oldestPendingAgeSec: null, running: 0, failed: 0 })
    })

    it("a failing backlog query is non-fatal (translation: null, still 200)", async () => {
      answer({ backlog: "fail" })
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const res = await GET()
      expect(res.status).toBe(200)
      expect((await res.json()).translation).toBeNull()
    })
  })

  describe("worker heartbeat", () => {
    function writeHeartbeat(ageMs: number) {
      fs.writeFileSync(
        process.env.WORKER_HEARTBEAT_FILE as string,
        JSON.stringify({ v: 1, pid: 99, writtenAt: new Date(Date.now() - ageMs).toISOString(), intervalMs: 60_000 })
      )
    }

    it("absent when the worker never wrote a heartbeat; expected by default (external mode)", async () => {
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const res = await GET()
      expect(res.status).toBe(200)
      expect((await res.json()).worker).toEqual({ status: "absent", heartbeatAgeSec: null, expected: true, mode: "external" })
    })

    it("ok for a fresh heartbeat", async () => {
      writeHeartbeat(20_000)
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const body = await (await GET()).json()
      expect(body.worker.status).toBe("ok")
      expect(body.worker.heartbeatAgeSec).toBeGreaterThanOrEqual(19)
    })

    it("stale after three missed heartbeats - still 200", async () => {
      writeHeartbeat(10 * 60_000)
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const res = await GET()
      expect(res.status).toBe(200)
      expect((await res.json()).worker.status).toBe("stale")
    })

    it("not expected when translations run in-process", async () => {
      process.env.AI_TRANSLATION_WORKER = "inprocess"
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      expect((await (await GET()).json()).worker).toMatchObject({ expected: false, mode: "inprocess" })
    })
  })

  describe("buildId", () => {
    it("returns the BUILD_ID of the served dist dir", async () => {
      fs.mkdirSync(path.join(tmp, ".next-x"))
      fs.writeFileSync(path.join(tmp, ".next-x", "BUILD_ID"), "abc123\n")
      vi.spyOn(process, "cwd").mockReturnValue(tmp)
      process.env.NEXT_DIST_DIR = ".next-x"
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      expect((await (await GET()).json()).buildId).toBe("abc123")
    })

    it("is null when there is no BUILD_ID (e.g. next dev)", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tmp)
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      expect((await (await GET()).json()).buildId).toBeNull()
    })
  })
})
