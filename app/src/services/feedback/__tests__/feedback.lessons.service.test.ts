import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../feedback.repository", async (orig) => {
  const real = await orig<typeof import("../feedback.repository")>()
  return Object.fromEntries(Object.entries(real).map(([k, v]) => [k, typeof v === "function" ? vi.fn() : v]))
})
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const repo = await import("../feedback.repository")
const svc = await import("../feedback.lessons.service")
const { loadViewerAccess } = await import("../feedback.access")

const NOW = new Date("2026-11-01T10:00:00.000Z")
const rowsFor = (rows: Array<{ projectId: string; role: string }>) => ({ projectMember: { findMany: vi.fn(async () => rows) } }) as never

const ADMIN = { userId: "admin", systemRole: "admin" }
const SECTION_MGR = { userId: "sm0", systemRole: "section_manager" }
const PO_P1 = { userId: "po1", systemRole: "member" }
const DEV_P1 = { userId: "dev1", systemRole: "member" }
const OUTSIDER = { userId: "out", systemRole: "member" }
const DB: Record<string, never> = {
  admin: rowsFor([]),
  sm0: rowsFor([]),
  po1: rowsFor([{ projectId: "p1", role: "po" }]),
  dev1: rowsFor([{ projectId: "p1", role: "dev" }]),
  out: rowsFor([]),
}
const dbOf = (v: { userId: string }) => DB[v.userId]

function lesson(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    signature: "a".repeat(64),
    scope: "global",
    state: "draft",
    symptom: "boom",
    cause: null,
    fix: "do this",
    verify: null,
    evidence: null,
    errorCode: null,
    confidential: false,
    hits: 1,
    resolvedCount: 1,
    lastSeenAt: NOW,
    confirmedAt: null,
    confirmedBy: null,
    systemizedRef: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findLessonById).mockResolvedValue(lesson())
  vi.mocked(repo.transitionLesson).mockResolvedValue(1)
  vi.mocked(repo.findLessonByKey).mockResolvedValue(null)
  vi.mocked(repo.listLessons).mockResolvedValue([])
  vi.mocked(repo.listFailures).mockResolvedValue([])
})

describe("what an AI session may see (searchSharedLessons)", () => {
  it("asks only for confirmed / systemized, non-confidential lessons in global, tech and the member projects' scopes", async () => {
    await svc.searchSharedLessons(PO_P1, { limit: 20 }, dbOf(PO_P1))
    const where = JSON.stringify(vi.mocked(repo.listLessons).mock.calls[0][1])
    expect(where).toContain('"state":{"in":["confirmed","systemized"]}')
    expect(where).toContain('"confidential":false')
    expect(where).toContain('"scope":"global"')
    expect(where).toContain('"startsWith":"tech:"')
    expect(where).toContain('"project:p1"')
    expect(where).not.toContain("draft")
    expect(where).not.toContain("retired")
  })

  it("a state filter is ignored for tokens: drafts never come back, even for an admin's token", async () => {
    await svc.searchSharedLessons(ADMIN, { limit: 20, state: "draft" }, dbOf(ADMIN))
    const where = JSON.stringify(vi.mocked(repo.listLessons).mock.calls[0][1])
    expect(where).not.toContain('"state":"draft"')
    expect(where).toContain('"state":{"in":["confirmed","systemized"]}')
  })

  it("an outsider's query has no project scope in it", async () => {
    await svc.searchSharedLessons(OUTSIDER, { limit: 20 }, dbOf(OUTSIDER))
    expect(JSON.stringify(vi.mocked(repo.listLessons).mock.calls[0][1])).not.toContain("project:")
  })

  it("filters: signature, error code, text, tech and project (global lessons always included)", async () => {
    await svc.searchSharedLessons(PO_P1, { limit: 5, q: "lock", errorCode: "E1", signature: "b".repeat(64), tech: "rust", projectId: "P1" }, dbOf(PO_P1))
    const where = JSON.stringify(vi.mocked(repo.listLessons).mock.calls[0][1])
    expect(where).toContain('"errorCode":"E1"')
    expect(where).toContain('"signature":"' + "b".repeat(64) + '"')
    expect(where).toContain('"scope":{"in":["global","tech:rust","project:p1"]}')
    expect(where).toContain('"contains":"lock"')
    expect(vi.mocked(repo.listLessons).mock.calls[0][2]).toBe(6)
  })

  it("truncated is true when more than `limit` rows exist", async () => {
    vi.mocked(repo.listLessons).mockResolvedValue([lesson({ id: "a" }), lesson({ id: "b" })])
    const res = await svc.searchSharedLessons(PO_P1, { limit: 1 }, dbOf(PO_P1))
    expect(res.lessons).toHaveLength(1)
    expect(res.truncated).toBe(true)
    expect(Object.keys(res.lessons[0])).not.toContain("confidential")
  })
})

describe("screen list: shared lessons plus what the viewer curates", () => {
  it("a developer gets the shared where only; a PO also gets drafts of their project; an admin everything", async () => {
    await svc.listLessonsForScreen(DEV_P1, { limit: 20 }, dbOf(DEV_P1))
    expect(JSON.stringify(vi.mocked(repo.listLessons).mock.calls[0][1])).not.toContain('"OR":[{"state"')
    await svc.listLessonsForScreen(PO_P1, { limit: 20 }, dbOf(PO_P1))
    const po = JSON.stringify(vi.mocked(repo.listLessons).mock.calls[1][1])
    expect(po).toContain('"project:p1"')
    expect(po).toContain('"state":{"in":["confirmed","systemized"]}')
    await svc.listLessonsForScreen(ADMIN, { limit: 20, state: "draft" }, dbOf(ADMIN))
    expect(JSON.stringify(vi.mocked(repo.listLessons).mock.calls[2][1])).toContain('"OR":[{"state"')
  })

  it("reports per lesson whether the viewer may curate it", async () => {
    vi.mocked(repo.listLessons).mockResolvedValue([lesson({ id: "g", scope: "global" }), lesson({ id: "p", scope: "project:p1" })])
    const res = await svc.listLessonsForScreen(PO_P1, { limit: 20 }, dbOf(PO_P1))
    expect(res.curatable).toEqual({ g: false, p: true })
    expect(res.canCurate).toBe(true)
    const dev = await svc.listLessonsForScreen(DEV_P1, { limit: 20 }, dbOf(DEV_P1))
    expect(dev.canCurate).toBe(false)
  })
})

describe("confirm: who may, what changes", () => {
  it("allow: admin and section manager (global), PO (own project)", async () => {
    for (const viewer of [ADMIN, SECTION_MGR]) {
      await expect(svc.confirmLesson(viewer, "l1", {}, NOW, dbOf(viewer))).resolves.toBeDefined()
    }
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ scope: "project:p1" }))
    await expect(svc.confirmLesson(PO_P1, "l1", {}, NOW, dbOf(PO_P1))).resolves.toBeDefined()
    expect(repo.transitionLesson).toHaveBeenCalledTimes(3)
  })

  it("deny: a developer, an outsider and a PO of another scope; a draft they cannot see is a 404, not a 403", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ scope: "project:p1" }))
    await expect(svc.confirmLesson(DEV_P1, "l1", {}, NOW, dbOf(DEV_P1))).rejects.toMatchObject({ status: 404, code: "LESSON_NOT_FOUND" })
    await expect(svc.confirmLesson(OUTSIDER, "l1", {}, NOW, dbOf(OUTSIDER))).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ scope: "global" }))
    await expect(svc.confirmLesson(PO_P1, "l1", {}, NOW, dbOf(PO_P1))).rejects.toMatchObject({ status: 404 })
    // A shared lesson the developer can see but not curate: 403.
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ scope: "project:p1", state: "confirmed" }))
    await expect(svc.confirmLesson(DEV_P1, "l1", {}, NOW, dbOf(DEV_P1))).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" })
    expect(repo.transitionLesson).not.toHaveBeenCalled()
  })

  it("draft → confirmed records who and when, from draft | retired only (compare-and-set)", async () => {
    await svc.confirmLesson(SECTION_MGR, "l1", { cause: "because" }, NOW, dbOf(SECTION_MGR))
    expect(repo.transitionLesson).toHaveBeenCalledWith(dbOf(SECTION_MGR), "l1", ["draft", "retired"], expect.objectContaining({ state: "confirmed", confirmedById: "sm0", confirmedAt: NOW, cause: "because" }))
  })

  it("needs a fix: a draft without one is refused unless the maintainer writes it", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ fix: null }))
    await expect(svc.confirmLesson(ADMIN, "l1", {}, NOW, dbOf(ADMIN))).rejects.toMatchObject({ status: 400 })
    await expect(svc.confirmLesson(ADMIN, "l1", { fix: "restart the runner" }, NOW, dbOf(ADMIN))).resolves.toBeDefined()
  })

  it("confirming a confirmed lesson is a no-op; a systemized one is a 409", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "confirmed" }))
    await svc.confirmLesson(ADMIN, "l1", {}, NOW, dbOf(ADMIN))
    expect(repo.transitionLesson).not.toHaveBeenCalled()
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "systemized" }))
    await expect(svc.confirmLesson(ADMIN, "l1", {}, NOW, dbOf(ADMIN))).rejects.toMatchObject({ status: 409, code: "LESSON_STATE" })
  })

  it("a lost race (0 rows changed) is a 409 unless the lesson already is confirmed", async () => {
    vi.mocked(repo.transitionLesson).mockResolvedValue(0)
    vi.mocked(repo.findLessonById).mockResolvedValueOnce(lesson()).mockResolvedValueOnce(lesson({ state: "retired" }))
    await expect(svc.confirmLesson(ADMIN, "l1", {}, NOW, dbOf(ADMIN))).rejects.toMatchObject({ status: 409, code: "LESSON_STATE" })
    vi.mocked(repo.findLessonById).mockResolvedValueOnce(lesson()).mockResolvedValueOnce(lesson({ state: "confirmed" }))
    await expect(svc.confirmLesson(ADMIN, "l1", {}, NOW, dbOf(ADMIN))).resolves.toMatchObject({ state: "confirmed" })
  })

  it("changing the scope needs the right on the new scope and a free (signature, scope) key", async () => {
    await expect(svc.confirmLesson(SECTION_MGR, "l1", { scope: "project:p1" }, NOW, dbOf(SECTION_MGR))).rejects.toMatchObject({ status: 403 })
    vi.mocked(repo.findLessonByKey).mockResolvedValue(lesson({ id: "other", scope: "tech:rust" }))
    await expect(svc.confirmLesson(SECTION_MGR, "l1", { scope: "tech:rust" }, NOW, dbOf(SECTION_MGR))).rejects.toMatchObject({ status: 409 })
  })

  it("curator text is redacted and a leftover credential is refused", async () => {
    await expect(svc.confirmLesson(ADMIN, "l1", { fix: "export password=correcthorse" }, NOW, dbOf(ADMIN))).rejects.toMatchObject({ status: 422, code: "FEEDBACK_REDACTION_FAILED" })
    await svc.confirmLesson(ADMIN, "l1", { fix: "ask bob@corp.example.com" }, NOW, dbOf(ADMIN))
    expect(vi.mocked(repo.transitionLesson).mock.calls[0][3]).toMatchObject({ fix: "ask <email>" })
  })
})

describe("retire", () => {
  it("any non-retired lesson, by a curator; idempotent; the reason is kept as evidence", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "confirmed" }))
    await svc.retireLesson(ADMIN, "l1", { reason: "fixed upstream" }, dbOf(ADMIN))
    expect(repo.transitionLesson).toHaveBeenCalledWith(dbOf(ADMIN), "l1", ["draft", "confirmed", "systemized"], expect.objectContaining({ state: "retired", evidence: JSON.stringify(["retired: fixed upstream"]) }))
    vi.mocked(repo.transitionLesson).mockClear()
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "retired" }))
    await svc.retireLesson(ADMIN, "l1", {}, dbOf(ADMIN))
    expect(repo.transitionLesson).not.toHaveBeenCalled()
  })

  it("denied for a developer", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "confirmed", scope: "project:p1" }))
    await expect(svc.retireLesson(DEV_P1, "l1", {}, dbOf(DEV_P1))).rejects.toMatchObject({ status: 403 })
  })
})

describe("systemize", () => {
  it("needs a confirmed lesson and a link (kind + ref), stored as kind:ref", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "confirmed" }))
    await svc.systemizeLesson(ADMIN, "l1", { kind: "gate", ref: "ci/lint-no-unwrap" }, dbOf(ADMIN))
    expect(repo.transitionLesson).toHaveBeenCalledWith(dbOf(ADMIN), "l1", ["confirmed"], { state: "systemized", systemizedRef: "gate:ci/lint-no-unwrap" })
  })

  it("a draft or retired lesson cannot be systemized (409 LESSON_STATE)", async () => {
    for (const state of ["draft", "retired"]) {
      vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state }))
      await expect(svc.systemizeLesson(ADMIN, "l1", { kind: "test", ref: "t" }, dbOf(ADMIN))).rejects.toMatchObject({ status: 409, code: "LESSON_STATE" })
    }
  })

  it("the same link again is a no-op", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "systemized", systemizedRef: "pbi:PBI-12" }))
    await svc.systemizeLesson(ADMIN, "l1", { kind: "pbi", ref: "PBI-12" }, dbOf(ADMIN))
    expect(repo.transitionLesson).not.toHaveBeenCalled()
  })

  it("denied for a developer", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "confirmed", scope: "project:p1" }))
    await expect(svc.systemizeLesson(DEV_P1, "l1", { kind: "pbi", ref: "PBI-1" }, dbOf(DEV_P1))).rejects.toMatchObject({ status: 403 })
  })
})

describe("detail and failure history", () => {
  it("a curator gets the history of the signature, limited to what they curate; others get none", async () => {
    vi.mocked(repo.findLessonById).mockResolvedValue(lesson({ state: "confirmed", scope: "project:p1" }))
    const po = await svc.getLessonDetail(PO_P1, "l1", dbOf(PO_P1))
    expect(po.canCurate).toBe(true)
    expect(JSON.stringify(vi.mocked(repo.listFailures).mock.calls[0][1])).toContain('"projectId":{"in":["p1"]}')
    vi.mocked(repo.listFailures).mockClear()
    const dev = await svc.getLessonDetail(DEV_P1, "l1", dbOf(DEV_P1))
    expect(dev.canCurate).toBe(false)
    expect(dev.failures).toEqual([])
    expect(repo.listFailures).not.toHaveBeenCalled()
  })

  it("a draft is invisible to a non-curator (404)", async () => {
    await expect(svc.getLessonDetail(DEV_P1, "l1", dbOf(DEV_P1))).rejects.toMatchObject({ status: 404, code: "LESSON_NOT_FOUND" })
  })

  it("loadViewerAccess is used per call (no cross-request cache)", async () => {
    const d = rowsFor([])
    await loadViewerAccess(d, OUTSIDER)
    await loadViewerAccess(d, OUTSIDER)
    expect((d as unknown as { projectMember: { findMany: ReturnType<typeof vi.fn> } }).projectMember.findMany).toHaveBeenCalledTimes(2)
  })
})
