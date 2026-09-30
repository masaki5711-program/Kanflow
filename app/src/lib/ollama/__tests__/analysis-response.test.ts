import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s: string) => s }))

import { analysisStreamResponse } from "@/lib/ai-analysis"
import { primeStream } from "../prime"

afterEach(() => {
  vi.unstubAllGlobals()
})

const enc = new TextEncoder()

describe("primeStream", () => {
  test("replays the first item then continues the source", async () => {
    async function* src() {
      yield 1
      yield 2
    }
    const it = await primeStream(src())
    const out: number[] = []
    for await (const v of it) out.push(v)
    expect(out).toEqual([1, 2])
  })

  test("throws errors from the first pull", async () => {
    async function* src(): AsyncGenerator<number> {
      throw new Error("boom")
    }
    await expect(primeStream(src())).rejects.toThrow("boom")
  })
})

describe("analysisStreamResponse", () => {
  test("returns a 503 JSON error when Ollama is unreachable before any output", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))))
    const res = await analysisStreamResponse([{ role: "user", content: "x" }], { label: "t" })
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: string }).error).toBe("ollama_unavailable")
  })

  test("returns 499 when the client is already gone", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const res = await analysisStreamResponse([{ role: "user", content: "x" }], { signal: AbortSignal.abort() })
    expect(res.status).toBe(499)
  })

  test("streams text and cancelling the response aborts the upstream request", async () => {
    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        upstreamSignal = init.signal as AbortSignal
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode('{"message":{"content":"part1"},"done":false}\n'))
            // stays open: model still generating
          },
        })
        return Promise.resolve(new Response(body, { status: 200 }))
      })
    )
    const res = await analysisStreamResponse([{ role: "user", content: "x" }])
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe("part1")
    await reader.cancel()
    expect(upstreamSignal?.aborted).toBe(true)
  })
})
