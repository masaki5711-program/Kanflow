import { beforeEach, describe, expect, it, vi } from "vitest"

const ollamaRequest = vi.fn()
vi.mock("@/lib/ollama/client", () => ({ ollamaRequest: (...a: unknown[]) => ollamaRequest(...a) }))

const o = await import("@/lib/ollama")

function streamOf<T>(chunks: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c
    },
  }
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of gen) out.push(v)
  return out
}

beforeEach(() => ollamaRequest.mockReset())

describe("detectLang", () => {
  it("detects Japanese characters", () => {
    expect(o.detectLang("こんにちは")).toBe("ja")
    expect(o.detectLang("Halo")).toBe("id")
  })
})

describe("ollamaGenerate", () => {
  it("builds the request body with defaults and trims the response", async () => {
    ollamaRequest.mockResolvedValue({ response: "  hasil  " })
    expect(await o.ollamaGenerate("p")).toBe("hasil")
    const req = ollamaRequest.mock.calls[0][0]
    expect(req).toMatchObject({ endpoint: "generate", priority: "user", label: "ollama.generate" })
    expect(req.body).toMatchObject({
      model: o.OLLAMA_MODELS.translate,
      prompt: "p",
      options: { num_ctx: o.OLLAMA_NUM_CTX, temperature: 0.2 },
    })
    expect(req.body).not.toHaveProperty("system")
    expect(req.body).not.toHaveProperty("think")
    expect(req.body.options).not.toHaveProperty("num_predict")
  })

  it("forwards system, think, numPredict, role and background priority", async () => {
    ollamaRequest.mockResolvedValue({})
    const signal = new AbortController().signal
    expect(
      await o.ollamaGenerate("p", {
        system: "sys",
        think: false,
        numPredict: 10,
        numCtx: 99,
        role: "vision",
        background: true,
        signal,
        timeoutMs: 5,
        label: "L",
      })
    ).toBe("")
    const req = ollamaRequest.mock.calls[0][0]
    expect(req).toMatchObject({ priority: "background", signal, timeoutMs: 5, label: "L" })
    expect(req.body).toMatchObject({
      model: o.OLLAMA_MODELS.vision,
      system: "sys",
      think: false,
      options: { num_ctx: 99, num_predict: 10 },
    })
  })

  it("passes an unknown role through as a raw model name", async () => {
    ollamaRequest.mockResolvedValue({ response: "x" })
    await o.ollamaGenerate("p", { role: "custom:1b" })
    expect(ollamaRequest.mock.calls[0][0].body.model).toBe("custom:1b")
  })
})

describe("ollamaGenerateStream", () => {
  it("yields response fragments until done", async () => {
    ollamaRequest.mockResolvedValue(streamOf([{ response: "a" }, {}, { response: "b", done: true }, { response: "c" }]))
    expect(await collect(o.ollamaGenerateStream("p"))).toEqual(["a", "b"])
    expect(ollamaRequest.mock.calls[0][0].stream).toBe(true)
  })
})

describe("translateTo", () => {
  it("returns empty for blank text without calling the model", async () => {
    expect(await o.translateTo("  ", "ja")).toBe("")
    expect(ollamaRequest).not.toHaveBeenCalled()
  })

  it("strips quotes from the translation and targets the language", async () => {
    ollamaRequest.mockResolvedValue({ response: "「こんにちは」" })
    expect(await o.translateTo("hello", "ja")).toBe("こんにちは")
    const req = ollamaRequest.mock.calls[0][0]
    expect(req.body.prompt).toContain("into Japanese")
    expect(req.body.think).toBe(false)
    expect(req.label).toBe("translate-to")
  })
})

describe("chat helpers", () => {
  const msgs: import("@/lib/ollama").ChatMessage[] = [
    { role: "user", content: "hi" },
    { role: "system", content: "sys" },
  ]
  const tools: import("@/lib/ollama").ChatToolDefinition[] = [
    { type: "function", function: { name: "t", description: "d", parameters: { type: "object", properties: {} } } },
  ]

  it("ollamaChat normalizes system messages and uses the analysis model", async () => {
    ollamaRequest.mockResolvedValue({ message: { content: " ok " } })
    expect(await o.ollamaChat(msgs, { tools, format: "json" })).toBe("ok")
    const req = ollamaRequest.mock.calls[0][0]
    expect(req.endpoint).toBe("chat")
    expect(req.body.model).toBe(o.OLLAMA_MODELS.analysis)
    expect(req.body.messages[0]).toEqual({ role: "system", content: "sys" })
    expect(req.body.tools).toBe(tools)
    expect(req.body.format).toBe("json")
    expect(req.body.options.temperature).toBe(0.3)
  })

  it("ollamaChat returns empty when there is no message and omits empty tools", async () => {
    ollamaRequest.mockResolvedValue({})
    expect(await o.ollamaChat([{ role: "user", content: "x" }], { tools: [] })).toBe("")
    expect(ollamaRequest.mock.calls[0][0].body).not.toHaveProperty("tools")
  })

  it("ollamaChatTurn returns content and tool calls", async () => {
    const calls = [{ function: { name: "t", arguments: {} } }]
    ollamaRequest.mockResolvedValue({ message: { content: " c ", tool_calls: calls } })
    expect(await o.ollamaChatTurn(msgs)).toEqual({ content: "c", tool_calls: calls })
    ollamaRequest.mockResolvedValue({})
    expect(await o.ollamaChatTurn(msgs)).toEqual({ content: "", tool_calls: [] })
  })

  it("ollamaChatStream yields content chunks until done", async () => {
    ollamaRequest.mockResolvedValue(
      streamOf([{ message: { content: "a" } }, { message: {} }, { message: { content: "b" }, done: true }, { message: { content: "c" } }])
    )
    expect(await collect(o.ollamaChatStream(msgs))).toEqual(["a", "b"])
  })

  it("ollamaChatStreamWithTools yields text then the last tool calls", async () => {
    const calls = [{ function: { name: "t", arguments: "{}" } }]
    ollamaRequest.mockResolvedValue(
      streamOf([
        { message: { content: "x" } },
        { message: { tool_calls: [] } },
        { message: { tool_calls: calls } },
        { done: true },
        { message: { content: "ignored" } },
      ])
    )
    expect(await collect(o.ollamaChatStreamWithTools(msgs, { tools }))).toEqual([
      { type: "text", chunk: "x" },
      { type: "tool_calls", calls },
    ])
  })

  it("ollamaChatStreamWithTools emits no tool event when none requested", async () => {
    ollamaRequest.mockResolvedValue(streamOf([{ message: { content: "x" } }]))
    expect(await collect(o.ollamaChatStreamWithTools(msgs))).toEqual([{ type: "text", chunk: "x" }])
  })
})
