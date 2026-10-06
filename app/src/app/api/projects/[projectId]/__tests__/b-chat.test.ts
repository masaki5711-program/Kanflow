import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const memberFindFirst = vi.fn()
const streamWithTools = vi.fn()
const runTool = vi.fn()
const buildProjectContext = vi.fn()
const aiLog = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/lib/ollama", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/ollama")>()
  return { ...orig, ollamaChatStreamWithTools: (...a: unknown[]) => streamWithTools(...a) }
})
vi.mock("@/lib/project-context", () => ({
  buildProjectContext: (...a: unknown[]) => buildProjectContext(...a),
  CHAT_SYSTEM_PROMPT: "SYS",
}))
vi.mock("@/lib/chat-tools", () => ({
  CHAT_TOOLS: [{ type: "function", function: { name: "list_backlog_items" } }],
  runTool: (...a: unknown[]) => runTool(...a),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: (...a: unknown[]) => aiLog(...a), aiLogTrunc: (s?: string) => s ?? "" }))

const { POST } = await import("../chat/route")
const { OllamaUnavailableError, OllamaAbortedError } = await import("@/lib/ollama/errors")

type Ev = { type: "text"; chunk: string } | { type: "tool_calls"; calls: unknown[] }

function turn(events: Ev[], error?: unknown) {
  return (async function* () {
    for (const e of events) yield e
    if (error) throw error
  })()
}

function req(body: unknown) {
  return new Request("http://localhost/api/projects/p1/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ projectId: "p1" }) }

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "u1", role: "member" } })
  memberFindFirst.mockReset().mockResolvedValue({ role: "dev" })
  streamWithTools.mockReset()
  runTool.mockReset().mockResolvedValue("TOOL-OUT")
  buildProjectContext.mockReset().mockResolvedValue("CTX")
  aiLog.mockReset()
})

describe("POST /api/projects/[projectId]/chat", () => {
  it("401 without session", async () => {
    authMock.mockResolvedValue(null)
    expect((await POST(req({ messages: [] }), ctx)).status).toBe(401)
    expect(streamWithTools).not.toHaveBeenCalled()
  })

  it("404 for non-member", async () => {
    memberFindFirst.mockResolvedValue(null)
    expect((await POST(req({ messages: [{ role: "user", content: "hi" }] }), ctx)).status).toBe(404)
    expect(buildProjectContext).not.toHaveBeenCalled()
  })

  it("400 on invalid body", async () => {
    expect((await POST(req("{bad"), ctx)).status).toBe(400)
    expect((await POST(req({ messages: [] }), ctx)).status).toBe(400)
    expect((await POST(req({ messages: [{ role: "system", content: "x" }] }), ctx)).status).toBe(400)
  })

  it("streams a plain answer, with project context and language lock", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "Hello " }, { type: "text", chunk: "world" }]))
    const res = await POST(req({ messages: [{ role: "user", content: "How are we doing?" }], lang: "en" }), ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    expect(await res.text()).toBe("Hello world")
    expect(buildProjectContext).toHaveBeenCalledWith("p1")
    const [messages, opts] = streamWithTools.mock.calls[0]
    expect(messages[0]).toEqual({ role: "system", content: "SYS" })
    expect(messages[1].content).toContain("CTX")
    expect(messages[2].content).toContain("only in English")
    expect(opts).toMatchObject({ label: "chat", think: false })
  })

  it("forces Japanese when the question contains Japanese even if UI is id", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "はい" }]))
    const res = await POST(req({ messages: [{ role: "user", content: "進捗はどうですか" }], lang: "id" }), ctx)
    await res.text()
    expect(streamWithTools.mock.calls[0][0][2].content).toContain("日本語のみ")
  })

  it("falls back to heuristic language when lang missing", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "ok" }]))
    const res = await POST(
      req({ messages: [{ role: "assistant", content: "hi" }, { role: "user", content: "Apa kabar sprint ini?" }] }),
      ctx
    )
    await res.text()
    expect(streamWithTools).toHaveBeenCalledTimes(1)
  })

  it("defaults to ja when there is no user message and no lang", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "ok" }]))
    const res = await POST(req({ messages: [{ role: "assistant", content: "hello" }] }), ctx)
    await res.text()
    expect(streamWithTools.mock.calls[0][0][2].content).toContain("日本語のみ")
  })

  it("maps a failure before the first token to a JSON error status", async () => {
    streamWithTools.mockReturnValueOnce(turn([], new OllamaUnavailableError()))
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }), ctx)
    expect(res.status).toBe(503)
  })

  it("maps an abort before the first token", async () => {
    streamWithTools.mockReturnValueOnce(turn([], new OllamaAbortedError()))
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }), ctx)
    expect(res.status).toBe(499)
  })

  it("runs tools scoped to the URL projectId, ignoring model-supplied project ids", async () => {
    streamWithTools
      .mockReturnValueOnce(
        turn([
          { type: "text", chunk: "Let me check. " },
          {
            type: "tool_calls",
            calls: [
              { id: "c1", function: { name: "list_backlog_items", arguments: '{"project_id":"OTHER","limit":3}' } },
              { id: "c2", function: { name: "get_sprint_metrics", arguments: { projectId: "OTHER" } } },
              { id: "c3", function: { name: "get_backlog_summary", arguments: "not json" } },
              { id: "c4", function: { name: "get_backlog_summary", arguments: "42" } },
            ],
          },
        ])
      )
      .mockReturnValueOnce(turn([{ type: "text", chunk: "Done." }]))

    const res = await POST(req({ messages: [{ role: "user", content: "list items" }], lang: "en" }), ctx)
    const text = await res.text()
    expect(text).toContain("Let me check.")
    expect(text).toContain("list_backlog_items, get_sprint_metrics")
    expect(text).toContain("Done.")
    expect(runTool).toHaveBeenCalledTimes(4)
    for (const call of runTool.mock.calls) expect(call[1].projectId).toBe("p1")
    expect(runTool.mock.calls[0][1].args).toEqual({ project_id: "OTHER", limit: 3 })
    expect(runTool.mock.calls[2][1].args).toEqual({})
    expect(runTool.mock.calls[3][1].args).toEqual({})

    const second = streamWithTools.mock.calls[1][0]
    const toolMsgs = second.filter((m: { role: string }) => m.role === "tool")
    expect(toolMsgs).toHaveLength(4)
    expect(toolMsgs[0]).toMatchObject({ name: "list_backlog_items", tool_call_id: "c1" })
    expect(toolMsgs[0].content).toContain("TOOL-OUT")
    expect(toolMsgs[0].content).toContain("MUST be written in English")
  })

  it("stops after the tool iteration limit", async () => {
    const toolTurn = () =>
      turn([{ type: "tool_calls", calls: [{ id: "c", function: { name: "get_backlog_summary", arguments: {} } }] }])
    streamWithTools.mockImplementation(toolTurn)
    const res = await POST(req({ messages: [{ role: "user", content: "loop" }], lang: "id" }), ctx)
    const text = await res.text()
    expect(text).toContain("tool iteration limit reached")
    expect(streamWithTools).toHaveBeenCalledTimes(4)
  })

  it("after the tool turns, answers in a clean tool-free pass built from the gathered material", async () => {
    const toolTurn = () => turn([{ type: "tool_calls", calls: [{ id: "c", function: { name: "get_backlog_summary", arguments: {} } }] }])
    streamWithTools.mockImplementationOnce(toolTurn).mockImplementationOnce(toolTurn).mockImplementationOnce(toolTurn)
    streamWithTools.mockImplementationOnce(() => turn([{ type: "text", chunk: "final answer" }]))
    const text = await (await POST(req({ messages: [{ role: "user", content: "loop" }], lang: "en" }), ctx)).text()
    expect(text).toContain("final answer")
    expect(text).not.toContain("tool iteration limit")
    expect(streamWithTools.mock.calls[2][1].tools.length).toBeGreaterThan(0)
    // Answer pass: no tools, only a short system prompt + the question with the material.
    expect(streamWithTools.mock.calls[3][1].tools).toEqual([])
    const pass = streamWithTools.mock.calls[3][0] as Array<{ role: string; content: string }>
    expect(pass.map((m) => m.role)).toEqual(["system", "user"])
    expect(pass[0].content).toContain("No more tools are available")
    expect(pass[1].content).toContain("loop")
  })

  it("still reports the limit when the answer pass produces no text", async () => {
    const toolTurn = () => turn([{ type: "tool_calls", calls: [{ id: "c", function: { name: "get_backlog_summary", arguments: {} } }] }])
    streamWithTools.mockImplementationOnce(toolTurn).mockImplementationOnce(toolTurn).mockImplementationOnce(toolTurn).mockImplementationOnce(toolTurn)
    const text = await (await POST(req({ messages: [{ role: "user", content: "loop" }], lang: "en" }), ctx)).text()
    expect(text).toContain("tool iteration limit")
  })

  it("writes an inline error when the stream fails mid-answer", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "partial" }], new Error("boom")))
    const text = await (await POST(req({ messages: [{ role: "user", content: "x" }] }), ctx)).text()
    expect(text).toContain("partial")
    expect(text).toContain("[error]")
  })

  it("logs chart and table generation and long output slices", async () => {
    const long = "a".repeat(260)
    streamWithTools.mockReturnValueOnce(
      turn([
        { type: "text", chunk: "```chart\n{}\n```" },
        { type: "text", chunk: "\n| a | b |\n|---|---|\n" },
        { type: "text", chunk: long },
      ])
    )
    await (await POST(req({ messages: [{ role: "user", content: "chart" }], lang: "en" }), ctx)).text()
    const events = aiLog.mock.calls.map((c) => c[0])
    expect(events).toContain("VIZ_CHART")
    expect(events).toContain("VIZ_TABLE")
    expect(events).toContain("LLM_OUTPUT")
  })

  it("aborts generation when the client cancels the stream", async () => {
    let seenSignal: AbortSignal | undefined
    streamWithTools.mockImplementationOnce((_m: unknown, opts: { signal: AbortSignal }) => {
      seenSignal = opts.signal
      return (async function* () {
        yield { type: "text", chunk: "one" }
        await new Promise((_, reject) =>
          opts.signal.addEventListener("abort", () => reject(opts.signal.reason), { once: true })
        )
      })()
    })
    const res = await POST(req({ messages: [{ role: "user", content: "x" }] }), ctx)
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    await vi.waitFor(() => expect(seenSignal?.aborted).toBe(true))
  })
})
