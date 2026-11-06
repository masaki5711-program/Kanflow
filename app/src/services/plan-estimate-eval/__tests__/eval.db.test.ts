import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The backtest on real actuals (plan 12 §5 "継続") and the per-lineage approval (§8 item 6) against a REAL PostgreSQL.
 * Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (SYNTHETIC rows only,
 * removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan-estimate-eval/__tests__/eval.db.test.ts
 *
 * Scenario: seven finished projects of one lineage, one a month in 2025, each loaded from the same schedule (build 10
 * days, then test 3 days); build always took 15, test 3. An eighth finished project has no loaded schedule. Project
 * P1 has a PO who is told when the backtest gets worse.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const NOW = new Date("2026-11-06T03:00:00.000Z")

describe.skipIf(!enabled)("backtest on real actuals (KANFLOW_DB_TESTS=1)", () => {
  const tag = `bttest-${Date.now().toString(36)}`
  const lineage = `${tag}-line`
  // A project type of its own: other DB test files create and delete snapshots of the common types at the same time.
  const ptype = `t-${tag}`.slice(0, 40)
  const projects = Array.from({ length: 8 }, (_, i) => `${tag}-p${i + 1}`)
  const po = `${tag}-po`
  const admin = `${tag}-admin`
  const schedule = {
    items: [
      { key: "build", name: "製作", durationDays: 10 },
      { key: "test", name: "試験", durationDays: 3, dependsOn: ["build"] },
    ],
  }

  let prisma: typeof import("@/lib/prisma").prisma
  let evalSvc: typeof import("../eval.service")
  let adminSvc: typeof import("../admin.service")
  let gate: typeof import("@/services/plan-estimate-run/gate")

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    evalSvc = await import("../eval.service")
    adminSvc = await import("../admin.service")
    gate = await import("@/services/plan-estimate-run/gate")
    for (const u of [po, admin]) await prisma.user.create({ data: { id: u, name: u, email: `${u}@example.test`, password: "synthetic", role: u === admin ? "admin" : "member" } })
    for (const p of projects) await prisma.project.create({ data: { id: p, name: `${p}-名前`, projectType: ptype } })
    await prisma.projectMember.create({ data: { projectId: projects[0], userId: po, role: "po" } })
    for (const [i, p] of projects.entries()) {
      const month = String(i + 1).padStart(2, "0")
      const withLoad = i < 7
      const load = withLoad
        ? await prisma.planScheduleLoad.create({ data: { projectId: p, proposalId: `${tag}-load-${i}`, lineage, scheduleHash: "d".repeat(64), content: schedule, startDate: d(`2025-${month}-01`) } })
        : null
      const snap = await prisma.planActualsSnapshot.create({
        data: { projectId: p, projectType: ptype, lineage, scheduleLoadId: load?.id ?? null, closedAt: d(`2025-${month}-20`), firstFinalizedAt: d(`2025-${month}-21`), finalizedAt: d(`2025-${month}-21`), methodVersion: "e1-v1" },
      })
      await prisma.planActualsItem.create({ data: { snapshotId: snap.id, planItemId: `${p}-b`, templateKey: "build", name: "製作", templateDays: 10, plannedDays: 10, actualDays: 15, complete: true } })
      await prisma.planActualsItem.create({ data: { snapshotId: snap.id, planItemId: `${p}-t`, templateKey: "test", name: "試験", templateDays: 3, plannedDays: 3, actualDays: 3, complete: true } })
    }
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.notification.deleteMany({ where: { recipientId: { in: [po, admin] } } })
    await prisma.planEstimateEval.deleteMany({ where: { lineage } })
    await prisma.planEstimateGateApproval.deleteMany({ where: { lineage } })
    await prisma.planActualsSnapshot.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.project.deleteMany({ where: { id: { in: projects } } })
    await prisma.user.deleteMany({ where: { id: { in: [po, admin] } } })
  })

  it("scores every finished project with a loaded schedule, oldest first, and skips the one without", async () => {
    const b = await evalSvc.backtestLineage(lineage)
    expect(b.scored).toBe(7)
    expect(b.skipped).toBe(1)
    expect(b.report.projects.map((p) => p.projectId)).toEqual(projects.slice(0, 7))
    // The first project has nothing before it: its estimate is the template.
    expect(b.report.projects[0].priorObservations).toBe(0)
    expect(b.report.projects[0].mapeEstimate).toBeCloseTo(b.report.projects[0].mapeTemplate, 10)
    // The later ones learned that build takes longer: closer than the template.
    const last = b.report.projects[6]
    expect(last.priorObservations).toBeGreaterThan(0)
    expect(last.mapeEstimate).toBeLessThan(last.mapeTemplate)
  })

  it("records one row per run with the current method; the gate reads it", async () => {
    const r = await evalSvc.recordLineageBacktest(lineage, { now: NOW })
    const row = await gate.latestEval(lineage)
    expect(row).toMatchObject({ n: 7, mape: r.record.mape, mapeTemplate: r.record.mapeTemplate, p80Hit: r.record.p80Hit })
    expect(row?.evaluatedOn.toISOString().slice(0, 10)).toBe("2026-11-06")
    // Not approved: whatever the numbers say, durations from actuals stay off.
    expect((await gate.gateFor(lineage)).on).toBe(false)
  })

  it("tells the PO / SM when it got worse — without numbers — and nobody when it did not", async () => {
    // A previous record that was much better (passing, error ratio 0).
    await prisma.planEstimateEval.create({ data: { lineage, evaluatedOn: d("2026-11-06"), methodVersion: "e2-v1", n: 7, mape: 0, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 0, endErrorTemplateDays: 5 } })
    const worse = await evalSvc.afterActualsChange(projects[0], lineage, null, { now: NOW })
    expect(worse?.worse).toBe(true)
    const notes = await prisma.notification.findMany({ where: { recipientId: po, type: "plan_estimate_worse" } })
    expect(notes).toHaveLength(1)
    expect(notes[0].projectId).toBe(projects[0])
    const payload = JSON.parse(notes[0].payload ?? "{}") as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(["lineage", "lineageName", "reason"])
    // Same result again: not worse than itself, no second notification.
    const again = await evalSvc.afterActualsChange(projects[0], lineage, null, { now: NOW })
    expect(again?.worse).toBe(false)
    expect(await prisma.notification.count({ where: { recipientId: po, type: "plan_estimate_worse" } })).toBe(1)
  })

  it("an administrator approves only the passing record they saw; the gate turns on, withdrawing turns it off", async () => {
    // A newer, failing record first: cannot be approved.
    const failing = await prisma.planEstimateEval.create({ data: { lineage, evaluatedOn: d("2030-01-01"), methodVersion: "e2-v1", n: 2, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 } })
    await expect(adminSvc.approveLineage(lineage, failing.id, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_EVAL_NOT_PASSING" })
    const passing = await prisma.planEstimateEval.create({ data: { lineage, evaluatedOn: d("2030-01-02"), methodVersion: "e2-v1", n: 7, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 } })
    // The record shown is no longer the latest.
    await expect(adminSvc.approveLineage(lineage, failing.id, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_EVAL_CHANGED" })
    expect(await gate.gateFor(lineage)).toEqual({ on: false, reason: "not_approved" })

    await adminSvc.approveLineage(lineage, passing.id, admin)
    expect(await gate.gateFor(lineage)).toEqual({ on: true, reason: null })
    const view = (await adminSvc.listLineageEvals()).lineages.find((l) => l.lineage === lineage)
    expect(view).toMatchObject({ passes: true, on: true, latest: { id: passing.id, n: 7 }, approval: { approvedByName: admin } })

    // An approval of another method version does not count.
    await prisma.planEstimateGateApproval.update({ where: { lineage }, data: { methodVersion: "e2-v0" } })
    expect((await gate.gateFor(lineage)).reason).toBe("not_approved")
    await adminSvc.approveLineage(lineage, passing.id, admin)

    await adminSvc.withdrawLineage(lineage, admin)
    expect(await gate.gateFor(lineage)).toEqual({ on: false, reason: "not_approved" })
    // Idempotent.
    await adminSvc.withdrawLineage(lineage, admin)
  })
})
