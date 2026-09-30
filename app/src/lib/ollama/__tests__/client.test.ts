import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s: string) => s }))

import { gate } from "@/lib/translation/priority-gate"
import { configureOllamaConcurrency, ollamaQueueStatus, ollamaRequest } from "../client"
import {
  OllamaAbortedError,
  OllamaHttpError,
  OllamaTimeoutError,
  OllamaUnavailableError,
  ollamaErrorResponse,
} from "../errors"
import { ollamaChatStream, ollamaGenerate } from "@/lib/ollama"

const enc = new TextEncoder()

interface FetchCall {
  url: string
  body: Record<string, unknown>
  signal: AbortSignal
}

/** fetch mock whose pending responses are resolved manually, honoring abort. */
function installFetch() {
  const calls: FetchCall[] = []
  const pending: { resolve: (r: Response) => void; reject: (e: unknown) => void }[] = []
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    const signal = init.signal as AbortSignal
    calls.push({ url, body: JSON.parse(String(init.body)), signal })
    return new Promise<Response>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason)
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      pending.push({ resolve, reject })
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return { calls, pending, fetchMock }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })
}

/** Streaming body that emits `parts` and stays open until `close()`. */
function openStream(parts: string[]) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c
      for (const p of parts) c.enqueue(enc.encode(p))
    },
    cancel() {
      cancelled = true
    },
  })
  return {
    response: new Response(body, { status: 200 }),
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    close: () => ctrl.close(),
    cancelled: () => cancelled,
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

const base = { endpoint: "chat" as const, body: { model: "m" }, timeoutMs: 5_000, label: "test" }

beforeEach(() => {
  configureOllamaConcurrency(2)
})

afterEach(() => {
  vi.unstubAllGlobals()
  expect(gate.high_active).toBe(0)
})

describe("ollamaRequest (non-stream)", () => {
  test("posts to the endpoint with stream:false and returns parsed JSON", async () => {
    const { calls, pending } = installFetch()
    const p = ollamaRequest<{ ok: boolean }>({ ...base, priority: "user" })
    await flush()
    expect(calls[0].url).toMatch(/\/api\/chat$/)
    expect(calls[0].body).toEqual({ model: "m", stream: false })
    pending[0].resolve(json({ ok: true }))
    await expect(p).resolves.toEqual({ ok: true })
    expect(ollamaQueueStatus().active).toBe(0)
  })

  test("user calls hold the priority gate for their duration and preempt background tickets", async () => {
    const { pending } = installFetch()
    const ticket = gate.beginBackground()
    const p = ollamaRequest({ ...base, priority: "user" })
    expect(gate.high_active).toBe(1)
    expect(ticket.signal.aborted).toBe(true)
    expect(ticket.preempted).toBe(true)
    ticket.end()
    await flush()
    pending[0].resolve(json({}))
    await p
    expect(gate.high_active).toBe(0)
  })

  test("background calls do not enter the priority gate", async () => {
    const { pending } = installFetch()
    const p = ollamaRequest({ ...base, priority: "background" })
    expect(gate.high_active).toBe(0)
    await flush()
    pending[0].resolve(json({}))
    await p
  })

  test("caller abort aborts the fetch and maps to OllamaAbortedError", async () => {
    const { calls } = installFetch()
    const ac = new AbortController()
    const p = ollamaRequest({ ...base, priority: "user", signal: ac.signal })
    await flush()
    ac.abort()
    await expect(p).rejects.toBeInstanceOf(OllamaAbortedError)
    expect(calls[0].signal.aborted).toBe(true)
    expect(ollamaQueueStatus().active).toBe(0)
  })

  test("already-aborted caller signal never reaches fetch", async () => {
    const { fetchMock } = installFetch()
    await expect(ollamaRequest({ ...base, priority: "user", signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      OllamaAbortedError
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("timeout aborts the fetch and maps to OllamaTimeoutError", async () => {
    const { calls } = installFetch()
    const err = await ollamaRequest({ ...base, priority: "user", timeoutMs: 20 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OllamaTimeoutError)
    expect((err as OllamaTimeoutError).timeoutMs).toBe(20)
    expect((err as Error).name).toBe("TimeoutError") // worker compatibility
    expect(calls[0].signal.aborted).toBe(true)
  })

  test("a caller-supplied AbortSignal.timeout maps to OllamaTimeoutError", async () => {
    installFetch()
    const err = await ollamaRequest({ ...base, priority: "user", signal: AbortSignal.timeout(10) }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OllamaTimeoutError)
  })

  test("network failure maps to OllamaUnavailableError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))))
    const err = await ollamaRequest({ ...base, priority: "user" }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OllamaUnavailableError)
    expect(ollamaQueueStatus().active).toBe(0)
  })

  test("non-2xx maps to OllamaHttpError with status and detail", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("model not found", { status: 404 }))))
    const err = await ollamaRequest({ ...base, priority: "user" }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OllamaHttpError)
    expect((err as OllamaHttpError).status).toBe(404)
    expect((err as OllamaHttpError).detail).toBe("model not found")
  })

  test("invalid JSON body maps to OllamaHttpError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{oops", { status: 200 }))))
    await expect(ollamaRequest({ ...base, priority: "user" })).rejects.toBeInstanceOf(OllamaHttpError)
  })
})

describe("concurrency", () => {
  test("limits in-flight requests and serves queued user calls before background", async () => {
    configureOllamaConcurrency(1)
    const { calls, pending } = installFetch()
    const first = ollamaRequest({ ...base, priority: "background", body: { n: 1 } })
    await flush()
    const bg = ollamaRequest({ ...base, priority: "background", body: { n: 2 } })
    await flush()
    const user = ollamaRequest({ ...base, priority: "user", body: { n: 3 } })
    await flush()
    expect(calls.map((c) => c.body.n)).toEqual([1])
    expect(ollamaQueueStatus()).toMatchObject({ active: 1, queuedUser: 1, queuedBackground: 1 })

    pending[0].resolve(json({}))
    await first
    await flush()
    expect(calls.map((c) => c.body.n)).toEqual([1, 3])

    pending[1].resolve(json({}))
    await user
    await flush()
    expect(calls.map((c) => c.body.n)).toEqual([1, 3, 2])
    pending[2].resolve(json({}))
    await bg
  })

  test("a queued call aborted by its caller leaves the queue without fetching", async () => {
    configureOllamaConcurrency(1)
    const { calls, pending } = installFetch()
    const first = ollamaRequest({ ...base, priority: "user" })
    await flush()
    const ac = new AbortController()
    const queued = ollamaRequest({ ...base, priority: "user", signal: ac.signal })
    await flush()
    ac.abort()
    await expect(queued).rejects.toBeInstanceOf(OllamaAbortedError)
    expect(ollamaQueueStatus().queuedUser).toBe(0)
    pending[0].resolve(json({}))
    await first
    expect(calls).toHaveLength(1)
  })
})

describe("ollamaRequest (stream)", () => {
  test("yields parsed NDJSON chunks, including lines split across reads", async () => {
    const { pending, calls } = installFetch()
    const s = openStream(['{"n":1}\n{"n"', ':2}\n'])
    const p = ollamaRequest<{ n: number }>({ ...base, priority: "user", stream: true })
    await flush()
    expect(calls[0].body.stream).toBe(true)
    pending[0].resolve(s.response)
    const stream = await p
    s.push('{"n":3}\n')
    s.close()
    const seen: number[] = []
    for await (const c of stream) seen.push(c.n)
    expect(seen).toEqual([1, 2, 3])
    expect(ollamaQueueStatus().active).toBe(0)
  })

  test("caller abort mid-stream aborts upstream and throws OllamaAbortedError", async () => {
    const { pending, calls } = installFetch()
    const s = openStream(['{"n":1}\n'])
    const ac = new AbortController()
    const p = ollamaRequest<{ n: number }>({ ...base, priority: "user", stream: true, signal: ac.signal })
    await flush()
    pending[0].resolve(s.response)
    const stream = await p
    const run = (async () => {
      for await (const c of stream) {
        expect(c.n).toBe(1)
        ac.abort()
      }
    })()
    await expect(run).rejects.toBeInstanceOf(OllamaAbortedError)
    expect(calls[0].signal.aborted).toBe(true)
    expect(s.cancelled()).toBe(true)
    expect(ollamaQueueStatus().active).toBe(0)
  })

  test("cancel() releases the slot and gate even if the stream was never iterated", async () => {
    const { pending, calls } = installFetch()
    const s = openStream([])
    const p = ollamaRequest({ ...base, priority: "user", stream: true })
    await flush()
    pending[0].resolve(s.response)
    const stream = await p
    expect(gate.high_active).toBe(1)
    stream.cancel()
    expect(calls[0].signal.aborted).toBe(true)
    expect(gate.high_active).toBe(0)
    expect(ollamaQueueStatus().active).toBe(0)
  })
})

describe("ollama.ts wrappers", () => {
  test("ollamaChatStream yields content until done and forwards the caller signal", async () => {
    const { pending, calls } = installFetch()
    const s = openStream([
      '{"message":{"content":"Hel"},"done":false}\n',
      '{"message":{"content":"lo"},"done":false}\n{"message":{"content":""},"done":true}\n',
    ])
    const ac = new AbortController()
    const out: string[] = []
    const run = (async () => {
      for await (const c of ollamaChatStream([{ role: "user", content: "hi" }], { signal: ac.signal, label: "t" })) out.push(c)
    })()
    await flush()
    pending[0].resolve(s.response)
    await run
    expect(out.join("")).toBe("Hello")
    expect(calls[0].body.messages).toEqual([{ role: "user", content: "hi" }])
    expect(s.cancelled()).toBe(true) // upstream closed after done
    expect(ollamaQueueStatus().active).toBe(0)
  })

  test("ollamaGenerate with background:true skips the gate and trims output", async () => {
    const { pending } = installFetch()
    const p = ollamaGenerate("x", { background: true })
    expect(gate.high_active).toBe(0)
    await flush()
    pending[0].resolve(json({ response: "  hi  ", done: true }))
    await expect(p).resolves.toBe("hi")
  })
})

describe("ollamaErrorResponse", () => {
  test.each([
    [new OllamaAbortedError(), 499, "ollama_aborted"],
    [new OllamaTimeoutError(1000), 408, "ollama_timeout"],
    [new OllamaUnavailableError(), 503, "ollama_unavailable"],
    [new OllamaHttpError(500, "boom"), 502, "ollama_http_error"],
    [new Error("other"), 500, "ai_error"],
  ])("maps %s", async (err, status, code) => {
    const res = ollamaErrorResponse(err)
    expect(res.status).toBe(status)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe(code)
    expect(body.message).toBeTruthy()
  })
})
