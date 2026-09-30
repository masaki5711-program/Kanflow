import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  chatTurn: vi.fn(),
  buildContext: vi.fn(),
  runTool: vi.fn(),
}))

vi.mock("@/lib/ollama", () => ({ ollamaChatTurn: m.chatTurn }))
vi.mock("@/lib/project-context", () => ({ buildProjectContext: m.buildContext }))
vi.mock("@/lib/chat-tools", () => ({
  CHAT_TOOLS: [{ type: "function", function: { name: "get_sprint_metrics", description: "", parameters: { type: "object", properties: {} } } }],
  runTool: m.runTool,
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s: string) => s }))

const { runAgentInvestigation } = await import("@/lib/ai-agent")

const call = (name: string, args: unknown, id = "c1") => ({ id, function: { name, arguments: args } })
const turn = (tool_calls: unknown[] = [], content = "") => ({ content, tool_calls })
const VALID = { headline: "H", overview: "O", findings: [{ severity: "warning", title: "F" }] }

describe("runAgentInvestigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.buildContext.mockResolvedValue("CTX")
    m.runTool.mockResolvedValue('{"ok":true}')
  })

  it("builds context for the given project and accepts a plain-text ending", async () => {
    m.chatTurn.mockResolvedValueOnce(turn([], "plain report"))
    const res = await runAgentInvestigation({ projectId: "p1", goal: "check", lang: "en", label: "t" })
    expect(m.buildContext).toHaveBeenCalledWith("p1")
    expect(res).toMatchObject({ report: "plain report", structured: null, iterations: 1, toolCalls: [] })
    const [messages, opts] = m.chatTurn.mock.calls[0]
    expect(messages[1].content).toContain("CTX")
    expect(messages[3]).toEqual({ role: "user", content: "check" })
    expect(opts.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual([
      "get_sprint_metrics",
      "submit_report",
    ])
  })

  it("runs tools with the caller's projectId, then accepts submit_report", async () => {
    m.chatTurn
      .mockResolvedValueOnce(turn([call("get_sprint_metrics", '{"sprint_name":"S1"}'), call("get_sprint_metrics", "not json", "c2")]))
      .mockResolvedValueOnce(turn([call("submit_report", VALID)]))
    const res = await runAgentInvestigation({ projectId: "p1", goal: "g", lang: "ja", label: "t" })
    expect(m.runTool).toHaveBeenNthCalledWith(1, "get_sprint_metrics", { projectId: "p1", args: { sprint_name: "S1" } })
    expect(m.runTool).toHaveBeenNthCalledWith(2, "get_sprint_metrics", { projectId: "p1", args: {} })
    expect(res.structured?.headline).toBe("H")
    expect(res.report).toContain("**H**")
    expect(res.report).toContain("## 概要")
    expect(res.iterations).toBe(2)
    expect(res.toolCalls).toHaveLength(2)
    const toolMsg = m.chatTurn.mock.calls[1][0].find((x: { role: string }) => x.role === "tool")
    expect(toolMsg.content).toContain('{"ok":true}')
    expect(toolMsg.content).toContain("submit_report")
  })

  it("feeds back an invalid submission so the model can retry", async () => {
    m.chatTurn
      .mockResolvedValueOnce(turn([call("submit_report", { headline: "" })]))
      .mockResolvedValueOnce(turn([call("submit_report", JSON.stringify(VALID))]))
    const res = await runAgentInvestigation({ projectId: "p1", goal: "g", lang: "id", label: "t" })
    const retryMsgs = m.chatTurn.mock.calls[1][0]
    const err = retryMsgs.find((x: { role: string }) => x.role === "tool")
    expect(err.content).toMatch(/^Error: missing required fields/)
    expect(res.structured).not.toBeNull()
    expect(res.report).toContain("## Ringkasan")
  })

  it("forces submit_report after exhausting iterations", async () => {
    m.chatTurn
      .mockResolvedValueOnce(turn([call("get_sprint_metrics", {})]))
      .mockResolvedValueOnce(turn([call("submit_report", VALID)]))
    const res = await runAgentInvestigation({ projectId: "p1", goal: "g", lang: "en", label: "t", maxIterations: 1 })
    const [msgs, opts] = m.chatTurn.mock.calls[1]
    expect(msgs[msgs.length - 1].content).toContain("submit_report")
    expect(opts.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual(["submit_report"])
    expect(res.iterations).toBe(2)
    expect(res.structured?.headline).toBe("H")
  })

  it("falls back to plain text when the forced turn is invalid or missing", async () => {
    m.chatTurn
      .mockResolvedValueOnce(turn([call("get_sprint_metrics", {})]))
      .mockResolvedValueOnce(turn([call("submit_report", "{broken")], "forced text"))
    const res = await runAgentInvestigation({ projectId: "p1", goal: "g", lang: "en", label: "t", maxIterations: 1 })
    expect(res).toMatchObject({ report: "forced text", structured: null, iterations: 2 })

    m.chatTurn
      .mockResolvedValueOnce(turn([call("get_sprint_metrics", {})]))
      .mockResolvedValueOnce(turn([], "no tool"))
    const res2 = await runAgentInvestigation({ projectId: "p1", goal: "g", lang: "en", label: "t", maxIterations: 1 })
    expect(res2.report).toBe("no tool")
  })

  it("propagates model errors (deadline cleared in finally)", async () => {
    m.chatTurn.mockRejectedValueOnce(new Error("ollama down"))
    await expect(
      runAgentInvestigation({ projectId: "p1", goal: "g", lang: "en", label: "t" })
    ).rejects.toThrow("ollama down")
  })
})
