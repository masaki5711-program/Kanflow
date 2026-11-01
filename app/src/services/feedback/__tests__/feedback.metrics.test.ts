import { describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

const { countRecurrences, getFeedbackMetrics, METRICS_WINDOW_DAYS } = await import("../feedback.metrics.service")

const NOW = new Date("2026-11-01T10:00:00.000Z")
const START = new Date(NOW.getTime() - METRICS_WINDOW_DAYS * 86_400_000)
const at = (min: number) => new Date(NOW.getTime() - min * 60_000)

describe("countRecurrences: a report is a recurrence when its signature was reported before (any project)", () => {
  it("a signature first seen in the window: all but the first; first seen before: all", () => {
    const r = countRecurrences({
      inWindow: new Map([["new", 3], ["old", 2], ["single", 1]]),
      firstEver: new Map([["new", new Date(START.getTime() + 1000)], ["old", new Date(START.getTime() - 1000)], ["single", new Date(START.getTime() + 5)]]),
      windowStart: START,
    })
    expect(r).toEqual({ reports: 6, recurrences: 2 + 2 + 0 })
  })

  it("nothing → zero", () => {
    expect(countRecurrences({ inWindow: new Map(), firstEver: new Map(), windowStart: START })).toEqual({ reports: 0, recurrences: 0 })
  })
})

function fakeDb() {
  return {
    projectMember: { findMany: vi.fn(async () => [{ projectId: "p1", role: "po" }]) },
    failureEvent: {
      groupBy: vi.fn(async (args: { _min?: unknown }) =>
        args._min
          ? [{ signature: "s1", _min: { createdAt: new Date(START.getTime() - 1000) } }, { signature: "s2", _min: { createdAt: at(100) } }]
          : [{ signature: "s1", _count: { _all: 4 } }, { signature: "s2", _count: { _all: 2 } }],
      ),
      findMany: vi.fn(async () => [{ signature: "s1", signatureText: "lock timeout", tool: "cargo", errorCode: null }]),
    },
    lessonResolution: {
      findMany: vi.fn(async () => [
        // s1's lesson was confirmed (at(500)) before this failure (at(100)): "with lesson", 20 min
        { createdAt: at(80), failureEvent: { createdAt: at(100), signature: "s1" } },
        // s2 has no lesson: "without", 60 min (and 100 min for the third row: mean 80)
        { createdAt: at(40), failureEvent: { createdAt: at(100), signature: "s2" } },
        // s1 but failure BEFORE the lesson was confirmed: counts as without
        { createdAt: at(1000), failureEvent: { createdAt: at(1100), signature: "s1" } },
      ]),
    },
    lesson: {
      findMany: vi.fn(async (args: { select: { confirmedAt?: boolean } }) => (args.select.confirmedAt ? [{ signature: "s1", confirmedAt: at(1050) }] : [{ signature: "s1", state: "confirmed" }])),
      groupBy: vi.fn(async () => [{ state: "confirmed", _count: { _all: 3 } }, { state: "systemized", _count: { _all: 1 } }, { state: "draft", _count: { _all: 2 } }]),
    },
  }
}

describe("getFeedbackMetrics", () => {
  it("null for a viewer who curates nothing (the numbers span projects they cannot see)", async () => {
    const db = fakeDb()
    db.projectMember.findMany = vi.fn(async () => [{ projectId: "p1", role: "dev" }])
    expect(await getFeedbackMetrics({ userId: "u1", systemRole: "member" }, NOW, db as never)).toBeNull()
    expect(db.failureEvent.groupBy).not.toHaveBeenCalled()
  })

  it("recurrence rate, time to resolve with / without a lesson, systemized share and the top failures", async () => {
    const m = await getFeedbackMetrics({ userId: "u1", systemRole: "member" }, NOW, fakeDb() as never)
    expect(m).not.toBeNull()
    // s1: 4 reports, first before the window → 4 recurrences; s2: 2 reports, first in window → 1
    expect(m).toMatchObject({ reports: 6, recurrences: 5, distinctSignatures: 2 })
    expect(m?.recurrenceRate).toBeCloseTo(0.833, 3)
    expect(m?.resolveMinutes).toEqual({ withLesson: 20, withoutLesson: 80, withLessonCount: 1, withoutLessonCount: 2 })
    expect(m?.resolutions).toBe(3)
    expect(m?.lessons).toEqual({ draft: 2, confirmed: 3, systemized: 1, retired: 0 })
    expect(m?.systemizedRate).toBe(0.25)
    expect(m?.top[0]).toMatchObject({ signature: "s1", count: 4, lessonState: "confirmed", signatureText: "lock timeout" })
    expect(m?.top[1]).toMatchObject({ signature: "s2", lessonState: null })
    expect(m?.truncated).toBe(false)
  })

  it("no data → null rates, not NaN", async () => {
    const db = fakeDb()
    db.failureEvent.groupBy = vi.fn(async () => [])
    db.lessonResolution.findMany = vi.fn(async () => [])
    db.lesson.groupBy = vi.fn(async () => [])
    const m = await getFeedbackMetrics({ userId: "admin", systemRole: "admin" }, NOW, db as never)
    expect(m).toMatchObject({ reports: 0, recurrenceRate: null, systemizedRate: null, resolveMinutes: { withLesson: null, withoutLesson: null }, top: [] })
  })
})
