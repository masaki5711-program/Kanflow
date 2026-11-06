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
 * P1 has a PO who is told when estimates from actuals are turned off by its change. The tests run in order.
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
  const passingRow = { methodVersion: "e2-v1", n: 7, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 }

  let prisma: typeof import("@/lib/prisma").prisma
  let evalSvc: typeof import("../eval.service")
  let adminSvc: typeof import("../admin.service")
  let gate: typeof import("@/services/plan-estimate-run/gate")
  const view = async () => (await adminSvc.listLineageEvals()).lineages.find((l) => l.lineage === lineage)
  const rows = () => prisma.planEstimateEval.count({ where: { lineage } })

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
      const load =
        i < 7 ? await prisma.planScheduleLoad.create({ data: { projectId: p, proposalId: `${tag}-load-${i}`, lineage, scheduleHash: "d".repeat(64), content: schedule, startDate: d(`2025-${month}-01`) } }) : null
      const snap = await prisma.planActualsSnapshot.create({
        data: { projectId: p, projectType: ptype, lineage, scheduleLoadId: load?.id ?? null, closedAt: d(`2025-${month}-20`), firstFinalizedAt: d(`2025-${month}-21`), finalizedAt: d(`2025-${month}-21`), methodVersion: "e1-v1" },
      })
      await prisma.planActualsItem.create({ data: { snapshotId: snap.id, planItemId: `${p}-b`, templateKey: "build", name: "製作", templateDays: 10, plannedDays: 10, actualDays: 15, complete: true } })
      await prisma.planActualsItem.create({ data: { snapshotId: snap.id, planItemId: `${p}-t`, templateKey: "test", name: "試験", templateDays: 3, plannedDays: 3, actualDays: 3, complete: true } })
    }
  })

  afterAll(async () => {
    if (!prisma) return
    await evalSvc?.settleQueuedBacktests()
    await prisma.notification.deleteMany({ where: { recipientId: { in: [po, admin] } } })
    await prisma.planEstimateGateApproval.deleteMany({ where: { lineage } })
    await prisma.planEstimateEval.deleteMany({ where: { lineage } })
    await prisma.planActualsSnapshot.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.project.deleteMany({ where: { id: { in: projects } } })
    await prisma.user.deleteMany({ where: { id: { in: [po, admin] } } })
  })

  it("scores every finished project with a loaded schedule, oldest first; the one without is a counted skip", async () => {
    const b = await evalSvc.backtestLineage(lineage)
    expect(b.scored).toBe(7)
    expect(b.skips).toEqual([{ projectId: projects[7], reason: "no_loaded_schedule" }])
    expect(b.report.projects.map((p) => p.projectId)).toEqual(projects.slice(0, 7))
    // The first project has nothing before it: its estimate is the template.
    expect(b.report.projects[0].priorObservations).toBe(0)
    expect(b.report.projects[0].mapeEstimate).toBeCloseTo(b.report.projects[0].mapeTemplate, 10)
    // The later ones learned that build takes longer: closer than the template.
    const last = b.report.projects[6]
    expect(last.priorObservations).toBeGreaterThan(0)
    expect(last.mapeEstimate).toBeLessThan(last.mapeTemplate)
  })

  it("records one row of the current snapshots (n, skipped, inputHash)", async () => {
    const r = await evalSvc.recordLineageBacktest(lineage, { now: NOW })
    expect(r.written).toBe(true)
    const row = await gate.latestEval(lineage)
    expect(row).toMatchObject({ n: 7, skipped: 1, mape: r.record.mape, inputHash: await gate.lineageInputHash(lineage) })
    expect(row?.evaluatedOn.toISOString().slice(0, 10)).toBe("2026-11-06")
    // Not approved: durations from actuals stay off whatever the numbers say.
    expect((await gate.gateFor(lineage)).on).toBe(false)
  })

  it("a learning switch after the record makes it outdated until recomputed", async () => {
    await prisma.planActualsSnapshot.updateMany({ where: { projectId: projects[6], supersededAt: null }, data: { version: { increment: 1 } } })
    expect((await view())?.outdated).toBe(true)
    await evalSvc.recordLineageBacktest(lineage, { now: NOW })
    expect((await view())?.outdated).toBe(false)
  })

  it("an admin approves only the passing, current record they saw; history is kept on withdraw and on a new method", async () => {
    const hash = await gate.lineageInputHash(lineage)
    const failing = await prisma.planEstimateEval.create({ data: { ...passingRow, lineage, evaluatedOn: d("2030-01-01"), n: 2, inputHash: hash } })
    await expect(adminSvc.approveLineage(lineage, failing.id, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_EVAL_NOT_PASSING" })
    const passing = await prisma.planEstimateEval.create({ data: { ...passingRow, lineage, evaluatedOn: d("2030-01-02"), inputHash: hash } })
    // The record shown is no longer the latest.
    await expect(adminSvc.approveLineage(lineage, failing.id, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_EVAL_CHANGED" })
    expect(await gate.gateFor(lineage)).toEqual({ on: false, reason: "not_approved" })

    await adminSvc.approveLineage(lineage, passing.id, admin)
    expect(await gate.gateFor(lineage)).toEqual({ on: true, reason: null })
    expect(await view()).toMatchObject({ passes: true, on: true, outdated: false, latest: { id: passing.id, n: 7 }, approval: { approvedByName: admin } })
    // Approving again is a no-op.
    await adminSvc.approveLineage(lineage, passing.id, admin)
    expect(await prisma.planEstimateGateApproval.count({ where: { lineage } })).toBe(1)

    // An approval of another method version does not count; approving again replaces it (kept as history).
    await prisma.planEstimateGateApproval.updateMany({ where: { lineage, endedAt: null }, data: { methodVersion: "e2-v0" } })
    expect((await gate.gateFor(lineage)).reason).toBe("not_approved")
    await adminSvc.approveLineage(lineage, passing.id, admin)
    expect(await gate.gateFor(lineage)).toEqual({ on: true, reason: null })

    await adminSvc.withdrawLineage(lineage, admin)
    expect(await gate.gateFor(lineage)).toEqual({ on: false, reason: "not_approved" })
    expect((await view())?.lastEnded?.reason).toBe("withdrawn")
    await adminSvc.withdrawLineage(lineage, admin) // idempotent
    const history = await prisma.planEstimateGateApproval.findMany({ where: { lineage }, orderBy: { approvedAt: "asc" }, select: { endReason: true, endedById: true } })
    expect(history).toEqual([
      { endReason: "method", endedById: admin },
      { endReason: "withdrawn", endedById: admin },
    ])

    // A snapshot change makes the approved record outdated: it cannot be approved, and the gate fails closed.
    await adminSvc.approveLineage(lineage, passing.id, admin)
    await prisma.planActualsSnapshot.updateMany({ where: { projectId: projects[6], supersededAt: null }, data: { version: { increment: 1 } } })
    expect(await gate.gateFor(lineage)).toEqual({ on: false, reason: "backtest_outdated" })
    await prisma.planEstimateGateApproval.updateMany({ where: { lineage, endedAt: null }, data: { endedAt: new Date(), endReason: "withdrawn" } })
    await expect(adminSvc.approveLineage(lineage, passing.id, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_EVAL_CHANGED" })
  })

  it("a backtest that stops passing ends the approval and tells the changed project's PO / SM — no numbers, no reason", async () => {
    const passing = await prisma.planEstimateEval.create({ data: { ...passingRow, lineage, evaluatedOn: d("2030-02-01"), inputHash: await gate.lineageInputHash(lineage) } })
    await adminSvc.approveLineage(lineage, passing.id, admin)
    // Three projects leave learning: four remain, below the five the gate needs.
    await prisma.planActualsSnapshot.updateMany({ where: { projectId: { in: projects.slice(0, 3) }, supersededAt: null }, data: { includeInLearning: false } })
    const r = await evalSvc.afterActualsChange(lineage, new Map([[projects[0], null]]), { now: new Date("2031-01-01T03:00:00.000Z") })
    expect(r).toMatchObject({ written: true, approvalEnded: true, gate: { on: false, reason: "not_enough_actuals" } })
    expect((await view())?.lastEnded?.reason).toBe("failed")
    const notes = await prisma.notification.findMany({ where: { recipientId: po, type: "plan_estimate_worse" } })
    expect(notes).toHaveLength(1)
    expect(notes[0].projectId).toBe(projects[0])
    expect(JSON.parse(notes[0].payload ?? "{}")).toEqual({ lineageName: null })
    // Nothing more to end: no second notification.
    const again = await evalSvc.afterActualsChange(lineage, new Map([[projects[0], null]]), { now: new Date("2031-01-01T04:00:00.000Z") })
    expect(again?.approvalEnded).toBe(false)
    expect(await prisma.notification.count({ where: { recipientId: po, type: "plan_estimate_worse" } })).toBe(1)
  })

  it("queued changes of one lineage are coalesced into one run, after the response", async () => {
    await prisma.planActualsSnapshot.updateMany({ where: { projectId: { in: projects.slice(0, 3) } }, data: { includeInLearning: true } })
    const before = await rows()
    evalSvc.enqueueAfterActualsChange(projects[0], lineage, null)
    evalSvc.enqueueAfterActualsChange(projects[1], lineage, null)
    await evalSvc.settleQueuedBacktests()
    expect(await rows()).toBe(before + 1)
    // The newest row is of the current snapshots (the rows seeded above are dated later, so `view` shows those).
    const newest = await prisma.planEstimateEval.findFirst({ where: { lineage }, orderBy: { createdAt: "desc" }, select: { inputHash: true } })
    expect(newest?.inputHash).toBe(await gate.lineageInputHash(lineage))
  })
})
