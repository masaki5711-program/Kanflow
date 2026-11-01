import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => {
  const fake = {
    failureEvent: { groupBy: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    lesson: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMember: { findMany: vi.fn() },
    chatThread: { create: vi.fn() },
    chatMessage: { create: vi.fn() },
  }
  return { fake }
})
vi.mock("@/services/_shared/db", () => ({
  defaultDb: h.fake,
  withTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(h.fake)),
}))
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const { runFeedbackRecurrence, RECURRENCE_THRESHOLD, RECURRENCE_WINDOW_DAYS } = await import("../feedback.recurrence.service")
const { parseToolEvents } = await import("@/services/chat-threads/chat-threads.service")
const { proposalId, threadMarker } = await import("../feedback.recurrence")
const fake = h.fake

const NOW = new Date("2026-11-01T10:00:00.000Z")
const SIG = "c".repeat(64)

function setup(over: { frequent?: Array<{ signature: string }>; confirmed?: unknown[]; lessons?: unknown[]; perProject?: unknown[]; pos?: string[]; project?: unknown } = {}) {
  fake.failureEvent.groupBy.mockImplementation(async (args: { by: string[] }) =>
    args.by[0] === "signature" ? (over.frequent ?? [{ signature: SIG, _count: { _all: 5 } }]) : (over.perProject ?? [{ projectId: "p1", _count: { _all: 4 } }, { projectId: "p2", _count: { _all: 1 } }]),
  )
  let lessonCall = 0
  fake.lesson.findMany.mockImplementation(async () => (lessonCall++ === 0 ? (over.confirmed ?? []) : (over.lessons ?? [])))
  fake.failureEvent.count.mockResolvedValue(5)
  fake.failureEvent.findFirst.mockResolvedValue({ signatureText: "error: lock timeout", tool: "cargo", errorCode: null })
  fake.project.findUnique.mockResolvedValue(over.project ?? { id: "p1", name: "Forge", language: "ja", deletedAt: null })
  fake.projectMember.findMany.mockResolvedValue((over.pos ?? ["po1"]).map((userId) => ({ userId })))
  fake.lesson.create.mockResolvedValue({ id: "new-lesson" })
  fake.lesson.updateMany.mockResolvedValue({ count: 1 })
  fake.chatThread.create.mockImplementation(async ({ data }: { data: { userId: string } }) => ({ id: `t-${data.userId}`, title: "", createdAt: NOW, updatedAt: NOW }))
  fake.chatMessage.create.mockResolvedValue({ id: "m1" })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("runFeedbackRecurrence", () => {
  it("looks for signatures with more than 3 reports in 30 days", async () => {
    setup({ frequent: [] })
    await runFeedbackRecurrence({ now: NOW })
    const args = fake.failureEvent.groupBy.mock.calls[0][0]
    expect(args.having).toEqual({ signature: { _count: { gt: RECURRENCE_THRESHOLD } } })
    expect(NOW.getTime() - args.where.createdAt.gte.getTime()).toBe(RECURRENCE_WINDOW_DAYS * 86_400_000)
    expect(RECURRENCE_THRESHOLD).toBe(3)
  })

  it("creates ONE create_pbi proposal per PO (a chat card) in the project with most reports, and remembers it on the lesson", async () => {
    setup({ pos: ["po1", "po2"] })
    const result = await runFeedbackRecurrence({ now: NOW })
    expect(result).toMatchObject({ candidates: 1, proposed: 1, failed: 0 })
    // no lesson existed → a global draft carries the "proposed" mark
    expect(fake.lesson.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ signature: SIG, scope: "global", state: "draft" }) }))
    expect(fake.lesson.updateMany).toHaveBeenCalledWith({ where: { id: "new-lesson", preventionProposedAt: null }, data: { preventionProposedAt: NOW } })
    expect(fake.chatThread.create).toHaveBeenCalledTimes(2)
    const thread = fake.chatThread.create.mock.calls[0][0].data
    expect(thread).toMatchObject({ projectId: "p1", userId: "po1" })
    expect(thread.title).toContain(threadMarker(SIG))
    const message = fake.chatMessage.create.mock.calls[0][0].data
    const events = parseToolEvents(message.toolEvents)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: "proposal", proposal: { kind: "create_pbi", proposalId: proposalId(SIG) } })
    expect(JSON.stringify(events[0])).toContain("4 回")
    expect(JSON.stringify(events[0])).toContain("Forge")
  })

  describe("nothing unreviewed or foreign reaches the PBI card", () => {
    const lessonRow = (over: Record<string, unknown>) => ({ id: "l1", scope: "global", state: "confirmed", confidential: false, fix: "SECRET-FIX-TEXT", systemizedRef: "gate:x", preventionProposedAt: null, ...over })
    const cardText = () => JSON.stringify(fake.chatMessage.create.mock.calls[0][0].data)

    it.each([
      ["a draft lesson", { state: "draft" }],
      ["a confidential lesson", { confidential: true }],
      ["another project's lesson", { scope: "project:p2" }],
      ["a retired lesson next to nothing else", { state: "retired" }],
    ])("%s: its fix is not in the card (signature and counts only)", async (_n, over) => {
      setup({ lessons: [lessonRow(over), lessonRow({ id: "l2", state: "draft", scope: "global" })] })
      const result = await runFeedbackRecurrence({ now: NOW })
      if (result.proposed === 0) return // all retired → left alone, nothing leaks either
      expect(cardText()).not.toContain("SECRET-FIX-TEXT")
      expect(cardText()).not.toContain("gate:x")
    })

    it("an eligible lesson (confirmed, non-confidential, global / tech / the target project) is used", async () => {
      for (const scope of ["global", "tech:rust", "project:p1"]) {
        vi.clearAllMocks()
        setup({ lessons: [lessonRow({ scope })] })
        await runFeedbackRecurrence({ now: NOW })
        expect(cardText(), scope).toContain("SECRET-FIX-TEXT")
      }
    })

    it("a recurrence flag from a lesson the project may not see does not claim 'a confirmed lesson came back'", async () => {
      setup({
        frequent: [],
        confirmed: [{ signature: SIG, confirmedAt: new Date("2026-10-20T00:00:00Z"), lastSeenAt: new Date("2026-10-30T00:00:00Z") }],
        lessons: [lessonRow({ scope: "project:p2" })],
      })
      await runFeedbackRecurrence({ now: NOW })
      expect(cardText()).not.toContain("確認済みの教訓")
      expect(cardText()).not.toContain("SECRET-FIX-TEXT")
    })

    it("the failure text, tool and count come from the target project's failures only", async () => {
      setup()
      await runFeedbackRecurrence({ now: NOW })
      expect(fake.failureEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { signature: SIG, projectId: "p1" } }))
      // 4 reports in p1 (not the 5 of all projects)
      expect(cardText()).toContain("4 回")
      expect(cardText()).not.toContain("5 回")
    })
  })

  it("is idempotent: a lesson already marked proposed (a second run, a second worker) proposes nothing", async () => {
    setup({ lessons: [{ id: "l1", scope: "global", state: "draft", fix: null, systemizedRef: null, preventionProposedAt: NOW }] })
    expect(await runFeedbackRecurrence({ now: NOW })).toMatchObject({ proposed: 0, alreadyProposed: 1 })
    expect(fake.chatThread.create).not.toHaveBeenCalled()
  })

  it("loses the claim race gracefully: no threads", async () => {
    setup({ lessons: [{ id: "l1", scope: "global", state: "draft", fix: null, systemizedRef: null, preventionProposedAt: null }] })
    fake.lesson.updateMany.mockResolvedValue({ count: 0 })
    expect(await runFeedbackRecurrence({ now: NOW })).toMatchObject({ proposed: 0, alreadyProposed: 1 })
    expect(fake.chatThread.create).not.toHaveBeenCalled()
  })

  it("a confirmed lesson that came back after it was confirmed is proposed even below the count (and says so)", async () => {
    setup({
      frequent: [],
      confirmed: [{ signature: SIG, confirmedAt: new Date("2026-10-20T00:00:00Z"), lastSeenAt: new Date("2026-10-30T00:00:00Z") }],
      lessons: [{ id: "l1", scope: "global", state: "confirmed", fix: "restart the runner", systemizedRef: null, preventionProposedAt: null }],
    })
    expect(await runFeedbackRecurrence({ now: NOW })).toMatchObject({ proposed: 1 })
    const text = fake.chatMessage.create.mock.calls[0][0].data.toolEvents as string
    expect(text).toContain("確認済みの教訓")
    expect(text).toContain("restart the runner")
    expect(fake.lesson.create).not.toHaveBeenCalled()
  })

  it("a confirmed lesson not seen since it was confirmed is not a candidate", async () => {
    setup({
      frequent: [],
      confirmed: [{ signature: SIG, confirmedAt: new Date("2026-10-30T00:00:00Z"), lastSeenAt: new Date("2026-10-20T00:00:00Z") }],
    })
    expect(await runFeedbackRecurrence({ now: NOW })).toMatchObject({ candidates: 0, proposed: 0 })
  })

  it("a signature whose lessons are all retired is left alone", async () => {
    setup({ lessons: [{ id: "l1", scope: "global", state: "retired", fix: null, systemizedRef: null, preventionProposedAt: null }] })
    expect(await runFeedbackRecurrence({ now: NOW })).toMatchObject({ proposed: 0, retired: 1 })
  })

  it("reports outside any project, or a project without an active PO, are counted, not proposed", async () => {
    setup({ perProject: [] })
    expect(await runFeedbackRecurrence({ now: NOW })).toMatchObject({ proposed: 0, skippedNoProject: 1 })
    setup({ pos: [] })
    expect(await runFeedbackRecurrence({ now: NOW })).toMatchObject({ proposed: 0, skippedNoPo: 1 })
    expect(fake.lesson.updateMany).not.toHaveBeenCalled()
  })

  it("the proposal follows the project's language", async () => {
    setup({ project: { id: "p1", name: "Forge", language: "en", deletedAt: null } })
    await runFeedbackRecurrence({ now: NOW })
    expect(fake.chatMessage.create.mock.calls[0][0].data.content).toMatch(/prevention PBI/)
  })

  it("a failing signature is logged with its code and does not stop the others", async () => {
    setup({ frequent: [{ signature: SIG }, { signature: "d".repeat(64) }] })
    fake.project.findUnique.mockRejectedValueOnce(new Error("db down")).mockResolvedValue({ id: "p1", name: "Forge", language: "ja", deletedAt: null })
    const result = await runFeedbackRecurrence({ now: NOW })
    expect(result).toMatchObject({ candidates: 2, proposed: 1, failed: 1 })
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("failed"), expect.objectContaining({ errorCode: "FEEDBACK_RECURRENCE_FAILED" }))
  })
})
