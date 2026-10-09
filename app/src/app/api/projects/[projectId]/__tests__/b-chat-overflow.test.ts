import { beforeEach, describe, expect, it, vi } from "vitest"
import { decodeChatStream } from "@/lib/chat-proposals"
import { OllamaHttpError } from "@/lib/ollama/errors"

/**
 * The chat must never end in "HTTP 500" because the shared 12k Ollama context
 * overflowed: one big tool result is capped, the guard also works without an
 * Ollama measurement, and a 500 that slips through becomes an answer from the
 * gathered material.
 */

const authMock = vi.fn()
const memberFindFirst = vi.fn()
const streamWithTools = vi.fn()
const runTool = vi.fn()

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
vi.mock("@/lib/project-context", () => ({ buildProjectContext: vi.fn().mockResolvedValue("CTX"), CHAT_SYSTEM_PROMPT: "SYS" }))
vi.mock("@/lib/chat-tools", () => ({
  CHAT_TOOLS: [{ type: "function", function: { name: "get_sprint_metrics" } }],
  runTool: (...a: unknown[]) => runTool(...a),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s?: string) => s ?? "" }))

const { POST } = await import("../chat/route")

type Ev = { type: "text"; chunk: string } | { type: "tool_calls"; calls: unknown[] } | { type: "usage"; promptTokens: number }
const turn = (events: Ev[]) => (async function* () { for (const e of events) yield e })()
const failing = (error: Error) => (async function* (): AsyncGenerator<Ev> { throw error })()
const call = (id: string) => ({ id, function: { name: "get_sprint_metrics", arguments: {} } })
const req = (content: string) =>
  new Request("http://localhost/api/projects/p1/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content }], lang: "en" }),
  })
const ctx = { params: Promise.resolve({ projectId: "p1" }) }
const ask = async (content = "Tell me about #29") => decodeChatStream(await (await POST(req(content), ctx)).text()).text

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "u1", role: "member" } })
  memberFindFirst.mockReset().mockResolvedValue({ role: "po" })
  streamWithTools.mockReset()
  runTool.mockReset().mockResolvedValue("x".repeat(20_000))
})

describe("chat context overflow", () => {
  it("hands the model at most a capped slice of a huge tool result", async () => {
    streamWithTools
      .mockReturnValueOnce(turn([{ type: "tool_calls", calls: [call("c1")] }]))
      .mockReturnValueOnce(turn([{ type: "text", chunk: "done" }]))
    expect(await ask()).toBe("done")
    const second = streamWithTools.mock.calls[1][0] as Array<{ role: string; content: string }>
    const tool = second.find((m) => m.role === "tool")
    expect(tool?.content.length).toBeLessThan(6600)
    expect(tool?.content).toContain("truncated")
  })

  it("stops the tool turns when the conversation is too big even without an Ollama measurement", async () => {
    streamWithTools
      .mockReturnValueOnce(turn([{ type: "tool_calls", calls: [call("c1"), call("c2")] }])) // no usage event
      .mockReturnValueOnce(turn([{ type: "text", chunk: "from the material" }]))
    expect(await ask()).toBe("from the material")
    expect(streamWithTools).toHaveBeenCalledTimes(2)
    expect(streamWithTools.mock.calls[1][1].tools).toEqual([]) // the tool-free answer pass
  })

  it("turns an Ollama 'no user query' 500 into an answer from the gathered material", async () => {
    streamWithTools
      .mockReturnValueOnce(turn([{ type: "usage", promptTokens: 100 }, { type: "tool_calls", calls: [call("c1")] }]))
      .mockReturnValueOnce(failing(new OllamaHttpError(500, '{"error":"no user query found in messages"}')))
      .mockReturnValueOnce(turn([{ type: "text", chunk: "recovered" }]))
    const out = await ask()
    expect(out).toBe("recovered")
    expect(out).not.toContain("[error]")
    expect(streamWithTools.mock.calls[2][1].tools).toEqual([])
  })

  it("still reports other Ollama failures", async () => {
    streamWithTools
      .mockReturnValueOnce(turn([{ type: "usage", promptTokens: 100 }, { type: "tool_calls", calls: [call("c1")] }]))
      .mockReturnValueOnce(failing(new OllamaHttpError(500, "boom")))
    expect(await ask()).toContain("[error]")
  })
})
