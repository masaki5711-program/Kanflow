import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const streamWithTools = vi.fn()
const hasRepoKnowledge = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: vi.fn().mockResolvedValue({ role: "dev" }) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/lib/ollama", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/ollama")>()
  return { ...orig, ollamaChatStreamWithTools: (...a: unknown[]) => streamWithTools(...a) }
})
vi.mock("@/lib/project-context", () => ({ buildProjectContext: vi.fn().mockResolvedValue("CTX"), CHAT_SYSTEM_PROMPT: "SYS" }))
vi.mock("@/lib/chat-tools", () => ({ CHAT_TOOLS: [{ type: "function", function: { name: "list_backlog_items" } }], runTool: vi.fn() }))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s?: string) => s ?? "" }))
vi.mock("@/lib/repo-knowledge-tools", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/repo-knowledge-tools")>()
  return { ...orig, hasRepoKnowledge: (...a: unknown[]) => hasRepoKnowledge(...a) }
})

const { POST } = await import("../chat/route")
const { REPO_KNOWLEDGE_GUIDE } = await import("@/lib/repo-knowledge-tools")

const ctx = { params: Promise.resolve({ projectId: "p1" }) }
const req = (content: string) =>
  new Request("http://localhost/api/projects/p1/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content }] }) })

async function ask(content = "OEE と OLE の違いは？") {
  streamWithTools.mockReturnValueOnce(
    (async function* () {
      yield { type: "text", chunk: "ok" }
    })(),
  )
  await (await POST(req(content), ctx)).text()
  const [messages, opts] = streamWithTools.mock.calls[0]
  return { names: (opts.tools as Array<{ function: { name: string } }>).map((t) => t.function.name), guide: messages[3].content as string }
}

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "u1", role: "member" } })
  streamWithTools.mockReset()
  hasRepoKnowledge.mockReset()
})

describe("chat route — repository knowledge tools", () => {
  it("offers the two tools and the short guide when the project has a knowledge repository", async () => {
    hasRepoKnowledge.mockResolvedValue(true)
    const { names, guide } = await ask()
    expect(hasRepoKnowledge).toHaveBeenCalledWith("p1")
    expect(names).toEqual(expect.arrayContaining(["search_repository_docs", "read_repository_file"]))
    expect(guide).toContain(REPO_KNOWLEDGE_GUIDE.ja)
  })

  it("offers neither without one", async () => {
    hasRepoKnowledge.mockResolvedValue(false)
    const { names, guide } = await ask()
    expect(names).not.toContain("search_repository_docs")
    expect(guide).not.toContain("search_repository_docs")
  })

  it("still answers when the knowledge lookup fails", async () => {
    hasRepoKnowledge.mockRejectedValue(new Error("db down"))
    const { names } = await ask()
    expect(names).toEqual(["list_backlog_items"])
  })
})
