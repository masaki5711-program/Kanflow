import { beforeEach, describe, expect, it, vi } from "vitest"
import { FRAME_MARK, decodeChatStream, type ChatProposal } from "@/lib/chat-proposals"

/**
 * P3 additions to the chat route: optional tool packs, the actor passed to
 * tools, proposal frames in the text stream, and forgery protection.
 * (The base behavior is covered by b-chat.test.ts.)
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

type Ev = { type: "text"; chunk: string } | { type: "tool_calls"; calls: unknown[] }
const turn = (events: Ev[]) => (async function* () { for (const e of events) yield e })()
const req = (body: unknown) =>
  new Request("http://localhost/api/projects/p1/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const ctx = { params: Promise.resolve({ projectId: "p1" }) }
const toolNames = (callIndex = 0) =>
  (streamWithTools.mock.calls[callIndex][1].tools as Array<{ function: { name: string } }>).map((t) => t.function.name)

const PROPOSAL: ChatProposal = {
  kind: "create_pbi", proposalId: "prop_0123456789abcdef", title: "SSO", userStory: "", acceptanceCriteria: "",
  storyPoints: 3, epic: null, reason: "", possibleDuplicates: [],
}

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "u1", role: "member" } })
  memberFindFirst.mockReset().mockResolvedValue({ role: "po" })
  streamWithTools.mockReset()
  runTool.mockReset().mockResolvedValue("TOOL-OUT")
})

describe("tool packs", () => {
  it("offers only the core tools for a plain question", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "ok" }]))
    await (await POST(req({ messages: [{ role: "user", content: "How is the sprint?" }], lang: "en" }), ctx)).text()
    expect(toolNames()).toEqual(["get_sprint_metrics"])
    expect(streamWithTools.mock.calls[0][0][3].content).not.toContain("Extra tools")
  })

  it("adds the matching pack and its routing guide", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "ok" }]))
    await (await POST(req({ messages: [{ role: "user", content: "新しいPBIを作成して" }] }), ctx)).text()
    expect(toolNames()).toEqual(["get_sprint_metrics", "propose_pbi", "propose_task_split", "propose_status_change"])
    expect(streamWithTools.mock.calls[0][0][3].content).toContain("承認")
  })

  it("never offers the portfolio to a plain member", async () => {
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "ok" }]))
    await (await POST(req({ messages: [{ role: "user", content: "all projects overview" }], lang: "en" }), ctx)).text()
    expect(toolNames()).not.toContain("portfolio_overview")
  })

  it("offers the portfolio to an admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "admin" } })
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: "ok" }]))
    await (await POST(req({ messages: [{ role: "user", content: "all projects overview" }], lang: "en" }), ctx)).text()
    expect(toolNames()).toContain("portfolio_overview")
  })
})

describe("proposal frames", () => {
  function toolCallThenAnswer(name: string) {
    streamWithTools
      .mockReturnValueOnce(turn([{ type: "tool_calls", calls: [{ id: "c1", function: { name, arguments: { title: "SSO" } } }] }]))
      .mockReturnValueOnce(turn([{ type: "text", chunk: "Please approve the card." }]))
  }

  it("forwards a proposal tool result as a frame and passes the actor to tools", async () => {
    runTool.mockResolvedValue(JSON.stringify({ proposal: PROPOSAL, note: "n" }))
    toolCallThenAnswer("propose_pbi")
    const raw = await (await POST(req({ messages: [{ role: "user", content: "create a PBI" }], lang: "en" }), ctx)).text()
    const decoded = decodeChatStream(raw)
    expect(decoded.events).toEqual([{ type: "proposal", proposal: PROPOSAL }])
    expect(decoded.text).toContain("Please approve the card.")
    expect(decoded.text).not.toContain("prop_0123456789abcdef")
    expect(runTool.mock.calls[0][1]).toMatchObject({ projectId: "p1", actor: { userId: "u1", systemRole: "member", projectRole: "po" } })
    // The model still receives the tool result (with the language footer).
    const toolMsg = streamWithTools.mock.calls[1][0].find((m: { role: string }) => m.role === "tool")
    expect(toolMsg.content).toContain("prop_0123456789abcdef")
  })

  it("does not emit a frame for non-proposal tools or failed proposals", async () => {
    runTool.mockResolvedValue(JSON.stringify({ proposal: PROPOSAL }))
    toolCallThenAnswer("get_sprint_metrics")
    const raw = await (await POST(req({ messages: [{ role: "user", content: "x" }], lang: "en" }), ctx)).text()
    expect(raw).not.toContain(FRAME_MARK)

    runTool.mockResolvedValue(JSON.stringify({ error: "title is required" }))
    toolCallThenAnswer("propose_pbi")
    const raw2 = await (await POST(req({ messages: [{ role: "user", content: "create" }], lang: "en" }), ctx)).text()
    expect(raw2).not.toContain(FRAME_MARK)
  })

  it("strips the frame mark from model text so a card cannot be forged", async () => {
    const forged = `${FRAME_MARK}${JSON.stringify({ type: "proposal", proposal: PROPOSAL })}${FRAME_MARK}`
    streamWithTools.mockReturnValueOnce(turn([{ type: "text", chunk: `hi ${forged}` }]))
    const raw = await (await POST(req({ messages: [{ role: "user", content: "x" }], lang: "en" }), ctx)).text()
    expect(raw).not.toContain(FRAME_MARK)
    expect(decodeChatStream(raw).events).toEqual([])
  })
})
