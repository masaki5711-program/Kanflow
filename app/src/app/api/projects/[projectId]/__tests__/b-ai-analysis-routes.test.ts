import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const memberFindFirst = vi.fn()
const iceboxFindFirst = vi.fn()
const goalFindMany = vi.fn()
const projectFindUnique = vi.fn()
const pbiFindFirst = vi.fn()
const sprintFindFirst = vi.fn()
const analysisStreamResponse = vi.fn()
const listBacklog = vi.fn()
const estimation = vi.fn()
const extractAttachment = vi.fn()
const buildProjectContext = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    iceboxItem: { findFirst: (...a: unknown[]) => iceboxFindFirst(...a) },
    productGoal: { findMany: (...a: unknown[]) => goalFindMany(...a) },
    project: {
      findUnique: (...a: unknown[]) => projectFindUnique(...a),
      findFirst: vi.fn().mockResolvedValue({ id: "live" }),
    },
    productBacklogItem: { findFirst: (...a: unknown[]) => pbiFindFirst(...a) },
    sprint: { findFirst: (...a: unknown[]) => sprintFindFirst(...a) },
  },
}))
vi.mock("@/lib/ai-analysis", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/ai-analysis")>()
  return { ...orig, analysisStreamResponse: (...a: unknown[]) => analysisStreamResponse(...a) }
})
vi.mock("@/lib/analysis-tools", () => ({
  analysisHandlers: {
    list_backlog_items: (...a: unknown[]) => listBacklog(...a),
    get_estimation_reference: (...a: unknown[]) => estimation(...a),
  },
}))
vi.mock("@/lib/attachment-extractor", () => ({
  extractAttachment: (...a: unknown[]) => extractAttachment(...a),
}))
vi.mock("@/lib/project-context", () => ({
  buildProjectContext: (...a: unknown[]) => buildProjectContext(...a),
  CHAT_SYSTEM_PROMPT: "SYS",
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s?: string) => s ?? "" }))

const draftRoute = await import("../icebox/[itemId]/ai/generate-pbi-draft/route")
const fieldRoute = await import("../ai/generate-pbi-field/route")
const reportRoute = await import("../ai/progress-report/route")
const investRoute = await import("../backlog/[itemId]/ai/invest-review/route")
const retroRoute = await import("../sprints/[sprintId]/ai/retro-synthesis/route")

type Params = Record<string, string>
function post(body?: unknown, raw?: string) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
}
// Route param shapes differ per handler; tests pass whatever each needs.
const ctx = (p: Params) => ({ params: Promise.resolve({ projectId: "p1", ...p }) }) as never

/** Messages + options handed to the (mocked) Ollama stream. */
function lastCall() {
  const [messages, opts] = analysisStreamResponse.mock.calls.at(-1) as [
    Array<{ role: string; content: string }>,
    Record<string, unknown>,
  ]
  return { system: messages[0].content, user: messages[1].content, opts }
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: "u1", role: "member" } })
  memberFindFirst.mockResolvedValue({ role: "po" })
  analysisStreamResponse.mockImplementation(() => new Response("STREAM"))
  goalFindMany.mockResolvedValue([])
  projectFindUnique.mockResolvedValue(null)
  listBacklog.mockResolvedValue('{"items":[]}')
  estimation.mockResolvedValue('{"ref":1}')
  buildProjectContext.mockResolvedValue("PROJECT-CTX")
})

// ---------------------------------------------------------------- gating
const routes: Array<[string, (r: Request, c: ReturnType<typeof ctx>) => Promise<Response>, Params, string]> = [
  ["generate-pbi-draft", (r, c) => draftRoute.POST(r, c as never), { itemId: "i1" }, "ai.draftPbi"],
  ["generate-pbi-field", (r, c) => fieldRoute.POST(r, c as never), {}, "ai.draftPbi"],
  ["progress-report", (r, c) => reportRoute.POST(r, c as never), {}, "ai.use"],
  ["invest-review", (r, c) => investRoute.POST(r, c as never), { itemId: "b1" }, "ai.use"],
  ["retro-synthesis", (r, c) => retroRoute.POST(r, c as never), { sprintId: "s1" }, "ai.use"],
]

describe("AI analysis routes — auth gate", () => {
  for (const [name, handler, p, action] of routes) {
    it(`${name}: 401 without session`, async () => {
      authMock.mockResolvedValue(null)
      expect((await handler(post({}), ctx(p))).status).toBe(401)
      expect(analysisStreamResponse).not.toHaveBeenCalled()
    })
    it(`${name}: 404 for non-member`, async () => {
      memberFindFirst.mockResolvedValue(null)
      expect((await handler(post({}), ctx(p))).status).toBe(404)
      expect(analysisStreamResponse).not.toHaveBeenCalled()
    })
    if (action === "ai.draftPbi") {
      it(`${name}: 403 for dev (PO/SM only)`, async () => {
        memberFindFirst.mockResolvedValue({ role: "dev" })
        expect((await handler(post({ field: "userStory", initiative: "x" }), ctx(p))).status).toBe(403)
      })
    }
  }
})

// ---------------------------------------------------------------- generate-pbi-draft
describe("generate-pbi-draft", () => {
  const item = {
    displayId: 7,
    author: "Taro",
    request: "Need export",
    background: "Users ask",
    poHearingMemo: "memo1",
    poReviewMemo: "memo2",
    attachments: [
      { fileName: "a.pdf", originalName: "spec.pdf", mimeType: "application/pdf" },
      { fileName: "b.txt", originalName: "notes.txt", mimeType: "text/plain" },
      { fileName: "c.txt", originalName: "third.txt", mimeType: "text/plain" },
    ],
  }

  it("404 when icebox item not in this project", async () => {
    iceboxFindFirst.mockResolvedValue(null)
    const res = await draftRoute.POST(post({}), ctx({ itemId: "i1" }))
    expect(res.status).toBe(404)
    expect(iceboxFindFirst.mock.calls[0][0].where).toEqual({ id: "i1", projectId: "p1", deletedAt: null })
  })

  it("builds a grounded prompt with context, attachments (max 2) and streams JSON", async () => {
    iceboxFindFirst.mockResolvedValue(item)
    goalFindMany.mockResolvedValue([{ title: "G1", description: "desc" }, { title: "G2", description: null }])
    projectFindUnique.mockResolvedValue({ name: "Proj", description: "PD", projectType: "dev", pointUnit: "sp" })
    extractAttachment
      .mockResolvedValueOnce({ ok: true, text: "x".repeat(3000) })
      .mockResolvedValueOnce({ ok: false, error: "unsupported" })

    const res = await draftRoute.POST(post({ lang: "en" }), ctx({ itemId: "i1" }))
    expect(await res.text()).toBe("STREAM")

    expect(extractAttachment).toHaveBeenCalledTimes(2)
    expect(extractAttachment.mock.calls[0][0]).toMatchObject({ projectId: "p1", fileName: "a.pdf" })
    expect(listBacklog).toHaveBeenCalledWith({ projectId: "p1", args: {} })
    expect(estimation).toHaveBeenCalledWith({ projectId: "p1", args: {} })
    expect(goalFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1" })
    expect(projectFindUnique.mock.calls[0][0].where).toEqual({ id: "p1" })

    const { system, user, opts } = lastCall()
    expect(system).toContain("3 Product Backlog Item")
    expect(user).toContain("#7")
    expect(user).toContain("## 背景\nUsers ask")
    expect(user).toContain("memo1")
    expect(user).toContain("memo2")
    expect(user).toContain("…(抜粋)")
    expect(user).toContain("# プロジェクト: Proj")
    expect(user).toContain("説明: PD")
    expect(user).toContain("- G1: desc")
    expect(user).toContain("- G2\n")
    expect(user).toContain('{"items":[]}')
    expect(opts).toMatchObject({ format: "json", numPredict: 4096, label: "pbi-draft" })
  })

  it("minimal item, no body, id and ja languages", async () => {
    iceboxFindFirst.mockResolvedValue({
      ...item,
      background: null,
      poHearingMemo: null,
      poReviewMemo: null,
      attachments: [],
    })
    await draftRoute.POST(post(undefined), ctx({ itemId: "i1" }))
    expect(lastCall().system).toContain("PBI) 草案を 3 案")
    expect(lastCall().user).not.toContain("背景")
    extractAttachment.mockResolvedValue({ ok: true, text: "short" })

    await draftRoute.POST(post({ lang: "id" }), ctx({ itemId: "i1" }))
    expect(lastCall().system).toContain("Bahasa Indonesia")

    await draftRoute.POST(post({ lang: "fr" }), ctx({ itemId: "i1" }))
    expect(lastCall().system).toContain("草案を 3 案")
  })

  it("short attachment text is not truncated", async () => {
    iceboxFindFirst.mockResolvedValue({ ...item, attachments: item.attachments.slice(0, 1) })
    extractAttachment.mockResolvedValue({ ok: true, text: "SPEC BODY" })
    await draftRoute.POST(post({}), ctx({ itemId: "i1" }))
    expect(lastCall().user).toContain("### spec.pdf\nSPEC BODY")
    expect(lastCall().user).not.toContain("…(抜粋)")
  })
})

// ---------------------------------------------------------------- generate-pbi-field
describe("generate-pbi-field", () => {
  it("400 for invalid body / unknown field", async () => {
    expect((await fieldRoute.POST(post(undefined, "{bad"), ctx({}))).status).toBe(400)
    expect((await fieldRoute.POST(post({ field: "title" }), ctx({}))).status).toBe(400)
  })

  it("400 seed_required for an empty form", async () => {
    const res = await fieldRoute.POST(post({ field: "userStory", initiative: "  ", epic: "E" }), ctx({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "seed_required", code: "VALIDATION" })
  })

  it("userStory: includes other fields but not the one being generated", async () => {
    projectFindUnique.mockResolvedValue({ name: "Proj", description: "D", projectType: "t" })
    goalFindMany.mockResolvedValue([{ title: "G", description: "gd" }, { title: "H", description: null }])
    const res = await fieldRoute.POST(
      post({ field: "userStory", initiative: " Init ", epic: " Ep ", userStory: "old", acceptanceCriteria: "- ac", lang: "en" }),
      ctx({})
    )
    expect(await res.text()).toBe("STREAM")
    const { system, user, opts } = lastCall()
    expect(system).toContain("exactly one user story")
    expect(user).toContain("## 施策 / Initiative\nInit")
    expect(user).toContain("## エピック / Epic\nEp")
    expect(user).toContain("- ac")
    expect(user).not.toContain("old")
    expect(user).toContain("- G: gd")
    expect(opts).toMatchObject({ label: "generate-pbi-field:userStory", numPredict: 1024 })
  })

  it("acceptanceCriteria: includes user story, excludes current AC; no project", async () => {
    await fieldRoute.POST(post({ field: "acceptanceCriteria", userStory: "As a", acceptanceCriteria: "stale", lang: "id" }), ctx({}))
    const { system, user } = lastCall()
    expect(system).toContain("kriteria penerimaan")
    expect(user).toContain("As a")
    expect(user).not.toContain("stale")
    expect(user).not.toContain("Project:")
  })
})

// ---------------------------------------------------------------- progress-report
describe("progress-report", () => {
  it("uses project context scoped to the route projectId", async () => {
    const res = await reportRoute.POST(post({ lang: "id" }), ctx({}))
    expect(await res.text()).toBe("STREAM")
    expect(buildProjectContext).toHaveBeenCalledWith("p1")
    const { system, user, opts } = lastCall()
    expect(user).toBe("PROJECT-CTX")
    expect(system).toContain("Bahasa Indonesia")
    expect(opts).toMatchObject({ format: "json", label: "progress-report" })
  })

  it("defaults to ja for bad body, en when asked", async () => {
    await reportRoute.POST(post(undefined, "nope"), ctx({}))
    expect(lastCall().system).toContain("日本語")
    await reportRoute.POST(post({ lang: "en" }), ctx({}))
    expect(lastCall().system).toContain("MUST be written in English")
    await reportRoute.POST(post({ lang: 5 }), ctx({}))
    expect(lastCall().system).toContain("日本語")
  })
})

// ---------------------------------------------------------------- invest-review
describe("invest-review", () => {
  it("404 when PBI not in project", async () => {
    pbiFindFirst.mockResolvedValue(null)
    expect((await investRoute.POST(post({}), ctx({ itemId: "b1" }))).status).toBe(404)
    expect(pbiFindFirst.mock.calls[0][0].where).toEqual({ id: "b1", projectId: "p1", deletedAt: null })
  })

  it.each([
    ["ja", "(未入力)", "評価対象 PBI"],
    ["en", "(not entered)", "Target PBI"],
    ["id", "(belum diisi)", "PBI yang Dievaluasi"],
  ])("renders %s labels with NA placeholders", async (lang, na, title) => {
    pbiFindFirst.mockResolvedValue({
      displayId: 3,
      initiative: null,
      epic: null,
      userStory: "",
      acceptanceCriteria: null,
      workloadScore: 5,
    })
    await investRoute.POST(post({ lang }), ctx({ itemId: "b1" }))
    const { user, opts } = lastCall()
    expect(user).toContain(`# ${title} #3`)
    expect(user).toContain(na)
    expect(user).toContain("5 (SP)")
    expect(opts).toMatchObject({ label: "invest-review", temperature: 0.2 })
  })

  it("renders filled fields", async () => {
    pbiFindFirst.mockResolvedValue({
      displayId: 4,
      initiative: "I",
      epic: "E",
      userStory: "US",
      acceptanceCriteria: "AC",
      workloadScore: 2,
    })
    await investRoute.POST(post(undefined, "x"), ctx({ itemId: "b1" }))
    const { user } = lastCall()
    expect(user).toContain("イニシアティブ: I")
    expect(user).toContain("US")
    expect(user).toContain("AC")
  })
})

// ---------------------------------------------------------------- retro-synthesis
describe("retro-synthesis", () => {
  const sprint = {
    sprintName: "S1",
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-01-14T00:00:00Z"),
    status: "completed",
    sprintGoal: "G".repeat(250),
    capacity: 20,
    actualScore: 18,
    items: [
      {
        status: "done",
        taskName: "Task A",
        assignee: "Ann",
        estimatedHours: 3,
        actualHours: 4,
        pbItem: { displayId: 1, initiative: "Init", userStory: "US" },
      },
      {
        status: "todo",
        taskName: null,
        assignee: null,
        estimatedHours: null,
        actualHours: null,
        pbItem: { displayId: 2, initiative: null, userStory: null },
      },
    ],
    dailyScrumNotes: [
      { date: new Date("2026-01-02T00:00:00Z"), author: "Bob", content: "blocked" },
      { date: new Date("2026-01-03T00:00:00Z"), author: null, content: null },
    ],
    retrospectiveKeep: "keep",
    retrospectiveProblem: "problem",
    retrospectiveTry: "try",
    retrospectiveMemo: "memo",
  }

  it("404 when sprint not in project", async () => {
    sprintFindFirst.mockResolvedValue(null)
    expect((await retroRoute.POST(post({}), ctx({ sprintId: "s1" }))).status).toBe(404)
    expect(sprintFindFirst.mock.calls[0][0].where).toEqual({ id: "s1", projectId: "p1" })
    expect(sprintFindFirst.mock.calls[0][0].include.items.where).toEqual({ pbItem: { deletedAt: null } })
  })

  it("serializes sprint, tasks, scrum notes and KPT", async () => {
    sprintFindFirst.mockResolvedValue(sprint)
    const res = await retroRoute.POST(post({ lang: "en" }), ctx({ sprintId: "s1" }))
    expect(await res.text()).toBe("STREAM")
    const { user, opts } = lastCall()
    expect(user).toContain("# Sprint: S1")
    expect(user).toContain("2026-01-01")
    expect(user).toContain("Goal: ")
    expect(user).toContain("…")
    expect(user).toContain("- [done] #1 Task A (assignee: Ann) est: 3 actual: 4")
    expect(user).toContain("- [todo] #2 (no name)")
    expect(user).toContain("- 2026-01-02 (Bob): blocked")
    expect(user).toContain("## Keep\nkeep")
    expect(user).toContain("## Problem\nproblem")
    expect(user).toContain("## Existing Try\ntry")
    expect(user).toContain("## Other Memo\nmemo")
    expect(opts).toMatchObject({ label: "retro-synthesis" })
  })

  it("handles an empty sprint", async () => {
    sprintFindFirst.mockResolvedValue({
      ...sprint,
      sprintGoal: null,
      items: [],
      dailyScrumNotes: [],
      retrospectiveKeep: null,
      retrospectiveProblem: null,
      retrospectiveTry: null,
      retrospectiveMemo: null,
    })
    await retroRoute.POST(post({ lang: "id" }), ctx({ sprintId: "s1" }))
    const { user } = lastCall()
    expect(user).not.toContain("## Tasks")
    expect(user).not.toContain("Goal:")
    await retroRoute.POST(post(undefined, "bad"), ctx({ sprintId: "s1" }))
  })
})
