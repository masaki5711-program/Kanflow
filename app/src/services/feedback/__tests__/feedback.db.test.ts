import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The feedback loop against a REAL MariaDB / MySQL (the rest of the suite mocks Prisma). Skipped unless
 * KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (synthetic rows only,
 * removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 DATABASE_PASSWORD=... DATABASE_NAME=kanflow_test npx vitest run src/services/feedback/__tests__/feedback.db.test.ts
 *
 * What it pins (the things mocks cannot show): the (signature, scope) unique key, one resolution per
 * failure under concurrent reports, the report → resolution → draft lesson → confirm path, and that two
 * concurrent recurrence runs propose exactly once.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("feedback loop on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `w11test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, dev: `${tag}-dev`, po: `${tag}-po` }

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../feedback.service")
  let lessonsSvc: typeof import("../feedback.lessons.service")
  let recurrence: typeof import("../feedback.recurrence.service")

  const actor = (userId: string) => ({ userId, userName: userId, systemRole: "member" })

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../feedback.service")
    lessonsSvc = await import("../feedback.lessons.service")
    recurrence = await import("../feedback.recurrence.service")
    await prisma.user.createMany({ data: [ids.dev, ids.po].map((id) => ({ id, name: id, email: `${id}@example.test`, password: "synthetic" })) })
    await prisma.project.create({ data: { id: ids.project, name: tag } })
    await prisma.projectMember.createMany({
      data: [
        { projectId: ids.project, userId: ids.dev, role: "dev" },
        { projectId: ids.project, userId: ids.po, role: "po" },
      ],
    })
  })

  afterAll(async () => {
    if (!prisma) return
    const events = await prisma.failureEvent.findMany({ where: { projectId: ids.project }, select: { signature: true } })
    await prisma.lesson.deleteMany({ where: { signature: { in: events.map((e) => e.signature) } } })
    await prisma.failureEvent.deleteMany({ where: { projectId: ids.project } })
    await prisma.chatThread.deleteMany({ where: { projectId: ids.project } })
    await prisma.projectMember.deleteMany({ where: { projectId: ids.project } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.dev, ids.po] } } })
  })

  it("report → resolution → draft lesson (invisible to AI) → confirm by the PO → returned for the next report", async () => {
    const text = `${tag}: lock timeout after 30s on runner 7`
    const first = await svc.reportFailure({ source: "agent", tool: "cargo test", text, projectId: ids.project, sessionRef: "s-1" }, actor(ids.dev))
    expect(first.lessons).toEqual([])
    const resolved = await svc.reportResolution({ sessionRef: "s-1", diffSummary: "restarted the runner", verifiedCommand: "cargo test" }, actor(ids.dev))
    expect(resolved.lesson.state).toBe("draft")
    const shared = await lessonsSvc.searchSharedLessons({ userId: ids.dev, systemRole: "member" }, { limit: 20, signature: first.failure.signature })
    expect(shared.lessons).toEqual([])
    await lessonsSvc.confirmLesson({ userId: ids.po, systemRole: "member" }, resolved.lesson.id, {})
    // 61 s later (another reporter-minute): force the collapse window to pass by using a later clock.
    const later = await svc.reportFailure({ source: "agent", tool: "cargo test", text, projectId: ids.project }, actor(ids.dev), new Date(Date.now() + 120_000))
    expect(later.lessons.map((l) => l.id)).toEqual([resolved.lesson.id])
  })

  it("two concurrent resolutions of one failure: one wins, the other is refused; one lesson only", async () => {
    const text = `${tag}: concurrent resolution case`
    await svc.reportFailure({ source: "agent", tool: "npm test", text, projectId: ids.project, sessionRef: "s-2" }, actor(ids.dev))
    const results = await Promise.allSettled([1, 2].map((n) => svc.reportResolution({ sessionRef: "s-2", diffSummary: `fix ${n}` }, actor(ids.dev))))
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1)
  })

  it("two concurrent recurrence runs propose exactly once", async () => {
    const text = `${tag}: flaky e2e on login page`
    for (let i = 0; i < 5; i++) {
      await svc.reportFailure({ source: "ci", tool: "playwright", text, projectId: ids.project }, actor(ids.dev), new Date(Date.now() + i * 120_000))
    }
    const results = await Promise.all([recurrence.runFeedbackRecurrence(), recurrence.runFeedbackRecurrence()])
    expect(results.reduce((n, r) => n + r.proposed, 0)).toBe(1)
    const threads = await prisma.chatThread.count({ where: { projectId: ids.project, userId: ids.po } })
    expect(threads).toBeGreaterThanOrEqual(1)
    const again = await recurrence.runFeedbackRecurrence()
    expect(again.proposed).toBe(0)
  })
})
