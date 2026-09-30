import diagnosticsChannel from "node:diagnostics_channel"
import http from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { installHttpMetrics, REQUEST_START, RESPONSE_FINISH } from "../http-hook"
import { MetricsStore } from "../store"

function response(statusCode: number, contentType = "application/json") {
  return { statusCode, getHeader: (n: string) => (n === "content-type" ? contentType : undefined) }
}

let uninstall: (() => void) | null = null
afterEach(() => {
  uninstall?.()
  uninstall = null
})

describe("installHttpMetrics", () => {
  it("times /api requests per route template between start and finish", () => {
    let t = 0
    const store = new MetricsStore()
    uninstall = installHttpMetrics(store, () => t)
    const res = response(200)
    diagnosticsChannel.channel(REQUEST_START).publish({ request: { url: "/api/projects/cmg1abc2def3ghi4jkl5mno6/backlog?x=1", method: "get" }, response: res })
    t = 42
    diagnosticsChannel.channel(RESPONSE_FINISH).publish({ request: {}, response: res })
    expect(store.routes()).toEqual([expect.objectContaining({ route: "/api/projects/:id/backlog", method: "GET", count: 1, p50: 42 })])
  })

  it("ignores non-API paths and finishes without a start", () => {
    const store = new MetricsStore()
    uninstall = installHttpMetrics(store, () => 0)
    const res = response(200)
    diagnosticsChannel.channel(REQUEST_START).publish({ request: { url: "/projects/p1", method: "GET" }, response: res })
    diagnosticsChannel.channel(RESPONSE_FINISH).publish({ request: {}, response: res })
    diagnosticsChannel.channel(RESPONSE_FINISH).publish({ request: {}, response: response(500) })
    expect(store.totals().count).toBe(0)
  })

  it("flags event streams and counts 5xx", () => {
    const store = new MetricsStore()
    uninstall = installHttpMetrics(store, () => 0)
    const sse = response(200, "text/event-stream; charset=utf-8")
    const failed = response(502)
    diagnosticsChannel.channel(REQUEST_START).publish({ request: { url: "/api/chat", method: "POST" }, response: sse })
    diagnosticsChannel.channel(REQUEST_START).publish({ request: { url: "/api/x", method: "GET" }, response: failed })
    diagnosticsChannel.channel(RESPONSE_FINISH).publish({ request: {}, response: sse })
    diagnosticsChannel.channel(RESPONSE_FINISH).publish({ request: {}, response: failed })
    expect(store.routes().find((r) => r.route === "/api/chat")?.p95).toBeNull()
    expect(store.totals()).toEqual({ count: 2, errors: 1 })
  })

  it("stops recording after uninstall", () => {
    const store = new MetricsStore()
    installHttpMetrics(store, () => 0)()
    const res = response(200)
    diagnosticsChannel.channel(REQUEST_START).publish({ request: { url: "/api/a" }, response: res })
    diagnosticsChannel.channel(RESPONSE_FINISH).publish({ request: {}, response: res })
    expect(store.totals().count).toBe(0)
  })

  it("receives the real events of a Node HTTP server", async () => {
    const store = new MetricsStore()
    uninstall = installHttpMetrics(store)
    const server = http.createServer((_req, res) => {
      res.statusCode = 201
      res.end("ok")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const { port } = server.address() as { port: number }
    await fetch(`http://127.0.0.1:${port}/api/health`)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect(store.routes()).toEqual([expect.objectContaining({ route: "/api/health", method: "GET", count: 1 })])
  })
})
