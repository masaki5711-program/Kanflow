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

/** A request as the ops scripts send it (http://127.0.0.1:3000, socket address filled in by Next). */
function local(): Request {
  return new Request("http://127.0.0.1:3000/api/health", { headers: { host: "127.0.0.1:3000", "x-forwarded-for": "::ffff:127.0.0.1" } })
}

function remote(extra: Record<string, string> = {}): Request {
  return new Request("http://kanflow.example.local/api/health", {
    headers: { host: "kanflow.example.local:3000", "x-forwarded-for": "10.1.2.3", ...extra },
  })
}

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
    delete process.env.COLLABORA_INTERNAL_URL
    delete process.env.NEXT_PUBLIC_COLLABORA_URL
    delete process.env.COLLABORA_MONITOR
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

    const res = await GET(local())
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

    const res = await GET(local())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ollama).toBe("unreachable")
  })

  it("reports ollama unreachable on non-2xx", async () => {
    answer()
    fetchMock.mockResolvedValue(new Response("", { status: 500 }))

    const body = await (await GET(local())).json()

    expect(body.ollama).toBe("unreachable")
  })

  it("returns 503 without leaking error details when the database fails", async () => {
    answer({ db: "fail", backlog: "fail" })
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))

    const res = await GET(local())
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

    const pending = GET(local())
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

      const body = await (await GET(local())).json()

      expect(body.translation).toEqual({ pending: 12, oldestPendingAgeSec: 300, running: 1, failed: 4 })
      const backlogCall = queryRaw.mock.calls.map(sqlOf).find((s) => s.includes("field_translation"))
      expect(backlogCall).toContain("GROUP BY status")
    })

    it("an empty queue is zeros with no age", async () => {
      answer({ backlog: [] })
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const body = await (await GET(local())).json()
      expect(body.translation).toEqual({ pending: 0, oldestPendingAgeSec: null, running: 0, failed: 0 })
    })

    it("a failing backlog query is non-fatal (translation: null, still 200)", async () => {
      answer({ backlog: "fail" })
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const res = await GET(local())
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
      const res = await GET(local())
      expect(res.status).toBe(200)
      expect((await res.json()).worker).toEqual({ status: "absent", heartbeatAgeSec: null, expected: true, mode: "external" })
    })

    it("ok for a fresh heartbeat", async () => {
      writeHeartbeat(20_000)
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const body = await (await GET(local())).json()
      expect(body.worker.status).toBe("ok")
      expect(body.worker.heartbeatAgeSec).toBeGreaterThanOrEqual(19)
    })

    it("stale after three missed heartbeats - still 200", async () => {
      writeHeartbeat(10 * 60_000)
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const res = await GET(local())
      expect(res.status).toBe(200)
      expect((await res.json()).worker.status).toBe("stale")
    })

    it("not expected when translations run in-process", async () => {
      process.env.AI_TRANSLATION_WORKER = "inprocess"
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      expect((await (await GET(local())).json()).worker).toMatchObject({ expected: false, mode: "inprocess" })
    })
  })

  describe("collabora", () => {
    const collaboraCalls = () =>
      fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/hosting/discovery"))

    function routeFetch(collabora: "ok" | "500" | "down") {
      fetchMock.mockImplementation((url: unknown) => {
        if (String(url).includes("/hosting/discovery")) {
          if (collabora === "down") return Promise.reject(new Error("ECONNREFUSED"))
          return Promise.resolve(new Response("<wopi-discovery/>", { status: collabora === "ok" ? 200 : 500 }))
        }
        return Promise.resolve(new Response("{}", { status: 200 }))
      })
    }

    it("is disabled (and not probed) when no Collabora URL is configured", async () => {
      answer()
      routeFetch("ok")
      const body = await (await GET(local())).json()
      expect(body.collabora).toBe("disabled")
      expect(collaboraCalls()).toHaveLength(0)
    })

    it("probes COLLABORA_INTERNAL_URL/hosting/discovery and reports ok", async () => {
      process.env.COLLABORA_INTERNAL_URL = "http://127.0.0.1:9980/"
      process.env.NEXT_PUBLIC_COLLABORA_URL = "http://public.example:9980"
      answer()
      routeFetch("ok")
      const body = await (await GET(local())).json()
      expect(body.collabora).toBe("ok")
      expect(collaboraCalls()).toEqual(["http://127.0.0.1:9980/hosting/discovery"])
    })

    it("falls back to NEXT_PUBLIC_COLLABORA_URL like src/lib/collabora.ts", async () => {
      process.env.NEXT_PUBLIC_COLLABORA_URL = "http://public.example:9980"
      answer()
      routeFetch("ok")
      await GET(local())
      expect(collaboraCalls()).toEqual(["http://public.example:9980/hosting/discovery"])
    })

    it("unreachable on connection error - still 200 with status ok", async () => {
      process.env.COLLABORA_INTERNAL_URL = "http://127.0.0.1:9980"
      answer()
      routeFetch("down")
      const res = await GET(local())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.status).toBe("ok")
      expect(body.collabora).toBe("unreachable")
    })

    it("unreachable on a non-2xx discovery response", async () => {
      process.env.COLLABORA_INTERNAL_URL = "http://127.0.0.1:9980"
      answer()
      routeFetch("500")
      expect((await (await GET(local())).json()).collabora).toBe("unreachable")
    })

    it("disabled by COLLABORA_MONITOR=off even when a URL is set", async () => {
      process.env.COLLABORA_INTERNAL_URL = "http://127.0.0.1:9980"
      process.env.COLLABORA_MONITOR = "off"
      answer()
      routeFetch("ok")
      expect((await (await GET(local())).json()).collabora).toBe("disabled")
      expect(collaboraCalls()).toHaveLength(0)
    })

    it("is reported independently of the database status", async () => {
      process.env.COLLABORA_INTERNAL_URL = "http://127.0.0.1:9980"
      answer({ db: "fail", backlog: "fail" })
      routeFetch("ok")
      const res = await GET(local())
      expect(res.status).toBe(503)
      expect((await res.json()).collabora).toBe("ok")
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
      expect((await (await GET(local())).json()).buildId).toBe("abc123")
    })

    it("is null when there is no BUILD_ID (e.g. next dev)", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tmp)
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      expect((await (await GET(local())).json()).buildId).toBeNull()
    })
  })

  describe("anonymous remote callers (S-2)", () => {
    it("get only { status, db } and no component probe runs", async () => {
      answer()
      const res = await GET(remote())
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: "ok", db: "ok" })
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect(fetchMock).not.toHaveBeenCalled()
      expect(queryRaw.mock.calls.some((c) => sqlOf(c).includes("field_translation"))).toBe(false)
    })

    it("still get 503 when the database is down", async () => {
      answer({ db: "fail" })
      const res = await GET(remote())
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ status: "error", db: "error" })
    })

    it("cannot pass as local with a loopback Host but a remote X-Forwarded-For hop", async () => {
      answer()
      const res = await GET(remote({ host: "localhost:3000", "x-forwarded-for": "10.1.2.3, 127.0.0.1" }))
      expect(Object.keys(await res.json())).toEqual(["status", "db"])
    })

    it("get the full body with the INTERNAL_API_TOKEN header (wrong token: minimal)", async () => {
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      process.env.INTERNAL_API_TOKEN = "s3cret-token"
      const ok = await (await GET(remote({ "x-internal-token": "s3cret-token" }))).json()
      expect(ok).toHaveProperty("buildId")
      expect(ok).toHaveProperty("worker")
      const bad = await (await GET(remote({ "x-internal-token": "nope" }))).json()
      expect(bad).toEqual({ status: "ok", db: "ok" })
    })

    it("loopback over IPv6 gets the full body", async () => {
      answer()
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
      const req = new Request("http://[::1]:3000/api/health", { headers: { host: "[::1]:3000", "x-forwarded-for": "::1" } })
      expect(await (await GET(req)).json()).toHaveProperty("translation")
    })
  })
})
