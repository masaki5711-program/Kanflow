import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const m = vi.hoisted(() => ({
  chat: vi.fn(),
  chatStream: vi.fn(),
  aiLog: vi.fn(),
}))

vi.mock("@/lib/ollama", () => ({
  ollamaChat: m.chat,
  ollamaChatStream: m.chatStream,
  detectLang: (t: string) => (/[぀-ヿ]/.test(t) ? "ja" : "id"),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: m.aiLog }))

const {
  normalizeLang,
  buildAnalysisSystem,
  analysisStreamResponse,
  streamAnalysis,
  streamingResponse,
  analysisJSON,
  detectLang,
} = await import("@/lib/ai-analysis")
const { OllamaAbortedError, OllamaUnavailableError, OllamaTimeoutError } = await import("@/lib/ollama/errors")

async function* gen(chunks: string[], failAfter?: unknown) {
  for (const c of chunks) yield c
  if (failAfter !== undefined) throw failAfter
}

beforeEach(() => vi.clearAllMocks())

describe("language helpers", () => {
  it("normalizes unknown hints to ja", () => {
    expect(normalizeLang("en")).toBe("en")
    expect(normalizeLang("id")).toBe("id")
    expect(normalizeLang("ja")).toBe("ja")
    expect(normalizeLang("fr")).toBe("ja")
    expect(normalizeLang(undefined)).toBe("ja")
  })

  it("builds a localized system prompt with optional extra", () => {
    const en = buildAnalysisSystem("EXTRA", "en")
    expect(en).toContain("English only")
    expect(en).toContain("EXTRA")
    expect(buildAnalysisSystem(undefined, "id")).toContain("Bahasa Indonesia")
    expect(buildAnalysisSystem()).toContain("日本語のみ")
    expect(detectLang("こんにちは")).toBe("ja")
  })
})

describe("analysisStreamResponse", () => {
  it("streams text with no-cache headers and passes analysis options", async () => {
    m.chatStream.mockReturnValue(gen(["Hel", "lo"]))
    const res = await analysisStreamResponse([{ role: "user", content: "q" }], { label: "L", format: "json", numPredict: 9 })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform")
    expect(await res.text()).toBe("Hello")
    const opts = m.chatStream.mock.calls[0][1]
    expect(opts).toMatchObject({ role: "analysis", temperature: 0.3, label: "L", format: "json", numPredict: 9, think: false })
    expect(m.aiLog).toHaveBeenCalledWith("ANALYSIS_DONE", expect.stringContaining("L 5 chars"))
  })

  it("maps a pre-stream failure to an HTTP error response", async () => {
    m.chatStream.mockReturnValue(gen([], new OllamaUnavailableError()))
    const res = await analysisStreamResponse([])
    expect(res.status).toBe(503)
    expect(m.aiLog).toHaveBeenCalledWith("CHAT_ERROR", expect.any(String))

    m.chatStream.mockReturnValue(gen([], new OllamaAbortedError()))
    const aborted = await analysisStreamResponse([])
    expect(aborted.status).toBe(499)
    expect(m.aiLog).toHaveBeenCalledWith("CHAT_ABORT", expect.any(String))
  })

  it("appends a trailing [error] line on mid-stream failure", async () => {
    m.chatStream.mockReturnValue(gen(["part"], new OllamaTimeoutError(1000)))
    const res = await analysisStreamResponse([])
    const text = await res.text()
    expect(text.startsWith("part\n\n[error] ")).toBe(true)

    m.chatStream.mockReturnValue(gen(["x"], new OllamaAbortedError()))
    const res2 = await analysisStreamResponse([])
    expect(await res2.text()).toContain("[error]")
    expect(m.aiLog).toHaveBeenCalledWith("CHAT_ABORT", expect.stringContaining("client disconnected"))
  })

  it("aborts upstream when the client cancels", async () => {
    let seenSignal: AbortSignal | undefined
    m.chatStream.mockImplementation((_msgs: unknown, opts: { signal: AbortSignal }) => {
      seenSignal = opts.signal
      return gen(["a", "b", "c"])
    })
    const res = await analysisStreamResponse([])
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(seenSignal?.aborted).toBe(true)
  })
})

describe("streamAnalysis (deprecated)", () => {
  it("returns a readable stream of the chunks", async () => {
    m.chatStream.mockReturnValue(gen(["x", "y"]))
    const res = streamingResponse(streamAnalysis([], { temperature: 0.1 }))
    expect(await res.text()).toBe("xy")
    expect(m.chatStream.mock.calls[0][1].temperature).toBe(0.1)
  })
})

describe("analysisJSON", () => {
  const schema = z.object({ a: z.number() })

  it("parses and validates JSON", async () => {
    m.chat.mockResolvedValue('{"a":1}')
    await expect(analysisJSON([], schema)).resolves.toEqual({ a: 1 })
    expect(m.chat.mock.calls[0][1]).toMatchObject({ role: "analysis", format: "json", think: false, label: "analysis-json" })
  })

  it("retries malformed or invalid JSON with a corrective system message", async () => {
    m.chat.mockResolvedValueOnce("not json").mockResolvedValueOnce('{"a":"x"}').mockResolvedValueOnce('{"a":2}')
    await expect(analysisJSON([{ role: "user", content: "q" }], schema)).resolves.toEqual({ a: 2 })
    expect(m.chat).toHaveBeenCalledTimes(3)
    const lastMsgs = m.chat.mock.calls[2][0]
    expect(lastMsgs).toHaveLength(3)
    expect(lastMsgs[2].role).toBe("system")
  })

  it("throws the last error after exhausting retries", async () => {
    m.chat.mockResolvedValue("nope")
    await expect(analysisJSON([], schema, { maxRetries: 1 })).rejects.toThrow()
    expect(m.chat).toHaveBeenCalledTimes(2)
  })

  it("wraps a non-Error failure", async () => {
    m.chat.mockRejectedValue("weird")
    await expect(analysisJSON([], schema, { maxRetries: 0 })).rejects.toThrow("analysisJSON failed")
  })

  it("does not retry transport failures", async () => {
    m.chat.mockRejectedValue(new OllamaUnavailableError())
    await expect(analysisJSON([], schema)).rejects.toBeInstanceOf(OllamaUnavailableError)
    expect(m.chat).toHaveBeenCalledTimes(1)
  })
})
