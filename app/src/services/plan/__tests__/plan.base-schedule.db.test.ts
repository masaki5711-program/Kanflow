import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * POST /plan/load (W12 + plan 12 E0) against a REAL PostgreSQL (the rest of the suite mocks Prisma). Skipped
 * unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (synthetic rows only,
 * removed afterwards), e.g. the container of ops/test-env/compose.yml:
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan/__tests__/plan.base-schedule.db.test.ts
 *
 * What it pins (the things mocks cannot show): every created row carries its template key, the load record and
 * a baseline equal to the planned dates AFTER the parents' spans were derived (only when the project had no baseline
 * yet; an existing baseline is kept and the new rows get none); a failure part-way leaves no rows and no load record;
 * two concurrent approvals of one proposal load exactly once (unique load record).
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

const fault = vi.hoisted(() => ({ failRecalc: false }))
vi.mock("@/lib/plan-progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")
  return {
    ...actual,
    recalcPlanProgress: async (...args: Parameters<typeof actual.recalcPlanProgress>) => {
      if (fault.failRecalc) throw new Error("synthetic failure after the rows were inserted")
      return actual.recalcPlanProgress(...args)
    },
  }
})

const SCHEDULE = {
  items: [
    { key: "spec", name: "仕様", role: "engineering", children: [{ key: "req", name: "要求", durationDays: 5, load: 0.5 }, { key: "rfq", name: "見積", durationDays: 3, dependsOn: ["req"], formerKeys: ["quote"] }] },
    { key: "accept", name: "検収", durationDays: 1, milestone: true, dependsOn: ["rfq"] },
  ],
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

describe.skipIf(!enabled)("plan load on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `e0test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, po: `${tag}-po` }
  const actor = { userId: ids.po, userName: "PO", systemRole: "member" }

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../plan.base-schedule")

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../plan.base-schedule")
    await prisma.user.create({ data: { id: ids.po, name: ids.po, email: `${ids.po}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: ids.project, name: tag } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.planItem.deleteMany({ where: { projectId: ids.project } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: ids.project } })
    await prisma.activityLog.deleteMany({ where: { projectId: ids.project } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
    await prisma.user.deleteMany({ where: { id: ids.po } })
  })

  it("stores the template key, the load record and baseline = planned on every row (parents included)", async () => {
    const out = await svc.loadBaseSchedule(ids.project, { startDate: "2026-11-02", schedule: SCHEDULE, proposalId: `${tag}-a`, sourceRef: "gitstation:equipment-spec@v1.2.0:schedule.yml" }, actor)
    expect(out.createdCount).toBe(4)
    const loads = await prisma.planScheduleLoad.findMany({ where: { projectId: ids.project } })
    expect(loads).toHaveLength(1)
    const load = loads[0]
    expect(load).toMatchObject({ proposalId: `${tag}-a`, sourceRef: "gitstation:equipment-spec@v1.2.0:schedule.yml", lineage: "gitstation:equipment-spec:schedule.yml", skipWeekends: false, loadedById: ids.po, estimateRunId: null })
    expect(load.scheduleHash).toMatch(/^[0-9a-f]{64}$/)
    expect(day(load.startDate)).toBe("2026-11-02")
    expect(load.content).toEqual(SCHEDULE)

    const rows = await prisma.planItem.findMany({ where: { projectId: ids.project }, orderBy: { createdAt: "asc" } })
    expect(rows.map((r) => r.templateKey).sort()).toEqual(["accept", "req", "rfq", "spec"])
    for (const r of rows) {
      expect(r.scheduleLoadId).toBe(load.id)
      expect(r.plannedStart).not.toBeNull()
      expect([day(r.baselineStart), day(r.baselineEnd)]).toEqual([day(r.plannedStart), day(r.plannedEnd)])
    }
    const spec = rows.find((r) => r.templateKey === "spec")
    expect([day(spec?.plannedStart ?? null), day(spec?.plannedEnd ?? null)]).toEqual(["2026-11-02", "2026-11-09"]) // derived parent span
  })

  it("a failure part-way leaves no rows and no load record (one transaction)", async () => {
    const rowsBefore = await prisma.planItem.count({ where: { projectId: ids.project } })
    const loadsBefore = await prisma.planScheduleLoad.count({ where: { projectId: ids.project } })
    fault.failRecalc = true
    try {
      await expect(svc.loadBaseSchedule(ids.project, { startDate: "2026-11-02", schedule: SCHEDULE, proposalId: `${tag}-b` }, actor)).rejects.toThrow(/synthetic failure/)
    } finally {
      fault.failRecalc = false
    }
    expect(await prisma.planItem.count({ where: { projectId: ids.project } })).toBe(rowsBefore)
    expect(await prisma.planScheduleLoad.count({ where: { projectId: ids.project } })).toBe(loadsBefore)
    expect(await prisma.activityLog.count({ where: { projectId: ids.project, entityId: `${tag}-b` } })).toBe(0) // the marker rolled back too
  })

  it("two concurrent approvals of one proposal load exactly once; the other is 409 PLAN_ALREADY_LOADED", async () => {
    const before = await prisma.planItem.count({ where: { projectId: ids.project } })
    const results = await Promise.allSettled([1, 2].map(() => svc.loadBaseSchedule(ids.project, { startDate: "2026-11-02", schedule: SCHEDULE, proposalId: `${tag}-c` }, actor)))
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason.code ?? rejected[0].reason.errorCode).toBe("PLAN_ALREADY_LOADED")
    expect(await prisma.planScheduleLoad.count({ where: { projectId: ids.project, proposalId: `${tag}-c` } })).toBe(1)
    expect(await prisma.planItem.count({ where: { projectId: ids.project } })).toBe(before + 4)
  })

  it("a project that already has a baseline keeps it: the loaded rows get no baseline", async () => {
    const other = `${tag}-p2`
    await prisma.project.create({ data: { id: other, name: `${tag} frozen` } })
    try {
      const frozenStart = new Date("2026-10-01T00:00:00.000Z")
      const frozenEnd = new Date("2026-10-10T00:00:00.000Z")
      const existing = await prisma.planItem.create({
        data: { projectId: other, name: "existing", plannedStart: frozenStart, plannedEnd: frozenEnd, baselineStart: frozenStart, baselineEnd: frozenEnd },
      })
      const out = await svc.loadBaseSchedule(other, { startDate: "2026-11-02", schedule: SCHEDULE }, actor)
      expect(out.baselineSet).toBe(false)
      const loaded = await prisma.planItem.findMany({ where: { projectId: other, id: { not: existing.id } } })
      expect(loaded).toHaveLength(4)
      for (const r of loaded) expect([r.baselineStart, r.baselineEnd]).toEqual([null, null])
      const kept = await prisma.planItem.findUniqueOrThrow({ where: { id: existing.id } })
      expect([day(kept.baselineStart), day(kept.baselineEnd)]).toEqual(["2026-10-01", "2026-10-10"])
    } finally {
      await prisma.planItem.deleteMany({ where: { projectId: other } })
      await prisma.planScheduleLoad.deleteMany({ where: { projectId: other } })
      await prisma.activityLog.deleteMany({ where: { projectId: other } })
      await prisma.project.deleteMany({ where: { id: other } })
    }
  })
})
