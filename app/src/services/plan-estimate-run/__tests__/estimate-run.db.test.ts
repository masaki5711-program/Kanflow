import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * 計画を作る (plan 12 E5) against a REAL PostgreSQL. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a
 * migrated, disposable test database (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan-estimate-run/__tests__/estimate-run.db.test.ts
 *
 * Scenario: target project A (PO u1, dev u2). Seven finished source projects of the same lineage, each with a "build"
 * leaf planned 10 days that took longer: S1–S3 are visible to the PO (member), S4–S7 are not (hidden sources). u2
 * cannot view any source. The lineage's backtest passes, so durations come from actuals.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const NOW = new Date("2026-11-04T03:00:00.000Z")

describe.skipIf(!enabled)("estimate runs on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `e5test-${Date.now().toString(36)}`
  const lineage = `${tag}-line`
  // A project type of its own: runs also read every snapshot of the type, and other DB test files create and delete
  // "software" snapshots at the same time.
  const ptype = `t-${tag}`.slice(0, 40)
  const ids = {
    a: `${tag}-a`,
    b: `${tag}-b`,
    u1: `${tag}-u1`,
    u2: `${tag}-u2`,
    sources: Array.from({ length: 7 }, (_, i) => `${tag}-s${i + 1}`),
  }
  const po = { userId: ids.u1, userName: "PO", systemRole: "member" }
  const schedule = {
    items: [
      { key: "build", name: "製作", durationDays: 10, role: "dev" },
      { key: "test", name: "試験", durationDays: 3, role: "dev", dependsOn: ["build"] },
    ],
  }
  const input = (over: Partial<{ lineage: string; roleAssignments: Record<string, string[]> }> = {}) => ({
    startDate: "2026-11-09",
    skipWeekends: true,
    roleAssignments: over.roleAssignments ?? { dev: [ids.u2] },
    source: { kind: "schedule" as const, schedule, lineage: over.lineage ?? lineage },
  })
  const VML = { canViewMemberLoad: true }
  const reader = (userId: string, canViewMemberLoad: boolean) => ({ userId, systemRole: "member", canViewMemberLoad })

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../estimate-run.service")
  const itemOf = new Map<string, string>()

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../estimate-run.service")
    for (const u of [ids.u1, ids.u2]) await prisma.user.create({ data: { id: u, name: u, email: `${u}@example.test`, password: "synthetic" } })
    for (const p of [ids.a, ids.b, ...ids.sources]) await prisma.project.create({ data: { id: p, name: `${p}-名前`, projectType: ptype } })
    await prisma.projectMember.create({ data: { projectId: ids.a, userId: ids.u1, role: "po" } })
    await prisma.projectMember.create({ data: { projectId: ids.a, userId: ids.u2, role: "dev" } })
    await prisma.projectMember.create({ data: { projectId: ids.b, userId: ids.u1, role: "po" } })
    for (const s of ids.sources.slice(0, 3)) await prisma.projectMember.create({ data: { projectId: s, userId: ids.u1, role: "dev" } })
    // Finished projects: build planned 7, took 11 (visible: ratio 1.571…) / planned 10, took 20 (hidden).
    for (const [i, s] of ids.sources.entries()) {
      const snap = await prisma.planActualsSnapshot.create({
        data: { projectId: s, projectType: ptype, lineage, closedAt: d(`2026-0${(i % 5) + 3}-15`), firstFinalizedAt: d(`2026-0${(i % 5) + 3}-16`), finalizedAt: d(`2026-0${(i % 5) + 3}-16`), methodVersion: "e1-v1" },
      })
      const item = await prisma.planActualsItem.create({
        data: { snapshotId: snap.id, planItemId: `${s}-pi`, templateKey: "build", name: "製作", role: "dev", templateDays: 10, plannedDays: i < 3 ? 7 : 10, actualDays: i < 3 ? 11 : 20, complete: true, ownerId: ids.u2, ownerConcurrentAvg: 1, ownerConcurrentPeak: 1 },
      })
      itemOf.set(s, item.id)
    }
    // A and B loaded this lineage before (a free lineage name is accepted only for a family the project already uses).
    for (const p of [ids.a, ids.b]) await prisma.planScheduleLoad.create({ data: { projectId: p, proposalId: `${tag}-prior-${p}`, lineage, scheduleHash: "c".repeat(64), content: schedule, startDate: d("2026-01-05") } })
    // The lineage's backtest passes: the estimate is on.
    await prisma.planEstimateEval.create({ data: { lineage, evaluatedOn: d("2026-10-01"), methodVersion: "e2-v1", n: 7, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 } })
  })

  afterAll(async () => {
    if (!prisma) return
    const projects = [ids.a, ids.b, ...ids.sources]
    await prisma.planEstimateHiddenState.deleteMany({ where: { unitKey: { contains: tag } } })
    await prisma.planEstimateEval.deleteMany({ where: { lineage } })
    await prisma.planEstimateRun.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.planItemDependency.deleteMany({ where: { projectId: { in: projects } } }).catch(() => undefined)
    await prisma.planItem.deleteMany({ where: { projectId: { in: projects }, parentId: { not: null } } })
    await prisma.planItem.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.memberCapacityAudit.deleteMany({ where: { userId: { in: [ids.u1, ids.u2] } } })
    await prisma.memberCapacity.deleteMany({ where: { userId: { in: [ids.u1, ids.u2] } } })
    await prisma.activityLog.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.planActualsSnapshot.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.project.deleteMany({ where: { id: { in: projects } } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.u1, ids.u2] } } })
  })

  it("creates a run: durations from actuals, levelled, stored with a 24 h lifetime; the card has no per-person data", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    expect(run.summary.gateOn).toBe(true)
    expect(run.summary.changes[0]).toMatchObject({ key: "build", templateDays: 10 })
    expect(run.summary.changes[0].days).toBeGreaterThan(10)
    expect(new Date(run.expiresAt).getTime() - NOW.getTime()).toBe(24 * 3_600_000)
    expect(JSON.stringify(run.summary)).not.toContain(ids.u2)
    const stored = await prisma.planEstimateRun.findUniqueOrThrow({ where: { id: run.runId } })
    // proposal_contains_only_template_or_rule_items: no rule applies here, so exactly the template's keys.
    const keys = (stored.schedule as { items: { key: string }[] }).items.map((i) => i.key)
    expect(keys).toEqual(["build", "test"])
  })

  it("gate_off_lineage_shows_template_with_reason: no passing backtest → the template's days, the reason, levelling still applies", async () => {
    // No lineage given: the derived one (schedule:<hash>) has no backtest record.
    const { lineage: _l, ...noLineage } = input().source
    void _l
    const run = await svc.createRun(ids.a, { ...input(), source: noLineage }, po, NOW)
    expect(run.summary).toMatchObject({ gateOn: false, gateReason: "no_backtest", changes: [], matchedProjects: null })
    const card = await svc.readRunCard(ids.a, run.runId, reader(ids.u1, true), NOW)
    expect(card.ownerPlan?.owners).toEqual({ build: ids.u2, test: ids.u2 })
  })

  it("same_proposal_loads_once; owners come from the run, removedOwnerKeys only clears them (card_cannot_add_owners)", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    await expect(svc.loadEstimateRun(ids.a, run.runId, ["nope"], po, VML, NOW)).rejects.toMatchObject({ code: "VALIDATION" })
    const out = await svc.loadEstimateRun(ids.a, run.runId, ["test"], po, VML, NOW)
    expect(out.createdCount).toBe(2)
    const rows = await prisma.planItem.findMany({ where: { projectId: ids.a, deletedAt: null }, select: { templateKey: true, ownerId: true, durationDays: true, scheduleLoad: { select: { estimateRunId: true } } } })
    const byKey = Object.fromEntries(rows.map((r) => [r.templateKey, r]))
    expect(byKey.build.ownerId).toBe(ids.u2)
    expect(byKey.test.ownerId).toBeNull()
    expect(byKey.build.durationDays).toBeGreaterThan(10)
    expect(byKey.build.scheduleLoad?.estimateRunId).toBe(run.runId)
    await expect(svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)).rejects.toMatchObject({ code: "PLAN_ALREADY_LOADED" })
    await prisma.planItemDependency.deleteMany({ where: { projectId: ids.a } }).catch(() => undefined)
    await prisma.planItem.deleteMany({ where: { projectId: ids.a } })
  })

  it("stale_after_run_lifetime", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    await expect(svc.loadEstimateRun(ids.a, run.runId, [], po, VML, new Date(NOW.getTime() + 24 * 3_600_000 + 1))).rejects.toMatchObject({ code: "PLAN_ESTIMATE_STALE", extra: { reason: "expired" } })
  })

  it("approval_recomputes_and_refuses_stale_plan / stale_when_input_hash_changes: a capacity row, new actuals", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    // A capacity row of an assigned person is part of the inputs.
    const cap = await prisma.memberCapacity.create({ data: { userId: ids.u2, from: d("2026-11-01"), fte: 0.5 } })
    await expect(svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_STALE", extra: { reason: "input_changed" } })
    expect(await prisma.planItem.count({ where: { projectId: ids.a } })).toBe(0)
    await prisma.memberCapacity.delete({ where: { id: cap.id } })
    // Removing it again makes the inputs equal: the same run loads.
    const again = await svc.createRun(ids.a, input(), po, NOW)
    // A newly finalized project of the lineage changes the snapshot set.
    const extra = await prisma.project.create({ data: { id: `${tag}-s8`, name: "s8" } })
    const snap = await prisma.planActualsSnapshot.create({ data: { projectId: extra.id, projectType: ptype, lineage, closedAt: d("2026-08-01"), firstFinalizedAt: d("2026-08-02"), methodVersion: "e1-v1" } })
    await prisma.planActualsItem.create({ data: { snapshotId: snap.id, planItemId: "s8-pi", templateKey: "build", name: "製作", templateDays: 10, plannedDays: 10, actualDays: 12, complete: true } })
    await expect(svc.loadEstimateRun(ids.a, again.runId, [], po, VML, NOW)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_STALE", extra: { reason: "input_changed" } })
    await prisma.planActualsSnapshot.delete({ where: { id: snap.id } })
    await prisma.project.delete({ where: { id: extra.id } })
  })

  it("approval does not go stale because ANOTHER run published hidden-source state", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    await svc.createRun(ids.b, { ...input(), roleAssignments: {} }, po, NOW)
    const out = await svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)
    expect(out.createdCount).toBe(2)
    await prisma.planItemDependency.deleteMany({ where: { projectId: ids.a } }).catch(() => undefined)
    await prisma.planItem.deleteMany({ where: { projectId: ids.a } })
  })

  it("run_of_another_project_is_refused / load_with_run_of_another_project_is_refused: 404, same as a missing run", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    for (const p of [svc.readRunCard(ids.b, run.runId, reader(ids.u1, true), NOW), svc.readRunEvidence(ids.b, run.runId, reader(ids.u1, true)), svc.recordFeedback(ids.b, run.runId, { key: "build", kind: "too_high" }, ids.u1), svc.loadEstimateRun(ids.b, run.runId, [], po, VML, NOW)]) {
      await expect(p).rejects.toMatchObject({ code: "PLAN_ESTIMATE_RUN_NOT_FOUND" })
    }
    await expect(svc.readRunCard(ids.a, "missing-run", reader(ids.u1, true), NOW)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_RUN_NOT_FOUND" })
  })

  it("per_person_parts_need_view_member_load", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    expect((await svc.readRunCard(ids.a, run.runId, reader(ids.u1, false), NOW)).ownerPlan).toBeUndefined()
    expect((await svc.readRunCard(ids.a, run.runId, reader(ids.u1, true), NOW)).ownerPlan?.owners.build).toBe(ids.u2)
  })

  it("evidence_names_resolved_with_reader_permissions; hidden_source_ratio_never_shown; shown_ratios_rounded_to_0_1; evidence_shows_roles_not_owner_ids", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    const forPo = (await svc.readRunEvidence(ids.a, run.runId, reader(ids.u1, false))).leaves.find((l) => l.key === "build")
    // The PO sees S1–S3 by name; S4–S7 only as "other projects (band)".
    expect(forPo?.estimate?.sources.map((s) => s.projectName).sort()).toEqual(ids.sources.slice(0, 3).map((s) => `${s}-名前`))
    expect(forPo?.estimate?.otherProjects).toBe("4-9")
    // shown_ratios_rounded_to_0_1: 11 / 7 = 1.571… is shown as 1.6.
    expect(forPo?.estimate?.sources.map((s) => s.ratio)).toEqual([1.6, 1.6, 1.6])
    // 3 visible sources < 4 with other projects in it: no ratio for this reader.
    expect(forPo?.estimate?.r50).toBeNull()
    // u2 views no source project: no names at all, everything folded, the same days.
    const forDev = (await svc.readRunEvidence(ids.a, run.runId, reader(ids.u2, false))).leaves.find((l) => l.key === "build")
    // u2 cannot view S1–S3, which the run counted as visible (every PO / SM can): the item's numbers are not shown to
    // u2 at all — its days would give the ratio back (security review H1).
    expect(forDev).toMatchObject({ estimate: null, limited: true, reduced: false })
    // The card leaves the item out of its change list for u2, and says how many it withheld.
    const devCard = await svc.readRunCard(ids.a, run.runId, reader(ids.u2, false), NOW)
    expect(devCard.summary.changes.map((c) => c.key)).not.toContain("build")
    expect(devCard.changesWithheld).toBeGreaterThan(0)
    expect((await svc.readRunCard(ids.a, run.runId, reader(ids.u1, false), NOW)).summary.changes.map((c) => c.key)).toContain("build")
    expect(forDev?.role).toBe("dev")
    const json = JSON.stringify(forDev) + JSON.stringify(forPo)
    for (const s of ids.sources.slice(3)) expect(json).not.toContain(s)
    expect(json).not.toContain(ids.u2)
  })

  it("newly_confidential_source_hides_leaf_ratio_and_makes_run_stale; stored_evidence_refiltered_at_read_time", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    // S1's actuals stop being learnable (excluded from learning) after the run was made.
    await prisma.planActualsSnapshot.updateMany({ where: { projectId: ids.sources[0] }, data: { includeInLearning: false } })
    try {
      const page = await svc.readRunEvidence(ids.a, run.runId, reader(ids.u1, false))
      const build = page.leaves.find((l) => l.key === "build")
      expect(page.stale).toBe(true)
      expect(build).toMatchObject({ reduced: true, estimate: null })
      expect((await svc.readRunCard(ids.a, run.runId, reader(ids.u1, true), NOW)).stale).toBe(true)
      await expect(svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_STALE", extra: { reason: "source_changed" } })
    } finally {
      await prisma.planActualsSnapshot.updateMany({ where: { projectId: ids.sources[0] }, data: { includeInLearning: true } })
    }
  })

  it("hidden_sources_advance_two_at_a_time across runs: each run publishes the global state the next run reads", async () => {
    // The project-type trend aggregates the four hidden projects (S4–S7) for this creator's visibility class.
    const typeState = async () => {
      const rows = await prisma.planEstimateHiddenState.findMany({ where: { unitKey: { startsWith: JSON.stringify(["type", ptype]).slice(0, -1) } } })
      expect(rows).toHaveLength(1)
      return (rows[0].state as { x: number }).x
    }
    const days = (r: { summary: { changes: { key: string; days: number }[] } }) => r.summary.changes.find((c) => c.key === "build")?.days
    const base = await svc.createRun(ids.a, input(), po, NOW)
    const x0 = await typeState()
    // One hidden source changes: the published aggregate is held, and so is the plan.
    await prisma.planActualsItem.update({ where: { id: itemOf.get(ids.sources[3]) }, data: { actualDays: 60 } })
    const one = await svc.createRun(ids.a, input(), po, NOW)
    expect(await typeState()).toBe(x0)
    expect(days(one)).toBe(days(base))
    // A second one changes: now both move together (the held state was what the second run compared with).
    await prisma.planActualsItem.update({ where: { id: itemOf.get(ids.sources[4]) }, data: { actualDays: 60 } })
    await svc.createRun(ids.a, input(), po, NOW)
    expect(await typeState()).toBeGreaterThan(x0)
  })

  it("card_fits_size_limit_with_500_items: the card stays small and the same size whatever the item count", async () => {
    const big = (n: number) => ({
      startDate: "2026-11-09",
      skipWeekends: true,
      roleAssignments: { dev: [ids.u2] },
      source: { kind: "schedule" as const, lineage, schedule: { items: Array.from({ length: n }, (_, i) => ({ key: i === 0 ? "build" : `k${i}`, name: `作業 ${i} ${"長い名前".repeat(20)}`, durationDays: 10, role: "dev", load: 0.1 })) } },
    })
    const r500 = await svc.createRun(ids.a, big(500), po, NOW)
    const r50 = await svc.createRun(ids.a, big(50), po, NOW)
    const size = (s: unknown) => Buffer.byteLength(JSON.stringify(s), "utf8")
    expect(size(r500.summary)).toBeLessThan(55_000)
    expect(r500.summary.changes.length).toBeLessThanOrEqual(20)
    expect(Math.abs(size(r500.summary) - size(r50.summary))).toBeLessThan(200)
  }, 60_000)

  const cleanPlan = async () => {
    await prisma.planItemDependency.deleteMany({ where: { projectId: ids.a } }).catch(() => undefined)
    await prisma.planItem.deleteMany({ where: { projectId: ids.a } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: ids.a, proposalId: { startsWith: "est_" } } })
  }

  it("plan_changed: same inputs, but the stored owners or schedule differ from the recompute → refused", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    const stored = await prisma.planEstimateRun.findUniqueOrThrow({ where: { id: run.runId } })
    const ownerPlan = stored.ownerPlan as { owners: Record<string, string | null> }
    await prisma.planEstimateRun.update({ where: { id: run.runId }, data: { ownerPlan: { ...ownerPlan, owners: { ...ownerPlan.owners, build: ids.u1 } } } })
    await expect(svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_STALE", extra: { reason: "plan_changed" } })
    // The owners back, a schedule day off instead (what a now-confidential PBI's hours would do): refused as well.
    const schedule = stored.schedule as { items: { key: string; durationDays?: number }[] }
    await prisma.planEstimateRun.update({ where: { id: run.runId }, data: { ownerPlan: stored.ownerPlan as object, schedule: { ...schedule, items: schedule.items.map((i) => (i.key === "build" ? { ...i, durationDays: (i.durationDays ?? 1) + 1 } : i)) } } })
    await expect(svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_STALE", extra: { reason: "plan_changed" } })
    expect(await prisma.planItem.count({ where: { projectId: ids.a } })).toBe(0)
  })

  it("levelled parallel starts (index 0 included) stay parallel when loaded", async () => {
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: ids.a, userId: ids.u1 } }, data: { role: "po" } })
    // x and y depend on the kick-off only, so they may run side by side (two people).
    const two = { items: [{ key: "kick", name: "開始", milestone: true }, { key: "x", name: "X", durationDays: 3, role: "dev", dependsOn: ["kick"] }, { key: "y", name: "Y", durationDays: 3, role: "dev", dependsOn: ["kick"] }] }
    const run = await svc.createRun(ids.a, { startDate: "2026-11-09", skipWeekends: true, roleAssignments: { dev: [ids.u1, ids.u2] }, source: { kind: "schedule", schedule: two } }, po, NOW)
    const stored = (await prisma.planEstimateRun.findUniqueOrThrow({ where: { id: run.runId } })).schedule as { items: { key: string; notBeforeOffsetDays?: number }[] }
    // Every leaf carries its start, index 0 (the kick-off) included.
    expect(stored.items.map((i) => i.notBeforeOffsetDays)).toEqual([0, 1, 1])
    await svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)
    const rows = await prisma.planItem.findMany({ where: { projectId: ids.a, deletedAt: null, templateKey: { in: ["x", "y"] } }, select: { templateKey: true, plannedStart: true, ownerId: true } })
    expect(new Set(rows.map((r) => r.plannedStart?.toISOString().slice(0, 10)))).toEqual(new Set(["2026-11-10"]))
    expect(new Set(rows.map((r) => r.ownerId))).toEqual(new Set([ids.u1, ids.u2]))
    await cleanPlan()
  })

  it("a run made on the last day of a month is approved on the first of the next (same R)", async () => {
    const oct31 = new Date("2026-10-31T05:00:00.000Z")
    const run = await svc.createRun(ids.a, input(), po, oct31)
    const out = await svc.loadEstimateRun(ids.a, run.runId, [], po, VML, new Date("2026-11-01T01:00:00.000Z"))
    expect(out.createdCount).toBe(2)
    await cleanPlan()
  })

  it("expiry boundary: 1 ms before 24 h loads, exactly 24 h is expired", async () => {
    const a = await svc.createRun(ids.a, input(), po, NOW)
    await expect(svc.loadEstimateRun(ids.a, a.runId, [], po, VML, new Date(NOW.getTime() + 24 * 3_600_000))).rejects.toMatchObject({ extra: { reason: "expired" } })
    const b = await svc.createRun(ids.a, input(), po, NOW)
    expect((await svc.loadEstimateRun(ids.a, b.runId, [], po, VML, new Date(NOW.getTime() + 24 * 3_600_000 - 1))).createdCount).toBe(2)
    await cleanPlan()
  })

  it("same_proposal_loads_once under concurrency: two approvals at once, exactly one writes", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    const results = await Promise.allSettled([svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW), svc.loadEstimateRun(ids.a, run.runId, [], po, VML, NOW)])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "PLAN_ALREADY_LOADED" } })
    expect(await prisma.planItem.count({ where: { projectId: ids.a, deletedAt: null } })).toBe(2)
    await cleanPlan()
  })

  it("an approver who cannot view a source the run counted as visible is refused (approver_limited)", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    // u2 (not a PO / SM, cannot view S1–S3) approving: the days would give S1–S3's ratio back.
    const asDev = { userId: ids.u2, userName: "u2", systemRole: "member" }
    await expect(svc.loadEstimateRun(ids.a, run.runId, [], asDev, VML, NOW)).rejects.toMatchObject({ code: "PLAN_ESTIMATE_STALE", extra: { reason: "approver_limited" } })
    expect(await prisma.planItem.count({ where: { projectId: ids.a } })).toBe(0)
  })

  it("an approver without plan.viewMemberLoad loads no owners (the card showed none)", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    await svc.loadEstimateRun(ids.a, run.runId, [], po, { canViewMemberLoad: false }, NOW)
    expect((await prisma.planItem.findMany({ where: { projectId: ids.a, deletedAt: null }, select: { ownerId: true } })).every((r) => r.ownerId === null)).toBe(true)
    await cleanPlan()
  })

  it("external_schedule_owner_id_ignored (service path): owners come only from the levelling of the assigned members", async () => {
    const { createRunSchema } = await import("../estimate-run.schemas")
    const body = createRunSchema.parse({ startDate: "2026-11-09", skipWeekends: true, roleAssignments: { dev: [ids.u2] }, lineage, schedule: { items: [{ key: "build", name: "製作", durationDays: 10, role: "dev", ownerId: ids.u1 }] } })
    const run = await svc.createRun(ids.a, { startDate: body.startDate, skipWeekends: true, roleAssignments: body.roleAssignments, source: { kind: "schedule", schedule: body.schedule!, lineage } }, po, NOW)
    const stored = await prisma.planEstimateRun.findUniqueOrThrow({ where: { id: run.runId } })
    expect(JSON.stringify(stored.schedule)).not.toContain(ids.u1)
    expect((stored.ownerPlan as { owners: Record<string, string> }).owners).toEqual({ build: ids.u2 })
  })

  it("a Kanflow template's stage roles take the members chosen on the screen: owners are proposed from them", async () => {
    const template = await prisma.planTemplate.create({
      data: {
        id: `${tag}-tpl`,
        name: `${tag}-役割つき`,
        visibility: "public",
        ownerId: ids.u1,
        content: JSON.stringify({ stages: [{ name: "設計", children: [{ key: "build", name: "製作", durationDays: 5, role: "dev" }] }, { key: "test", name: "試験", durationDays: 2, role: "qa" }] }),
      },
    })
    try {
      const run = await svc.createRun(ids.a, { startDate: "2026-11-09", skipWeekends: true, roleAssignments: { dev: [ids.u2] }, source: { kind: "template", templateId: template.id } }, po, NOW)
      const stored = await prisma.planEstimateRun.findUniqueOrThrow({ where: { id: run.runId } })
      const owners = (stored.ownerPlan as { owners: Record<string, string | null> }).owners
      expect(owners.build).toBe(ids.u2)
      // A role with no members chosen stays unassigned.
      expect(owners.test ?? null).toBeNull()
    } finally {
      await prisma.planEstimateRun.deleteMany({ where: { projectId: ids.a, sourceRef: { startsWith: `template:${template.id}` } } })
      await prisma.planTemplate.delete({ where: { id: template.id } })
    }
  })

  it("proposal_contains_only_template_or_rule_items: a confirmed rule's item is added (and named as such), nothing else", async () => {
    const rule = await prisma.planLessonRule.create({ data: { kind: "add_buffer", params: { afterKey: "build", days: 2 }, sourceProjectId: ids.a, state: "confirmed", confirmedById: ids.u1, confirmedAt: new Date() } })
    // E3 adds items only to a template of at least 5 leaves (20 % rule).
    const five = { items: ["build", "p2", "p3", "p4", "p5"].map((key) => ({ key, name: key, durationDays: 3, role: "dev" })) }
    try {
      const run = await svc.createRun(ids.a, { ...input(), source: { kind: "schedule", schedule: five, lineage } }, po, NOW)
      const stored = await prisma.planEstimateRun.findUniqueOrThrow({ where: { id: run.runId } })
      expect({ applied: run.summary.rulesApplied, rejected: run.summary.rulesRejected }).toEqual({ applied: 1, rejected: 0 })
      const keys = (stored.schedule as { items: { key: string }[] }).items.map((i) => i.key)
      const added = keys.filter((k) => !["build", "p2", "p3", "p4", "p5"].includes(k))
      expect(added).toHaveLength(1)
      const page = await svc.readRunEvidence(ids.a, run.runId, reader(ids.u1, false))
      expect(page.leaves.find((l) => l.key === added[0])).toMatchObject({ addedByRule: rule.id, templateDays: null })
      expect(run.summary.rulesApplied).toBe(1)
    } finally {
      await prisma.planLessonRule.delete({ where: { id: rule.id } })
    }
  })

  it("feedback: one per key, person and kind; a repeat updates the note; an unknown key is refused", async () => {
    const run = await svc.createRun(ids.a, input(), po, NOW)
    const first = await svc.recordFeedback(ids.a, run.runId, { key: "build", kind: "too_high", note: "長すぎる" }, ids.u1)
    const again = await svc.recordFeedback(ids.a, run.runId, { key: "build", kind: "too_high", note: "やはり長い" }, ids.u1)
    expect(again.id).toBe(first.id)
    expect((await prisma.planEstimateFeedback.findUniqueOrThrow({ where: { id: first.id } })).note).toBe("やはり長い")
    await expect(svc.recordFeedback(ids.a, run.runId, { key: "nope", kind: "other" }, ids.u1)).rejects.toMatchObject({ code: "VALIDATION" })
  })
})
