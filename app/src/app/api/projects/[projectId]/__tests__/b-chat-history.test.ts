import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * P3 chat history wiring in the chat route: thread ownership check before the
 * model runs, the question stored once the model answers, the answer stored
 * when the stream ends (partial when stopped / failed), and the thread id
 * header. The persistence itself is covered by chat-threads.service.test.ts.
 */

const authMock = vi.fn()
const memberFindFirst = vi.fn()
const streamWithTools = vi.fn()
const runTool = vi.fn()
const resolveChatThread = vi.fn()
const beginChatRecording = vi.fn()

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
vi.mock("@/lib/logger", () => {
  const noop = { debug() {}, info() {}, warn() {}, error() {}, child: () => noop }
  return { logger: noop }
})
vi.mock("@/services/chat-threads/chat-threads.service", () => ({
  resolveChatThread: (...a: unknown[]) => resolveChatThread(...a),
  beginChatRecording: (...a: unknown[]) => beginChatRecording(...a),
}))

const { POST } = await import("../chat/route")
const { NotFoundError } = await import("@/services/_shared/errors")
const { OllamaUnavailableError } = await import("@/lib/ollama/errors")

type Ev = { type: "text"; chunk: string } | { type: "tool_calls"; calls: unknown[] }
function turn(events: Ev[], error?: unknown) {
  return (async function* () {
    for (const e of events) yield e
    if (error) throw error
  })()
}
const req = (body: unknown) =>
  new Request("http://localhost/api/projects/p1/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const ctx = { params: Promise.resolve({ projectId: "p1" }) }
const OWNER = { projectId: "p1", userId: "u1" }

function fakeRecorder(threadId = "t-new") {
  return { threadId, append: vi.fn(), tool: vi.fn(), finish: vi.fn(async () => true) }
}
let recorder: ReturnType<typeof fakeRecorder>

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "u1", role: "member" } })
  memberFindFirst.mockReset().mockResolvedValue({ role: "dev" })
  streamWithTools.mockReset()
  runTool.mockReset().mockResolvedValue("TOOL-OUT")
  recorder = fakeRecorder()
  resolveChatThread.mockReset().mockImplementation(async (_o: unknown, id?: string) => id ?? null)
  beginChatRecording.mockReset().mockResolvedValue(recorder)
})

describe("chat route — history persistence", () => {
  it("a new chat stores question + complete answer and returns the thread id", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "Hello " }, { type: "text", chunk: "there" }]))
    const res = await POST(req({ messages: [{ role: "user", content: "Hi" }] }), ctx)
    expect(res.headers.get("X-Chat-Thread-Id")).toBe("t-new")
    expect(await res.text()).toBe("Hello there")
    expect(resolveChatThread).toHaveBeenCalledWith(OWNER, undefined)
    expect(beginChatRecording).toHaveBeenCalledWith(OWNER, null, { role: "user", content: "Hi" })
    expect(recorder.append.mock.calls.map((c) => c[0]).join("")).toBe("Hello there")
    await vi.waitFor(() => expect(recorder.finish).toHaveBeenCalledWith({ partial: false }))
  })

  it("continues an owned thread", async () => {
    recorder = fakeRecorder("t1")
    beginChatRecording.mockResolvedValue(recorder)
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "ok" }]))
    const res = await POST(req({ messages: [{ role: "user", content: "again" }], threadId: "t1" }), ctx)
    await res.text()
    expect(resolveChatThread).toHaveBeenCalledWith(OWNER, "t1")
    expect(beginChatRecording).toHaveBeenCalledWith(OWNER, "t1", { role: "user", content: "again" })
    expect(res.headers.get("X-Chat-Thread-Id")).toBe("t1")
  })

  it("404 for another user's thread, before the model or any storage", async () => {
    resolveChatThread.mockRejectedValue(new NotFoundError("Chat thread not found"))
    const res = await POST(req({ messages: [{ role: "user", content: "x" }], threadId: "theirs" }), ctx)
    expect(res.status).toBe(404)
    expect(streamWithTools).not.toHaveBeenCalled()
    expect(beginChatRecording).not.toHaveBeenCalled()
  })

  it("400 for a malformed thread id", async () => {
    expect((await POST(req({ messages: [{ role: "user", content: "x" }], threadId: "" }), ctx)).status).toBe(400)
  })

  it("stores nothing when the model fails before answering", async () => {
    streamWithTools.mockReturnValueOnce(turn([], new OllamaUnavailableError()))
    const res = await POST(req({ messages: [{ role: "user", content: "x" }] }), ctx)
    expect(res.status).toBe(503)
    expect(beginChatRecording).not.toHaveBeenCalled()
  })

  it("records tool calls and flags an answer that failed mid-stream as partial", async () => {
    streamWithTools
      .mockReturnValueOnce(turn([{ type: "tool_calls", calls: [{ id: "c1", function: { name: "get_sprint_metrics", arguments: {} } }] }]))
      .mockReturnValueOnce(turn([{ type: "text", chunk: "half" }], new Error("boom")))
    await (await POST(req({ messages: [{ role: "user", content: "x" }] }), ctx)).text()
    expect(recorder.tool).toHaveBeenCalledWith("get_sprint_metrics", expect.any(Number))
    expect(recorder.append.mock.calls.map((c) => c[0]).join("")).toContain("half")
    await vi.waitFor(() => expect(recorder.finish).toHaveBeenCalledWith({ partial: true }))
  })

  it("a stopped answer (client cancel) is stored as partial", async () => {
    streamWithTools.mockImplementationOnce((_m: unknown, opts: { signal: AbortSignal }) =>
      (async function* () {
        yield { type: "text", chunk: "one" }
        await new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(opts.signal.reason), { once: true }))
      })()
    )
    const res = await POST(req({ messages: [{ role: "user", content: "x" }] }), ctx)
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    await vi.waitFor(() => expect(recorder.finish).toHaveBeenCalledWith({ partial: true }))
  })

  it("streams normally without a thread header when storing is unavailable", async () => {
    beginChatRecording.mockResolvedValue(null)
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "fine" }]))
    const res = await POST(req({ messages: [{ role: "user", content: "x" }] }), ctx)
    expect(res.headers.get("X-Chat-Thread-Id")).toBeNull()
    expect(await res.text()).toBe("fine")
  })
})
