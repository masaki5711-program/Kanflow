import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * 実績を確定 (plan 12 E1) against a REAL PostgreSQL. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a
 * migrated, disposable test database (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan-actuals/__tests__/actuals.db.test.ts
 *
 * The scenario is plan 12 §8.2: one synthetic project, three repositories, one PBI with three MRs (one per
 * repository) — the MR-set lead time spans all three and the per-repository rows add up to the leaf.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe.skipIf(!enabled)("actuals snapshots on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `e1test-${Date.now().toString(36)}`
  const ids = {
    project: `${tag}-p`,
    other: `${tag}-q`,
    po: `${tag}-po`,
    dev: `${tag}-dev`,
    retired: `${tag}-old`,
    admin: `${tag}-admin`,
    phase: `${tag}-phase`,
    spec: `${tag}-spec`,
    impl: `${tag}-impl`,
    accept: `${tag}-accept`,
    otherLeaf: `${tag}-qleaf`,
    pbi: `${tag}-pbi`,
    pbiSecret: `${tag}-pbi2`,
    sprint: `${tag}-sprint`,
    repos: [`${tag}-r-api`, `${tag}-r-web`, `${tag}-r-infra`],
  }
  const po = { userId: ids.po, userName: "PO", systemRole: "member" }
  const admin = { userId: ids.admin, userName: "Admin", systemRole: "admin" }
  const synced = new Date("2026-11-20T00:00:00.000Z")

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../actuals.service")
  let learn: typeof import("../actuals.learnable")

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../actuals.service")
    learn = await import("../actuals.learnable")
    for (const u of [ids.po, ids.dev, ids.admin]) await prisma.user.create({ data: { id: u, name: u, email: `${u}@example.test`, password: "synthetic" } })
    await prisma.user.create({ data: { id: ids.retired, name: ids.retired, email: `${ids.retired}@example.test`, password: "synthetic", isActive: false } })
    await prisma.project.create({ data: { id: ids.project, name: `${tag}-1`, projectType: "software" } })
    await prisma.project.create({ data: { id: ids.other, name: `${tag}-2`, projectType: "software" } })
    await prisma.planScheduleLoad.create({
      data: {
        projectId: ids.project,
        lineage: `${tag}-line`,
        scheduleHash: "a".repeat(64),
        skipWeekends: true,
        startDate: d("2026-11-02"),
        content: { items: [{ key: "phase", name: "開発", children: [{ key: "spec", name: "仕様", durationDays: 3, role: "pm" }, { key: "impl", name: "実装", durationDays: 5, role: "dev" }, { key: "accept", name: "検収", durationDays: 1, milestone: true }] }] },
      },
    })
    const base = { projectId: ids.project, status: "done" }
    await prisma.planItem.create({ data: { ...base, id: ids.phase, name: "開発", templateKey: "phase" } })
    // spec: Mon 11-02 .. Wed 11-04 as planned.
    await prisma.planItem.create({ data: { ...base, id: ids.spec, parentId: ids.phase, name: "仕様", templateKey: "spec", ownerId: ids.retired, baselineStart: d("2026-11-02"), baselineEnd: d("2026-11-04"), plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-04"), actualStart: d("2026-11-02"), actualEnd: d("2026-11-04") } })
    // impl: planned Thu 11-05 .. Wed 11-11 (5 working days); actually Mon 11-09 .. Mon 11-16 (6 working days).
    await prisma.planItem.create({ data: { ...base, id: ids.impl, parentId: ids.phase, name: "実装", templateKey: "impl", ownerId: ids.dev, baselineStart: d("2026-11-05"), baselineEnd: d("2026-11-11"), plannedStart: d("2026-11-05"), plannedEnd: d("2026-11-11"), actualStart: d("2026-11-09"), actualEnd: d("2026-11-16") } })
    // accept: no actual end → an issue.
    await prisma.planItem.create({ data: { ...base, id: ids.accept, parentId: ids.phase, name: "検収", templateKey: "accept", isMilestone: true, status: "in_progress", baselineStart: d("2026-11-17"), baselineEnd: d("2026-11-17"), plannedStart: d("2026-11-17"), plannedEnd: d("2026-11-17"), actualStart: d("2026-11-17") } })
    await prisma.planItemDependency.create({ data: { projectId: ids.project, predecessorId: ids.spec, successorId: ids.impl } })
    // The same developer held a leaf of ANOTHER project Mon 11-09 .. Tue 11-10 (only its span may be used).
    await prisma.planItem.create({ data: { projectId: ids.other, id: ids.otherLeaf, name: "秘密の別案件", ownerId: ids.dev, actualStart: d("2026-11-09"), actualEnd: d("2026-11-10") } })
    // impl was on hold Tue 11-10 .. Wed 11-11.
    await prisma.activityLog.create({ data: { projectId: ids.project, entityType: "plan_item", entityId: ids.impl, action: "status_change", diff: JSON.stringify({ changes: { status: { from: "in_progress", to: "on_hold" } } }), createdAt: new Date("2026-11-10T03:00:00.000Z") } })
    await prisma.activityLog.create({ data: { projectId: ids.project, entityType: "plan_item", entityId: ids.impl, action: "status_change", diff: JSON.stringify({ changes: { status: { from: "on_hold", to: "in_progress" } } }), createdAt: new Date("2026-11-12T03:00:00.000Z") } })

    await prisma.productBacklogItem.create({ data: { id: ids.pbi, projectId: ids.project, displayId: 1, initiative: "synthetic", planItemId: ids.impl } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbiSecret, projectId: ids.project, displayId: 2, initiative: "synthetic", planItemId: ids.impl } })
    await prisma.sprint.create({ data: { id: ids.sprint, projectId: ids.project, sprintName: "S1", startDate: d("2026-11-09"), endDate: d("2026-11-16") } })
    await prisma.sprintBacklogItem.create({ data: { sprintId: ids.sprint, pbItemId: ids.pbi, taskName: "t1", estimatedHours: 10, actualHours: 12 } })
    await prisma.sprintBacklogItem.create({ data: { sprintId: ids.sprint, pbItemId: ids.pbiSecret, taskName: "t2", estimatedHours: 5, actualHours: 3 } })
    // The PBI was reopened once.
    await prisma.activityLog.create({ data: { projectId: ids.project, entityType: "pbi", entityId: ids.pbi, action: "status_change", diff: JSON.stringify({ changes: { status: { from: "done", to: "in_progress" } } }) } })

    const [api, web, infra] = ids.repos
    for (const [i, id] of ids.repos.entries()) {
      await prisma.gitRepository.create({ data: { id, projectId: ids.project, name: `repo${i}`, webUrl: `https://git.example.test/g/r${i}`, apiBase: "https://git.example.test", repoPath: `g/r${i}`, syncedAt: synced } })
    }
    const mr = (repositoryId: string, ref: string, opened: string, merged: string | null, backlogItemId = ids.pbi) =>
      prisma.gitLink.create({
        data: { projectId: ids.project, repositoryId, backlogItemId, kind: "mr", ref, title: `MR ${ref}`, url: "https://git.example.test/mr", state: merged ? "merged" : "closed", occurredAt: synced, openedAt: new Date(opened), mergedAt: merged ? new Date(merged) : null, additions: 10, deletions: 2, versionCount: 1 },
      })
    await mr(api, "1", "2026-11-09T00:00:00.000Z", "2026-11-10T00:00:00.000Z")
    await mr(web, "2", "2026-11-09T06:00:00.000Z", "2026-11-12T00:00:00.000Z")
    await mr(infra, "3", "2026-11-10T00:00:00.000Z", "2026-11-13T00:00:00.000Z")
    // Closed without merging: not part of the set.
    await mr(api, "4", "2026-11-01T00:00:00.000Z", null)
    await mr(web, "9", "2026-11-09T00:00:00.000Z", "2026-11-09T05:00:00.000Z", ids.pbiSecret)
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.planActualsSnapshot.deleteMany({ where: { projectId: { in: [ids.project, ids.other] } } })
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitRepository.deleteMany({ where: { projectId: ids.project } })
    await prisma.sprintBacklogItem.deleteMany({ where: { sprintId: ids.sprint } })
    await prisma.sprint.deleteMany({ where: { projectId: ids.project } })
    await prisma.productBacklogItem.deleteMany({ where: { projectId: ids.project } })
    await prisma.activityLog.deleteMany({ where: { projectId: { in: [ids.project, ids.other] } } })
    await prisma.planItemDependency.deleteMany({ where: { projectId: ids.project } })
    await prisma.planItem.deleteMany({ where: { projectId: { in: [ids.project, ids.other] }, parentId: { not: null } } })
    await prisma.planItem.deleteMany({ where: { projectId: { in: [ids.project, ids.other] } } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: ids.project } })
    await prisma.projectAttribute.deleteMany({ where: { projectId: ids.project } })
    await prisma.project.deleteMany({ where: { id: { in: [ids.project, ids.other] } } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.po, ids.dev, ids.retired, ids.admin] } } })
  })

  let first: Awaited<ReturnType<typeof import("../actuals.service").finalizeActuals>>

  it("lists the issues and refuses to finalize until they are acknowledged", async () => {
    const preview = await svc.previewActuals(ids.project)
    expect(preview).toMatchObject({ leafCount: 3, completeCount: 2, repoCount: 3 })
    expect(preview.issues).toEqual([{ planItemId: ids.accept, kind: "missing_actual", name: "検収" }])
    await expect(svc.finalizeActuals(ids.project, {}, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_INCOMPLETE" })
    // Acknowledging a different number of issues than there are now is refused too (new issues are shown first).
    await expect(svc.finalizeActuals(ids.project, { acknowledgedIssueCount: 5 }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_INCOMPLETE" })
    first = await svc.finalizeActuals(ids.project, { acknowledgedIssueCount: await issueCount() }, po)
    expect(first).toMatchObject({ current: true, leafCount: 3, completeCount: 2, issueCount: 1, includeInLearning: true, lineage: `${tag}-line`, closedAt: "2026-11-16" })
    // The audit row is part of the same transaction.
    expect(await prisma.activityLog.count({ where: { projectId: ids.project, diff: { contains: first.id } } })).toBe(1)
  })

  it("the table keeps exactly one current snapshot even for a writer that skips the lock", async () => {
    await expect(
      prisma.planActualsSnapshot.create({ data: { projectId: ids.project, projectType: "software", lineage: "x", closedAt: d("2026-11-16"), firstFinalizedAt: new Date(), methodVersion: "e1-v1" } }),
    ).rejects.toThrow()
  })

  it("snapshot_counts_workdays_when_skip_weekends; slips, wait, on hold; owner concurrency stores numbers only", async () => {
    const impl = await prisma.planActualsItem.findFirstOrThrow({ where: { snapshotId: first.id, planItemId: ids.impl } })
    expect(impl).toMatchObject({ templateKey: "impl", role: "dev", templateDays: 5, plannedDays: 5, actualDays: 6, startSlipDays: 2, endSlipDays: 3, waitGapDays: 2, onHoldDays: 2, complete: true })
    // concurrent_load_stores_no_other_project_names: Mon / Tue overlap the other project's leaf → peak 2.
    expect(impl.ownerConcurrentPeak).toBe(2)
    const stored = JSON.stringify(await prisma.planActualsItem.findMany({ where: { snapshotId: first.id } }))
    expect(stored).not.toContain("秘密の別案件")
    expect(stored).not.toContain(ids.other)
    const accept = await prisma.planActualsItem.findFirstOrThrow({ where: { snapshotId: first.id, planItemId: ids.accept } })
    // incomplete_leaf_is_kept_but_not_learnable
    expect(accept).toMatchObject({ complete: false, actualDays: null })
  })

  it("mr_set_lead_time_spans_all_bound_repositories; per_repo_breakdown_sums_to_item_totals; closed_unmerged_mr_not_in_set", async () => {
    const impl = await prisma.planActualsItem.findFirstOrThrow({ where: { snapshotId: first.id, planItemId: ids.impl }, include: { pbis: true, repos: true } })
    const pbi = impl.pbis.find((p) => p.backlogItemId === ids.pbi)
    // 11-09 00:00 (first open, api) → 11-13 00:00 (last merge, infra) = 96 h; the closed MR #4 is not in the set.
    expect(pbi).toMatchObject({ mrCount: 3, mrSetLeadTimeHours: 96, effortHours: 12, estimatedHours: 10, reworkCount: 1 })
    const rows = impl.repos.filter((r) => r.backlogItemId === ids.pbi)
    expect(rows).toHaveLength(3)
    expect(rows.reduce((n, r) => n + (r.mrCount ?? 0), 0)).toBe(pbi?.mrCount)
  })

  it("confidential_pbi_hours_are_excluded and newly_confidential_pbi_excluded_at_use_time", async () => {
    const before = await learn.learnableItemFacts([await implItemId(first.id)])
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ effortHours: 15, excludedPbiCount: 0, repoTouched: 3, sourceProjectId: ids.project, lineage: `${tag}-line`, finalizedAt: expect.any(String) })
    expect(before[0].loadObserved).toBeCloseTo(15 / (6 * 7.5), 2)
    await prisma.productBacklogItem.update({ where: { id: ids.pbiSecret }, data: { confidential: true } })
    try {
      const after = await learn.learnableItemFacts([await implItemId(first.id)])
      expect(after[0]).toMatchObject({ effortHours: 12, excludedPbiCount: 1 })
      // The frozen row itself was not rewritten.
      const raw = await prisma.planActualsItemPbi.findFirstOrThrow({ where: { backlogItemId: ids.pbiSecret, item: { snapshotId: first.id } } })
      expect(raw.effortHours).toBe(3)
    } finally {
      await prisma.productBacklogItem.update({ where: { id: ids.pbiSecret }, data: { confidential: false } })
    }
  })

  it("deleted_pbi_treated_as_confidential; a leaf whose PBIs are all confidential is not learned from", async () => {
    await prisma.productBacklogItem.updateMany({ where: { id: { in: [ids.pbi, ids.pbiSecret] } }, data: { deletedAt: new Date() } })
    try {
      expect(await learn.learnableItemFacts([await implItemId(first.id)])).toEqual([])
    } finally {
      await prisma.productBacklogItem.updateMany({ where: { id: { in: [ids.pbi, ids.pbiSecret] } }, data: { deletedAt: null } })
    }
  })

  it("refinalize_supersedes_without_update: a new snapshot, the old one only marked; the first finalization date stays", async () => {
    const oldItems = await prisma.planActualsItem.findMany({ where: { snapshotId: first.id }, orderBy: { id: "asc" } })
    const second = await svc.finalizeActuals(ids.project, { acknowledgedIssueCount: await issueCount(), note: "試験の準備を早めに始める" }, po)
    expect(second.id).not.toBe(first.id)
    // E6: the note is kept with the snapshot, and each finalization queues one rule-draft request (night batch).
    expect((await prisma.planActualsSnapshot.findUniqueOrThrow({ where: { id: second.id } })).finalizeNote).toBe("試験の準備を早めに始める")
    expect(await prisma.planRuleDraftJob.findMany({ where: { projectId: ids.project }, select: { snapshotId: true, status: true }, orderBy: { createdAt: "asc" } })).toEqual([
      { snapshotId: first.id, status: "queued" },
      { snapshotId: second.id, status: "queued" },
    ])
    // …and one AI review request (proposals to exclude / treat as waiting, decided by a PO / SM).
    expect(await prisma.planActualsReviewJob.findMany({ where: { projectId: ids.project }, select: { snapshotId: true, status: true }, orderBy: { createdAt: "asc" } })).toEqual([
      { snapshotId: first.id, status: "queued" },
      { snapshotId: second.id, status: "queued" },
    ])
    const old = await prisma.planActualsSnapshot.findUniqueOrThrow({ where: { id: first.id } })
    expect(old.supersededAt).not.toBeNull()
    expect(await prisma.planActualsItem.findMany({ where: { snapshotId: first.id }, orderBy: { id: "asc" } })).toEqual(oldItems)
    expect(second.firstFinalizedAt).toBe(first.firstFinalizedAt)
    // Only the current snapshot is learned from.
    expect(await learn.learnableItemFacts([await implItemId(first.id)])).toEqual([])
    expect(await learn.learnableItemFacts([await implItemId(second.id)])).toHaveLength(1)
    first = second
  })

  it("two concurrent finalizations leave exactly one current snapshot", async () => {
    const n = await issueCount()
    await Promise.all([1, 2].map(() => svc.finalizeActuals(ids.project, { acknowledgedIssueCount: n }, po)))
    expect(await prisma.planActualsSnapshot.count({ where: { projectId: ids.project, supersededAt: null } })).toBe(1)
    first = (await svc.listSnapshots(ids.project))[0]
  })

  it("the learning switch is version-guarded, audited with its reason, and removes the snapshot from learning", async () => {
    const item = await implItemId(first.id)
    await expect(svc.setIncludeInLearning(ids.project, first.id, { includeInLearning: false, reason: "合成: 進め方が特殊", version: first.version + 7 }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_CHANGED" })
    const off = await svc.setIncludeInLearning(ids.project, first.id, { includeInLearning: false, reason: "合成: 進め方が特殊", version: first.version }, po)
    expect(off.includeInLearning).toBe(false)
    expect(await learn.learnableItemFacts([item])).toEqual([])
    const audit = await prisma.activityLog.findFirst({ where: { projectId: ids.project, diff: { contains: "planActualsLearning" } }, orderBy: { createdAt: "desc" } })
    expect(audit?.diff).toContain("合成: 進め方が特殊")
    await expect(svc.setIncludeInLearning(ids.other, first.id, { includeInLearning: true, reason: "x", version: off.version }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_NOT_FOUND" })
    const on = await svc.setIncludeInLearning(ids.project, first.id, { includeInLearning: true, reason: "合成: 戻す", version: off.version }, po)
    expect(on.includeInLearning).toBe(true)
    first = on
    // An old (superseded) record cannot be switched.
    const old = await prisma.planActualsSnapshot.findFirstOrThrow({ where: { projectId: ids.project, supersededAt: { not: null } } })
    await expect(svc.setIncludeInLearning(ids.project, old.id, { includeInLearning: false, reason: "x", version: old.version }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_CHANGED" })
  })

  it("pseudonymize_replaces_owner_with_role_only_and_is_audited (retired users only)", async () => {
    await expect(svc.pseudonymizeActuals({ userId: ids.dev, reason: "合成: 退職" }, admin)).rejects.toMatchObject({ code: "PLAN_ACTUALS_USER_ACTIVE" })
    const numbersBefore = await prisma.planActualsItem.findMany({ where: { ownerId: ids.retired }, select: { id: true, actualDays: true, plannedDays: true } })
    expect(numbersBefore.length).toBeGreaterThan(0)
    const res = await svc.pseudonymizeActuals({ userId: ids.retired, reason: "合成: 退職" }, admin)
    expect(res.updated).toBe(numbersBefore.length)
    expect(await prisma.planActualsItem.count({ where: { ownerId: ids.retired } })).toBe(0)
    const after = await prisma.planActualsItem.findMany({ where: { id: { in: numbersBefore.map((n) => n.id) } }, select: { id: true, ownerId: true, actualDays: true, plannedDays: true } })
    expect(after.every((r) => r.ownerId === "role:pm")).toBe(true)
    expect(after.map(({ id, actualDays, plannedDays }) => ({ id, actualDays, plannedDays })).sort((a, b) => a.id.localeCompare(b.id))).toEqual([...numbersBefore].sort((a, b) => a.id.localeCompare(b.id)))
    const audit = await prisma.activityLog.findFirst({ where: { projectId: ids.project, diff: { contains: "planActualsPseudonymize" } } })
    expect(audit?.actorId).toBe(ids.admin)
    expect(audit?.diff).toContain(ids.retired)
    expect(audit?.diff).toContain("合成: 退職")
    // The link back to the live plan row is cut: the owner cannot be re-joined from PlanItem.
    const cut = await prisma.planActualsItem.findMany({ where: { id: { in: numbersBefore.map((n) => n.id) } }, select: { planItemId: true } })
    expect(cut.every((r) => r.planItemId === "")).toBe(true)
    await expect(svc.pseudonymizeActuals({ userId: `${tag}-nobody`, reason: "x" }, admin)).rejects.toMatchObject({ code: "PLAN_ACTUALS_NOT_FOUND" })
  })

  it("pseudonymising by snapshot is for old records only", async () => {
    const current = await prisma.planActualsSnapshot.findFirstOrThrow({ where: { projectId: ids.project, supersededAt: null } })
    await expect(svc.pseudonymizeActuals({ snapshotId: current.id, reason: "x" }, admin)).rejects.toMatchObject({ code: "PLAN_ACTUALS_CURRENT" })
    const old = await prisma.planActualsSnapshot.findFirstOrThrow({ where: { projectId: ids.project, supersededAt: { not: null } } })
    const res = await svc.pseudonymizeActuals({ snapshotId: old.id, reason: "合成: 保持期間" }, admin)
    expect(res.updated).toBeGreaterThan(0)
    expect(await prisma.planActualsItem.count({ where: { snapshotId: old.id, ownerId: { not: null }, NOT: { ownerId: { startsWith: "role:" } } } })).toBe(0)
  })

  it("snapshot items for the screen carry no owner and no concurrency", async () => {
    const items = await svc.snapshotItems(ids.project, first.id)
    expect(items.length).toBe(3)
    for (const it of items) {
      expect(it).not.toHaveProperty("ownerId")
      expect(it).not.toHaveProperty("ownerConcurrentPeak")
    }
    await expect(svc.snapshotItems(ids.other, first.id)).rejects.toMatchObject({ code: "PLAN_ACTUALS_NOT_FOUND" })
  })

  it("unreadable_repository_gives_null_not_zero (and is listed as an issue)", async () => {
    await prisma.gitRepository.update({ where: { id: ids.repos[2] }, data: { lastErrorAt: new Date("2026-11-21T00:00:00.000Z") } })
    try {
      const preview = await svc.previewActuals(ids.project)
      expect(preview.issues).toContainEqual({ kind: "repository_unreadable", repositoryRef: "g/r2" })
      const snap = await svc.finalizeActuals(ids.project, { acknowledgedIssueCount: await issueCount() }, po)
      const pbi = await prisma.planActualsItemPbi.findFirstOrThrow({ where: { backlogItemId: ids.pbi, item: { snapshotId: snap.id } } })
      expect(pbi).toMatchObject({ mrCount: null, mrSetLeadTimeHours: null })
      const facts = await learn.learnableItemFacts([await implItemId(snap.id)])
      expect(facts[0]).toMatchObject({ repoTouched: null, mrSetLeadTimeHours: null })
    } finally {
      await prisma.gitRepository.update({ where: { id: ids.repos[2] }, data: { lastErrorAt: null } })
    }
  })

  async function issueCount(): Promise<number> {
    return (await svc.previewActuals(ids.project)).issues.length
  }

  async function implItemId(snapshotId: string): Promise<string> {
    return (await prisma.planActualsItem.findFirstOrThrow({ where: { snapshotId, planItemId: ids.impl }, select: { id: true } })).id
  }
})
