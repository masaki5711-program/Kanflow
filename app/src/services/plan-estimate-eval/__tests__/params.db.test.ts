import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The parameter search's proposals, their approval by an administrator, and the automatic fall back to the defaults,
 * against a REAL PostgreSQL. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test
 * database (SYNTHETIC rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan-estimate-eval/__tests__/params.db.test.ts
 *
 * Scenario: nine finished projects of one lineage, one a month in 2025, each loaded from the same schedule (design 10,
 * build 20, test 5 days); every leaf took 1.6 × its template — a lineage where a non-default setting clearly wins. The
 * tests run in order.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const NOW = new Date("2026-11-10T03:00:00.000Z")

describe.skipIf(!enabled)("estimator settings proposals (KANFLOW_DB_TESTS=1)", () => {
  const tag = `pstest-${Date.now().toString(36)}`
  const lineage = `${tag}-line`
  const ptype = `t-${tag}`.slice(0, 40)
  const projects = Array.from({ length: 9 }, (_, i) => `${tag}-p${i + 1}`)
  const admin = `${tag}-admin`
  const schedule = {
    items: [
      { key: "a", name: "設計", durationDays: 10 },
      { key: "b", name: "製作", durationDays: 20, dependsOn: ["a"] },
      { key: "c", name: "試験", durationDays: 5, dependsOn: ["b"] },
    ],
  }

  let prisma: typeof import("@/lib/prisma").prisma
  let evalSvc: typeof import("../eval.service")
  let adminSvc: typeof import("../admin.service")
  let svc: typeof import("../params.service")
  let gate: typeof import("@/services/plan-estimate-run/gate")
  const view = async () => (await adminSvc.listLineageEvals()).lineages.find((l) => l.lineage === lineage)
  const latestProposal = () => prisma.planEstimateParamProposal.findFirst({ where: { lineage }, orderBy: { createdAt: "desc" } })

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    evalSvc = await import("../eval.service")
    adminSvc = await import("../admin.service")
    svc = await import("../params.service")
    gate = await import("@/services/plan-estimate-run/gate")
    await prisma.user.create({ data: { id: admin, name: admin, email: `${admin}@example.test`, password: "synthetic", role: "admin" } })
    for (const [i, p] of projects.entries()) {
      const month = String(i + 1).padStart(2, "0")
      await prisma.project.create({ data: { id: p, name: `${p}-名前`, projectType: ptype } })
      const load = await prisma.planScheduleLoad.create({ data: { projectId: p, proposalId: `${tag}-load-${i}`, lineage, scheduleHash: "e".repeat(64), content: schedule, startDate: d(`2025-${month}-01`) } })
      const snap = await prisma.planActualsSnapshot.create({
        data: { projectId: p, projectType: ptype, lineage, scheduleLoadId: load.id, closedAt: d(`2025-${month}-20`), firstFinalizedAt: d(`2025-${month}-21`), finalizedAt: d(`2025-${month}-21`), methodVersion: "e1-v1" },
      })
      for (const [key, name, days] of [["a", "設計", 10], ["b", "製作", 20], ["c", "試験", 5]] as const) {
        await prisma.planActualsItem.create({ data: { snapshotId: snap.id, planItemId: `${p}-${key}`, templateKey: key, name, templateDays: days, plannedDays: days, actualDays: Math.round(days * 1.6), complete: true } })
      }
    }
  })

  afterAll(async () => {
    if (!prisma) return
    await evalSvc?.settleQueuedBacktests()
    await prisma.planEstimateGateApproval.deleteMany({ where: { lineage } })
    await prisma.planEstimateEval.deleteMany({ where: { lineage } })
    await prisma.planEstimateParamApproval.deleteMany({ where: { lineage } })
    await prisma.planEstimateParamProposal.deleteMany({ where: { lineage } })
    await prisma.planActualsSnapshot.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.project.deleteMany({ where: { id: { in: projects } } })
    await prisma.user.deleteMany({ where: { id: admin } })
  })

  it("a search records a proposal with the metrics before / after — lineage aggregates only, no project ids", async () => {
    const r = await svc.searchLineageParams(lineage, { now: NOW })
    expect(r).toMatchObject({ written: true, outcome: "propose", reason: null })
    const row = await latestProposal()
    expect(row).toMatchObject({ lineage, outcome: "propose", decision: null, candidates: 81, evaluated: 81, timedOut: false, inputHash: await gate.lineageInputHash(lineage) })
    expect(JSON.stringify(row?.metrics)).not.toContain(tag)
    const v = await view()
    expect(v?.params.latest).toMatchObject({ outcome: "propose", outdated: false, decision: null })
    expect(v?.params.latest?.after?.full.n).toBe(9)
    expect(v?.params.latest?.before?.holdout.projects).toBe(3)
    expect(v?.params.active).toBeNull()
    // Nothing changed for the estimates: no approved settings, the gate reads no settings.
    expect((await gate.gateWithParams(lineage)).params).toBeNull()
  })

  it("the same data searched again gives the same proposal; the older pending one is superseded", async () => {
    const first = await latestProposal()
    await svc.searchLineageParams(lineage, { now: new Date(NOW.getTime() + 1000) })
    const second = await latestProposal()
    expect(second?.id).not.toBe(first?.id)
    expect(second?.params).toEqual(first?.params)
    expect(second?.metrics).toEqual(first?.metrics)
    expect((await prisma.planEstimateParamProposal.findUnique({ where: { id: first?.id as string } }))?.decision).toBe("superseded")
    // A superseded proposal cannot be approved (not the latest) nor rejected (decided).
    await expect(svc.approveParams(lineage, first?.id as string, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_PARAMS_CHANGED" })
    await expect(svc.rejectParams(lineage, first?.id as string, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_PARAMS_DECIDED" })
    await expect(svc.rejectParams(lineage, "nope", admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_PARAMS_NOT_FOUND" })
  })

  it("a proposal of older snapshots cannot be approved", async () => {
    await prisma.planActualsSnapshot.updateMany({ where: { projectId: projects[8], supersededAt: null }, data: { version: { increment: 1 } } })
    const stale = await latestProposal()
    expect((await view())?.params.latest?.outdated).toBe(true)
    await expect(svc.approveParams(lineage, stale?.id as string, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_PARAMS_CHANGED" })
    await svc.searchLineageParams(lineage, { now: NOW })
  })

  it("approving makes the settings the lineage's, records their backtest as current, and the run reads them", async () => {
    const p = await latestProposal()
    await svc.approveParams(lineage, p?.id as string, admin)
    const active = await gate.activeParamApproval(lineage)
    expect(active?.params).toEqual(p?.params)
    const rec = await gate.latestEval(lineage)
    expect(rec).toMatchObject({ paramApprovalId: active?.id, inputHash: await gate.lineageInputHash(lineage), n: 9 })
    expect((await latestProposal())?.decision).toBe("approved")
    // The gate is still the administrator's separate decision; once on, a run uses the approved settings.
    expect((await gate.gateFor(lineage)).reason).toBe("not_approved")
    await adminSvc.approveLineage(lineage, rec?.id as string, admin)
    const g = await gate.gateWithParams(lineage)
    expect(g.gate).toEqual({ on: true, reason: null })
    expect(g.params?.params).toEqual(p?.params)
    expect((await view())?.params.active).toMatchObject({ params: p?.params, approvedByName: admin })
    // Approving twice: already decided.
    await expect(svc.approveParams(lineage, p?.id as string, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_PARAMS_DECIDED" })
  })

  it("the backtest runs with the approved settings and stays current", async () => {
    const r = await evalSvc.recordLineageBacktest(lineage, { now: NOW })
    expect(r).toMatchObject({ written: true, paramsEnded: null, gate: { on: true } })
    expect((await gate.latestEval(lineage))?.paramApprovalId).toBe((await gate.activeParamApproval(lineage))?.id)
    expect((await gate.gateFor(lineage)).on).toBe(true)
  })

  it("returning to the defaults ends the settings (history kept); the gate fails closed until the queued recompute", async () => {
    await svc.revertParams(lineage, admin)
    expect(await gate.activeParamApproval(lineage)).toBeNull()
    expect(await gate.gateFor(lineage)).toEqual({ on: false, reason: "backtest_outdated" })
    await evalSvc.settleQueuedBacktests()
    expect((await gate.latestEval(lineage))?.paramApprovalId).toBeNull()
    expect(await gate.gateFor(lineage)).toEqual({ on: true, reason: null })
    expect((await view())?.params.lastEnded?.reason).toBe("withdrawn")
    await svc.revertParams(lineage, admin) // idempotent
  })

  it("a rejected proposal is kept as history and cannot be approved", async () => {
    await svc.searchLineageParams(lineage, { now: NOW })
    const p = await latestProposal()
    await svc.rejectParams(lineage, p?.id as string, admin)
    expect(await prisma.planEstimateParamProposal.findUnique({ where: { id: p?.id as string }, select: { decision: true, decidedById: true } })).toEqual({ decision: "rejected", decidedById: admin })
    await expect(svc.approveParams(lineage, p?.id as string, admin)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_PARAMS_DECIDED" })
  })

  it("settings of an older method end at the next backtest (method)", async () => {
    await svc.searchLineageParams(lineage, { now: NOW })
    await svc.approveParams(lineage, (await latestProposal())?.id as string, admin)
    await prisma.planEstimateParamApproval.updateMany({ where: { lineage, endedAt: null }, data: { methodVersion: "e2-v0" } })
    expect((await gate.gateWithParams(lineage)).params).toBeNull()
    const r = await evalSvc.recordLineageBacktest(lineage, { now: NOW })
    expect(r.paramsEnded).toBe("method")
    expect(await prisma.planEstimateParamApproval.findFirst({ where: { lineage }, orderBy: { approvedAt: "desc" }, select: { endReason: true } })).toEqual({ endReason: "method" })
  })

  it("a later backtest that fails with the approved settings falls back to the defaults automatically", async () => {
    await svc.searchLineageParams(lineage, { now: NOW })
    await svc.approveParams(lineage, (await latestProposal())?.id as string, admin)
    // Five projects leave learning: four remain, below the five the gate needs.
    await prisma.planActualsSnapshot.updateMany({ where: { projectId: { in: projects.slice(0, 5) }, supersededAt: null }, data: { includeInLearning: false } })
    const r = await evalSvc.recordLineageBacktest(lineage, { now: new Date("2031-01-01T03:00:00.000Z") })
    expect(r).toMatchObject({ written: true, paramsEnded: "failed", gate: { on: false, reason: "not_enough_actuals" } })
    expect(await gate.activeParamApproval(lineage)).toBeNull()
    // The row recorded is the defaults' (the settings in use now).
    expect((await gate.latestEval(lineage))?.paramApprovalId).toBeNull()
    expect((await view())?.params.lastEnded?.reason).toBe("failed")
    const history = await prisma.planEstimateParamApproval.findMany({ where: { lineage }, orderBy: { approvedAt: "asc" }, select: { endReason: true } })
    expect(history.map((h) => h.endReason)).toEqual(["withdrawn", "method", "failed"])
  })

  it("with too few finished projects the search proposes nothing and says why", async () => {
    const run = svc.enqueueParamSearch([lineage, lineage], { now: NOW })
    expect(svc.searchingLineages()).toContain(lineage)
    const out = await run
    expect(out.searched).toEqual([{ lineage, written: true, outcome: "keep_default", reason: "not_enough_actuals" }])
    expect(out.failed).toEqual([])
    expect(svc.searchingLineages()).not.toContain(lineage)
    expect((await view())?.params.latest).toMatchObject({ outcome: "keep_default", reason: "not_enough_actuals", before: null, after: null })
  })
})
