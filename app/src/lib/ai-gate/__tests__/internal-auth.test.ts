import { describe, expect, test, vi } from "vitest"
import { checkInternalRequest, hostnameOf, isLoopbackHost } from "../internal-auth"
import { parsePeers, loadAiGateConfig } from "../config"
import { parseAiBusy, probePeer } from "../peer-client"

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe("checkInternalRequest", () => {
  test("accepts loopback + correct token", () => {
    expect(checkInternalRequest(headers({ host: "127.0.0.1:3000", "x-internal-token": "s3cret" }), "s3cret")).toEqual({ ok: true })
    expect(checkInternalRequest(headers({ host: "[::1]:3001", "x-internal-token": "s3cret" }), "s3cret").ok).toBe(true)
  })

  test("rejects wrong / missing token with 403", () => {
    expect(checkInternalRequest(headers({ host: "localhost:3000", "x-internal-token": "nope" }), "s3cret")).toMatchObject({ status: 403 })
    expect(checkInternalRequest(headers({ host: "localhost:3000" }), "s3cret")).toMatchObject({ status: 403 })
  })

  test("503 when the server has no token configured", () => {
    expect(checkInternalRequest(headers({ host: "localhost", "x-internal-token": "" }), undefined)).toMatchObject({ status: 503 })
  })

  test("404 for non-loopback host or proxied remote client", () => {
    expect(checkInternalRequest(headers({ host: "pp-21.example:3000", "x-internal-token": "s3cret" }), "s3cret")).toMatchObject({ status: 404 })
    expect(
      checkInternalRequest(headers({ host: "127.0.0.1:3000", "x-forwarded-for": "10.0.0.5", "x-internal-token": "s3cret" }), "s3cret")
    ).toMatchObject({ status: 404 })
  })

  test("hostname parsing", () => {
    expect(hostnameOf("LOCALHOST:3000")).toBe("localhost")
    expect(hostnameOf("[::1]:3000")).toBe("[::1]")
    expect(isLoopbackHost(null)).toBe(false)
  })
})

describe("config", () => {
  test("parsePeers normalizes, dedupes and drops junk", () => {
    expect(parsePeers("http://127.0.0.1:3000/, http://127.0.0.1:3001,ftp://x, nonsense,http://127.0.0.1:3000")).toEqual([
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
    ])
    expect(parsePeers(undefined, "4000")).toEqual(["http://127.0.0.1:4000"])
    expect(parsePeers("none")).toEqual([])
  })

  test("loadAiGateConfig reads token and falls back on invalid numbers", () => {
    const c = loadAiGateConfig({ INTERNAL_API_TOKEN: " t ", AI_GATE_POLL_MS: "-5", NODE_ENV: "test" })
    expect(c.token).toBe("t")
    expect(c.pollMs).toBe(1_000)
  })
})

describe("peer-client", () => {
  test("parseAiBusy validates the payload", () => {
    expect(parseAiBusy({ busyHigh: 2, idleForMs: 10 })).toEqual({ busyHigh: 2, idleForMs: 10 })
    expect(parseAiBusy({ busyHigh: 0, idleForMs: null })).toEqual({ busyHigh: 0, idleForMs: null })
    expect(parseAiBusy({ busyHigh: "1" })).toBeNull()
    expect(parseAiBusy(null)).toBeNull()
  })

  test("probePeer sends the token and maps failures to ok:false", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ busyHigh: 1, idleForMs: 0 }), { status: 200 }))
    await expect(probePeer("http://127.0.0.1:3000", "tok", { timeoutMs: 100, fetchImpl })).resolves.toEqual({ ok: true, busyHigh: 1, idleForMs: 0 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://127.0.0.1:3000/api/internal/ai-busy")
    expect((init.headers as Record<string, string>)["x-internal-token"]).toBe("tok")

    const refused = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    await expect(probePeer("http://x", null, { timeoutMs: 100, fetchImpl: refused })).resolves.toEqual({ ok: false, error: "fetch failed" })
    const forbidden = vi.fn(async () => new Response("{}", { status: 403 }))
    await expect(probePeer("http://x", null, { timeoutMs: 100, fetchImpl: forbidden })).resolves.toEqual({ ok: false, error: "HTTP 403" })
  })
})
