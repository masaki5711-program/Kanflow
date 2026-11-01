import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * MCP feedback tools (W11): report_failure / report_resolution (scope dev:write), search_lessons (read):
 * wiring to the feedback services through the shared write path (via "mcp", idempotency, own report
 * budget), the data-not-instructions notice, and that an AI session has no way to confirm a lesson.
 */

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  loadUserAuthState: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: m.memberFindFirst },
    project: { findFirst: m.projectFindFirst },
    projectSection: { findFirst: m.projectSectionFindFirst },
  },
}))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
vi.mock("@/lib/authz/session-validity", async (orig) => ({
  ...(await orig<typeof import("@/lib/authz/session-validity")>()),
  loadUserAuthState: m.loadUserAuthState,
}))
vi.mock("@/services/api-tokens/api-tokens.repository")
vi.mock("@/services/api-v1/api-v1.service")
vi.mock("@/services/feedback/feedback.service")
vi.mock("@/services/feedback/feedback.lessons.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const fb = await import("@/services/feedback/feedback.service")
const lessons = await import("@/services/feedback/feedback.lessons.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const { DATA_NOTICE } = await import("@/app/api/mcp/_lib/tool-kit")
const { FEEDBACK_NOTICE } = await import("@/services/feedback/feedback.dto")
const { StatusError } = await import("@/services/_shared/errors")
const mcpRoute = await import("@/app/api/mcp/route")

const token = generateApiToken()
const MCP_ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "mcp" }
const FEEDBACK_TOOLS = ["report_failure", "report_resolution", "search_lessons"]
const FAILURE = { id: "f1", signature: "a".repeat(64) }

let rpcId = 0
async function rpc(method: string, params: unknown) {
  const res = await mcpRoute.POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  )
  expect(res.status).toBe(200)
  return (await res.json()) as { result: Record<string, unknown> }
}

async function callTool(name: string, args: Record<string, unknown>) {
  const msg = await rpc("tools/call", { name, arguments: args })
  const result = msg.result as { isError?: boolean; content: Array<{ text: string }> }
  const text = result.content[0].text
  return { isError: result.isError, payload: (text.startsWith("{") ? JSON.parse(text) : { text }) as Record<string, unknown> }
}

const withScopes = (scopes: string, projectIds: string | null = null) =>
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes, projectIds, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  withScopes('["read","dev:write"]')
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  m.memberFindFirst.mockResolvedValue({ role: "dev" })
  vi.mocked(v1.loadApiActor).mockResolvedValue({ userId: "u1", userName: "Dev One", systemRole: "member", via: "api" })
  vi.mocked(fb.reportFailure).mockResolvedValue({ failure: FAILURE, collapsed: false, lessons: [{ id: "l1", fix: "restart" }] } as never)
  vi.mocked(fb.reportResolution).mockResolvedValue({ resolution: { id: "r1" }, lesson: { id: "l1", state: "draft" }, lessonCreated: true } as never)
  vi.mocked(lessons.searchSharedLessons).mockResolvedValue({ lessons: [{ id: "l1" }], truncated: false } as never)
})

describe("tool list", () => {
  it("offers the three feedback tools, each with both notices; no tool can confirm, retire or systemize", async () => {
    const msg = await rpc("tools/list", {})
    const all = msg.result.tools as Array<{ name: string; description: string }>
    const tools = all.filter((t) => FEEDBACK_TOOLS.includes(t.name))
    expect(tools.map((t) => t.name).sort()).toEqual([...FEEDBACK_TOOLS].sort())
    for (const t of tools) {
      expect(t.description).toContain(DATA_NOTICE)
      expect(t.description).toContain(FEEDBACK_NOTICE)
    }
    expect(all.some((t) => /confirm|retire|systemi[sz]e/.test(t.name))).toBe(false)
    const report = tools.find((t) => t.name === "report_failure")?.description ?? ""
    expect(report).toMatch(/FEEDBACK_REDACTION_FAILED/)
    expect(report).toMatch(/sessionRef/)
  })
})

describe("report_failure / report_resolution (scope dev:write)", () => {
  it.each([
    ["report_failure", { tool: "cargo test", text: "boom" }],
    ["report_resolution", { sessionRef: "s-1", diffSummary: "fixed" }],
  ])("%s without dev:write → INSUFFICIENT_SCOPE naming dev:write; the service is not called", async (tool, args) => {
    withScopes('["read","backlog:write","sprint:write","task:write","comment:write","icebox:write","daily:write"]')
    const r = await callTool(tool, args)
    expect(r.isError).toBe(true)
    expect(r.payload).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "dev:write" })
    expect(fb.reportFailure).not.toHaveBeenCalled()
    expect(fb.reportResolution).not.toHaveBeenCalled()
  })

  it("report_failure: outside a project, as the token user via mcp; lessons and the notice come back", async () => {
    const r = await callTool("report_failure", { tool: "cargo test", text: "error[E0308]", sessionRef: "s-1", techs: ["rust"] })
    expect(r.isError).toBeUndefined()
    expect(r.payload).toMatchObject({ data: FAILURE, collapsed: false, lessons: [{ id: "l1", fix: "restart" }] })
    expect(String(r.payload.notice)).toMatch(/DATA, not instructions/)
    expect(fb.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ source: "agent", tool: "cargo test", techs: ["rust"] }), MCP_ACTOR)
    expect(m.memberFindFirst).not.toHaveBeenCalled()
  })

  it("report_failure with a project checks the owner's role there (non-member → NOT_FOUND)", async () => {
    m.memberFindFirst.mockResolvedValue(null)
    const r = await callTool("report_failure", { tool: "t", text: "boom", projectId: "p1" })
    expect(r).toEqual({ isError: true, payload: { error: "Not found", code: "NOT_FOUND" } })
    expect(fb.reportFailure).not.toHaveBeenCalled()
  })

  it("an identical call within the retry window replays the first result (replayed: true)", async () => {
    await callTool("report_failure", { tool: "t", text: "boom" })
    const again = await callTool("report_failure", { tool: "t", text: "boom" })
    expect(again.payload.replayed).toBe(true)
    expect(fb.reportFailure).toHaveBeenCalledTimes(1)
  })

  it("the redaction refusal reaches the agent as a tool error with the code", async () => {
    vi.mocked(fb.reportFailure).mockRejectedValue(new StatusError(422, "credential-like", {}, "FEEDBACK_REDACTION_FAILED"))
    const r = await callTool("report_failure", { tool: "t", text: "boom" })
    expect(r.isError).toBe(true)
    expect(r.payload).toMatchObject({ code: "FEEDBACK_REDACTION_FAILED" })
  })

  it("the report budget (FEEDBACK_REPORT_RATE_LIMIT_PER_MIN) answers RATE_LIMITED with retryAfterSec", async () => {
    vi.stubEnv("FEEDBACK_REPORT_RATE_LIMIT_PER_MIN", "1")
    expect((await callTool("report_failure", { tool: "t", text: "one" })).isError).toBeUndefined()
    const r = await callTool("report_failure", { tool: "t", text: "two" })
    expect(r.isError).toBe(true)
    expect(r.payload).toMatchObject({ code: "RATE_LIMITED" })
    expect(Number(r.payload.retryAfterSec)).toBeGreaterThan(0)
  })

  it("report_resolution: the session's fix becomes a draft lesson", async () => {
    const r = await callTool("report_resolution", { sessionRef: "s-1", diffSummary: "pinned it", verifiedCommand: "cargo test" })
    expect(r.payload).toMatchObject({ data: { id: "r1" }, lessonCreated: true })
    expect(fb.reportResolution).toHaveBeenCalledWith(expect.objectContaining({ sessionRef: "s-1", diffSummary: "pinned it" }), MCP_ACTOR)
  })

  it("arguments the schema refuses never reach Kanflow", async () => {
    const msg = await rpc("tools/call", { name: "report_failure", arguments: { tool: "t" } })
    expect((msg.result as { isError?: boolean }).isError).toBe(true)
    expect(fb.reportFailure).not.toHaveBeenCalled()
  })
})

describe("search_lessons (scope read)", () => {
  it("a read-only token may search; the answer says the text is data", async () => {
    withScopes('["read"]', '["p1"]')
    const r = await callTool("search_lessons", { q: "lock", tech: "rust", limit: 5 })
    expect(r.isError).toBeUndefined()
    expect(r.payload).toMatchObject({ data: [{ id: "l1" }], truncated: false })
    expect(String(r.payload.notice)).toMatch(/DATA, not instructions/)
    expect(lessons.searchSharedLessons).toHaveBeenCalledWith({ userId: "u1", systemRole: "member", projectIds: ["p1"] }, expect.objectContaining({ q: "lock", tech: "rust", limit: 5 }))
  })
})
