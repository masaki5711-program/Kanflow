import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../feedback.repository", async (orig) => {
  const real = await orig<typeof import("../feedback.repository")>()
  return Object.fromEntries(Object.entries(real).map(([k, v]) => [k, typeof v === "function" ? vi.fn() : v]))
})
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

vi.mock("../feedback.access", async (orig) => ({ ...(await orig<typeof import("../feedback.access")>()), loadViewerAccess: vi.fn() }))

const repo = await import("../feedback.repository")
const access = await import("../feedback.access")
const svc = await import("../feedback.service")
const { TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const { hashSignature, normalizeFailureText } = await import("../signature")
const { redactText } = await import("../redact")

const NOW = new Date("2026-11-01T10:00:00.000Z")
const ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "api" as const }
const SECRET_BEARER = "Authorization: Bearer abcdef0123456789abcdef0123456789"

function failureRow(over: Record<string, unknown> = {}) {
  return {
    id: "f1",
    projectId: null,
    source: "agent",
    signature: "a".repeat(64),
    signatureText: "boom",
    tool: "cargo test",
    errorCode: null,
    excerpt: "boom",
    sessionRef: "s-1",
    branch: null,
    repeatCount: 1,
    createdAt: NOW,
    ...over,
  } as never
}

function lessonRow(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    signature: "a".repeat(64),
    scope: "global",
    state: "confirmed",
    symptom: "boom",
    cause: "because",
    fix: "do this",
    verify: "cargo test",
    evidence: null,
    errorCode: null,
    confidential: false,
    hits: 2,
    resolvedCount: 1,
    lastSeenAt: NOW,
    confirmedAt: NOW,
    confirmedBy: null,
    systemizedRef: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findRecentSameFailure).mockResolvedValue(null)
  vi.mocked(repo.createFailure).mockImplementation((async (_db: unknown, data: object) => failureRow({ ...data })) as never)
  vi.mocked(repo.foldRepeat).mockResolvedValue(failureRow({ repeatCount: 2 }))
  vi.mocked(repo.bumpLessonHits).mockResolvedValue({ count: 0 } as never)
  vi.mocked(repo.findSharedLessonsBySignature).mockResolvedValue([])
  vi.mocked(access.loadViewerAccess).mockResolvedValue({ userId: "u1", admin: false, curatesGlobal: false, memberProjects: new Set(), curatorProjects: new Set() })
})

describe("pure helpers", () => {
  it("clipExcerpt keeps a short text, otherwise the head and the tail within the byte bound", () => {
    expect(svc.clipExcerpt("short")).toBe("short")
    const long = `HEAD-${"x".repeat(10_000)}-TAIL`
    const clipped = svc.clipExcerpt(long)
    expect(Buffer.byteLength(clipped, "utf8")).toBeLessThanOrEqual(4096)
    expect(clipped.startsWith("HEAD-")).toBe(true)
    expect(clipped.endsWith("-TAIL")).toBe(true)
    expect(clipped).toContain("[…]")
  })

  it("clipUtf8 never cuts a multi-byte character", () => {
    const s = "あいうえお"
    const c = svc.clipUtf8(s, 7)
    expect(c).toBe("あい")
    expect(Buffer.byteLength(c)).toBeLessThanOrEqual(7)
  })

  it("scopeApplies: global always, project only for that project, tech by techs or the tool's first word", () => {
    const ctx = { projectId: "P1", techs: ["rust"], tool: "npm run lint" }
    expect(svc.scopeApplies("global", ctx)).toBe(true)
    expect(svc.scopeApplies("project:p1", ctx)).toBe(true)
    expect(svc.scopeApplies("project:p2", ctx)).toBe(false)
    expect(svc.scopeApplies("project:p1", { ...ctx, projectId: null })).toBe(false)
    expect(svc.scopeApplies("tech:rust", ctx)).toBe(true)
    expect(svc.scopeApplies("tech:npm", ctx)).toBe(true)
    expect(svc.scopeApplies("tech:postgres", ctx)).toBe(false)
  })
})

describe("reportFailure", () => {
  const input = { source: "agent" as const, tool: " cargo test ", text: "error[E0308]: mismatched types\n  --> /home/alice/x/src/lib.rs:4:2", sessionRef: "s-1" }

  it("stores the redacted failure with its signature, in one transaction", async () => {
    await svc.reportFailure(input, ACTOR, NOW)
    const created = vi.mocked(repo.createFailure).mock.calls[0]
    expect(created[0]).toBe(TX)
    const data = created[1]
    expect(data).toMatchObject({ projectId: null, source: "agent", tool: "cargo test", errorCode: null, reportedById: "u1", sessionRef: "s-1" })
    expect(data.excerpt).toContain("~/x/src/lib.rs")
    expect(data.excerpt).not.toContain("alice")
    expect(data.signature).toBe(hashSignature("cargo test", null, normalizeFailureText(redactText(input.text).text)))
    expect(repo.bumpLessonHits).toHaveBeenCalledWith(TX, data.signature, NOW)
  })

  it("never stores a secret: it is masked in the excerpt", async () => {
    await svc.reportFailure({ ...input, text: `login failed\n${SECRET_BEARER}` }, ACTOR, NOW)
    const data = vi.mocked(repo.createFailure).mock.calls[0][1]
    expect(data.excerpt).not.toContain("abcdef0123456789")
    expect(data.excerpt).toContain("[REDACTED]")
  })

  it("422 FEEDBACK_REDACTION_FAILED when something credential-like remains; nothing is stored", async () => {
    await expect(svc.reportFailure({ ...input, text: "deploy failed with Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12" }, ACTOR, NOW)).rejects.toMatchObject({
      status: 422,
      code: "FEEDBACK_REDACTION_FAILED",
    })
    expect(repo.createFailure).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("refused"), expect.objectContaining({ kind: "long-token", errorCode: "FEEDBACK_REDACTION_FAILED" }))
    // The value itself is never logged.
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("Ab12Cd34")
  })

  it("400 when the text has no meaningful content and there is no error code", async () => {
    await expect(svc.reportFailure({ ...input, text: "\n ^^^\n 12 34\n" }, ACTOR, NOW)).rejects.toMatchObject({ status: 400 })
    await expect(svc.reportFailure({ ...input, text: "\n ^^^\n", errorCode: "FG-AUTH-0001" }, ACTOR, NOW)).resolves.toBeDefined()
  })

  it("an identical report of the same reporter within a minute is folded, not stored again, and not counted again", async () => {
    vi.mocked(repo.findRecentSameFailure).mockResolvedValue(failureRow())
    const result = await svc.reportFailure(input, ACTOR, NOW)
    expect(result.collapsed).toBe(true)
    expect(repo.foldRepeat).toHaveBeenCalledWith(TX, "f1")
    expect(repo.createFailure).not.toHaveBeenCalled()
    expect(repo.bumpLessonHits).not.toHaveBeenCalled()
  })

  it("the same reporter is counted on the lessons once a day: a report older than a minute but within 24 h is stored, not counted again", async () => {
    vi.mocked(repo.findRecentSameFailure).mockResolvedValue(failureRow({ createdAt: new Date(NOW.getTime() - 3_600_000) }))
    const result = await svc.reportFailure(input, ACTOR, NOW)
    expect(result.collapsed).toBe(false)
    expect(repo.createFailure).toHaveBeenCalled()
    expect(repo.bumpLessonHits).not.toHaveBeenCalled()
    const since = vi.mocked(repo.findRecentSameFailure).mock.calls[0][3]
    expect(NOW.getTime() - since.getTime()).toBe(svc.HIT_WINDOW_MS)
  })

  it("answers with at most 3 applicable lessons, systemized first", async () => {
    vi.mocked(repo.findSharedLessonsBySignature).mockResolvedValue([
      lessonRow({ id: "a", hits: 1 }),
      lessonRow({ id: "b", hits: 9 }),
      lessonRow({ id: "c", hits: 5, state: "systemized" }),
      lessonRow({ id: "d", hits: 8 }),
      lessonRow({ id: "other-project", scope: "project:zzz", hits: 99 }),
    ])
    const result = await svc.reportFailure(input, ACTOR, NOW)
    expect(result.lessons.map((l) => l.id)).toEqual(["c", "b", "d"])
    expect(repo.findSharedLessonsBySignature).toHaveBeenCalledWith(DEFAULT_DB, expect.any(String), ["confirmed", "systemized"])
    // No internal columns leak to the AI.
    expect(Object.keys(result.lessons[0]).sort()).not.toContain("confidential")
  })

  it("a lookup that takes longer than 2 s still returns the recorded failure (lessonsUnavailable, logged)", async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(repo.findSharedLessonsBySignature).mockReturnValue(new Promise(() => undefined) as never)
      const pending = svc.reportFailure(input, ACTOR, NOW)
      await vi.advanceTimersByTimeAsync(svc.LESSON_LOOKUP_TIMEOUT_MS + 10)
      const result = await pending
      expect(result.lessons).toEqual([])
      expect(result.lessonsUnavailable).toBe(true)
      expect(result.failure.id).toBe("f1")
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("timed out"), expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it("a failing lookup is logged and does not fail the report", async () => {
    vi.mocked(repo.findSharedLessonsBySignature).mockRejectedValue(new Error("db down"))
    const result = await svc.reportFailure(input, ACTOR, NOW)
    expect(result.lessonsUnavailable).toBe(true)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("failed"), expect.objectContaining({ error: "db down" }))
  })
})

describe("reportResolution", () => {
  const input = { sessionRef: "s-1", diffSummary: "pinned the dependency", verifiedCommand: "cargo test" }
  const failure = failureRow({ projectId: "p1" })

  beforeEach(() => {
    vi.mocked(repo.findFailureToResolve).mockResolvedValue(failure)
    vi.mocked(repo.findLessonByKey).mockResolvedValue(null)
    vi.mocked(repo.countFailuresOfSignature).mockResolvedValue(4)
    vi.mocked(repo.createLesson).mockResolvedValue(lessonRow({ state: "draft", scope: "project:p1" }))
    vi.mocked(repo.updateLessonData).mockResolvedValue(lessonRow({ state: "draft" }))
    vi.mocked(repo.createResolution).mockResolvedValue({ id: "r1", failureEventId: "f1", lessonId: "l1", diffSummary: "x", verifiedCommand: null, createdAt: NOW } as never)
  })

  it("attaches to the session's latest unresolved failure of the caller (last 24 h) and creates a DRAFT lesson in the project scope", async () => {
    const result = await svc.reportResolution(input, ACTOR, NOW)
    const find = vi.mocked(repo.findFailureToResolve).mock.calls[0][1]
    expect(find).toMatchObject({ reportedById: "u1", sessionRef: "s-1" })
    expect(NOW.getTime() - find.since.getTime()).toBe(24 * 3_600_000)
    expect(repo.createLesson).toHaveBeenCalledWith(TX, expect.objectContaining({ signature: "a".repeat(64), scope: "project:p1", fix: "pinned the dependency", verify: "cargo test", hits: 4, resolvedCount: 1 }))
    expect(repo.createResolution).toHaveBeenCalledWith(TX, { failureEventId: "f1", lessonId: "l1", diffSummary: "pinned the dependency", verifiedCommand: "cargo test" })
    expect(result.lessonCreated).toBe(true)
    expect(result.lesson.state).toBe("draft")
  })

  it("a failure outside a project gives a global lesson; an explicit scope wins", async () => {
    vi.mocked(repo.findFailureToResolve).mockResolvedValue(failureRow({ projectId: null }))
    await svc.reportResolution(input, ACTOR, NOW)
    expect(vi.mocked(repo.createLesson).mock.calls[0][1].scope).toBe("global")
    await svc.reportResolution({ ...input, scope: "tech:rust" }, ACTOR, NOW)
    expect(vi.mocked(repo.createLesson).mock.calls[1][1].scope).toBe("tech:rust")
  })

  it("a second fix of an existing lesson only counts (no new lesson), and fills a draft's missing fix", async () => {
    vi.mocked(repo.findLessonByKey).mockResolvedValue(lessonRow({ state: "draft", fix: null, evidence: JSON.stringify(["old"]) }))
    const result = await svc.reportResolution({ ...input, evidence: ["https://gitlab.scm.service.infosys.yamaha.com/g/r/-/merge_requests/1"] }, ACTOR, NOW)
    expect(repo.createLesson).not.toHaveBeenCalled()
    const data = vi.mocked(repo.updateLessonData).mock.calls[0][2] as Record<string, unknown>
    expect(data).toMatchObject({ resolvedCount: { increment: 1 }, lastSeenAt: NOW, fix: "pinned the dependency" })
    expect(JSON.parse(String(data.evidence))).toEqual(["old", "https://gitlab.scm.service.infosys.yamaha.com/g/r/-/merge_requests/1"])
    expect(result.lessonCreated).toBe(false)
  })

  it("a confirmed lesson's text is never rewritten by a later resolution", async () => {
    vi.mocked(repo.findLessonByKey).mockResolvedValue(lessonRow({ state: "confirmed" }))
    await svc.reportResolution(input, ACTOR, NOW)
    const data = vi.mocked(repo.updateLessonData).mock.calls[0][2] as Record<string, unknown>
    expect(data).not.toHaveProperty("fix")
    expect(data).not.toHaveProperty("state")
  })

  it("scope choice: anyone may use the failure's project or a tech scope; global / another project only a curator of it", async () => {
    await expect(svc.reportResolution({ ...input, scope: "global" }, ACTOR, NOW)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" })
    await expect(svc.reportResolution({ ...input, scope: "project:zzz" }, ACTOR, NOW)).rejects.toMatchObject({ status: 403 })
    expect(repo.createLesson).not.toHaveBeenCalled()
    await expect(svc.reportResolution({ ...input, scope: "tech:rust" }, ACTOR, NOW)).resolves.toBeDefined()
    await expect(svc.reportResolution({ ...input, scope: "project:p1" }, ACTOR, NOW)).resolves.toBeDefined()
    vi.mocked(access.loadViewerAccess).mockResolvedValue({ userId: "u1", admin: false, curatesGlobal: true, memberProjects: new Set(), curatorProjects: new Set() })
    await expect(svc.reportResolution({ ...input, scope: "global" }, ACTOR, NOW)).resolves.toBeDefined()
  })

  it("404 FEEDBACK_NO_FAILURE when the session has no unresolved failure", async () => {
    vi.mocked(repo.findFailureToResolve).mockResolvedValue(null)
    await expect(svc.reportResolution(input, ACTOR, NOW)).rejects.toMatchObject({ status: 404, code: "FEEDBACK_NO_FAILURE" })
  })

  it("409 when the failure already has a resolution (unique violation)", async () => {
    vi.mocked(repo.createResolution).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002", name: "PrismaClientKnownRequestError" }))
    await expect(svc.reportResolution(input, ACTOR, NOW)).rejects.toMatchObject({ status: 409 })
  })

  it("redacts the fix and refuses a leftover credential (422)", async () => {
    await svc.reportResolution({ ...input, diffSummary: `changed ${SECRET_BEARER}` }, ACTOR, NOW)
    expect(vi.mocked(repo.createResolution).mock.calls[0][1].diffSummary).not.toContain("abcdef0123456789")
    await expect(svc.reportResolution({ ...input, verifiedCommand: "curl --data Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12" }, ACTOR, NOW)).rejects.toMatchObject({ status: 422, code: "FEEDBACK_REDACTION_FAILED" })
  })
})
