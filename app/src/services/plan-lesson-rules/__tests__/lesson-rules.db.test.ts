import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * 反省点の規則 (plan 12 E3) against a REAL PostgreSQL. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a
 * migrated, disposable test database (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan-lesson-rules/__tests__/lesson-rules.db.test.ts
 *
 * What it pins (what mocks cannot show): the lifecycle with its conditional writes (one of two concurrent confirms
 * wins), confidentiality decided at use time from the live PBI / lesson rows, the quote removed on promotion, and the
 * table CHECKs refusing rows the use-time decision would misread.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("lesson rules on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `e3test-${Date.now().toString(36)}`
  const ids = {
    p1: `${tag}-p1`,
    p2: `${tag}-p2`,
    po: `${tag}-po`,
    admin: `${tag}-admin`,
    pbi: `${tag}-pbi`,
    pbiOther: `${tag}-pbi-other`,
    sprint: `${tag}-sprint`,
    lesson: `${tag}-lesson`,
  }
  const po = { userId: ids.po, userName: "PO", systemRole: "member" }
  const admin = { userId: ids.admin, userName: "Admin", systemRole: "admin" }
  const buffer = { kind: "add_buffer" as const, params: { afterKey: "spec", days: 3 } }

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../lesson-rules.service")

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../lesson-rules.service")
    for (const u of [ids.po, ids.admin]) await prisma.user.create({ data: { id: u, name: u, email: `${u}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: ids.p1, name: `${tag}-1`, projectType: "software" } })
    await prisma.project.create({ data: { id: ids.p2, name: `${tag}-2`, projectType: "software" } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbi, projectId: ids.p1, displayId: 1, initiative: "synthetic" } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbiOther, projectId: ids.p2, displayId: 1, initiative: "synthetic" } })
    await prisma.sprint.create({ data: { id: ids.sprint, projectId: ids.p1, sprintName: "S1", startDate: new Date("2026-01-05"), endDate: new Date("2026-01-16") } })
    await prisma.lesson.create({ data: { id: ids.lesson, signature: `${tag}-sig`, scope: `project:${ids.p1}`, symptom: "synthetic", state: "confirmed" } })
    for (const lineage of ["line-A", "line-C"]) {
      await prisma.planScheduleLoad.create({ data: { projectId: ids.p1, lineage, scheduleHash: "0".repeat(64), content: { items: [] }, startDate: new Date("2026-01-05") } })
    }
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.planLessonRule.deleteMany({ where: { sourceProjectId: { in: [ids.p1, ids.p2] } } })
    await prisma.activityLog.deleteMany({ where: { projectId: { in: [ids.p1, ids.p2] } } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: { in: [ids.p1, ids.p2] } } })
    await prisma.lesson.deleteMany({ where: { id: { startsWith: tag } } })
    await prisma.sprint.deleteMany({ where: { projectId: { in: [ids.p1, ids.p2] } } })
    await prisma.productBacklogItem.deleteMany({ where: { projectId: { in: [ids.p1, ids.p2] } } })
    await prisma.project.deleteMany({ where: { id: { in: [ids.p1, ids.p2] } } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.po, ids.admin] } } })
  })

  const target = (projectId: string, lineage: string | null = "line-A") => ({ projectId, lineage, projectType: "software" })

  it("draft_rule_never_changes_plan, then a confirmed rule does — in its project only", async () => {
    const draft = await svc.createDraft(ids.p1, { ...buffer, quote: "受入が遅れた" }, po)
    expect(draft.state).toBe("draft")
    expect((await svc.effectiveLessonRules(target(ids.p1))).rules.map((r) => r.id)).not.toContain(draft.id)

    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)
    expect(confirmed.state).toBe("confirmed")
    expect(confirmed.confirmedById).toBe(ids.po)
    expect((await svc.effectiveLessonRules(target(ids.p1))).rules.map((r) => r.id)).toContain(draft.id)
    expect((await svc.effectiveLessonRules(target(ids.p2))).rules.map((r) => r.id)).not.toContain(draft.id)
  })

  it("rule_confirm_is_one_at_a_time_with_numbers: other numbers or a stale version are refused", async () => {
    const draft = await svc.createDraft(ids.p1, buffer, po)
    await expect(svc.confirmRule(ids.p1, draft.id, { version: draft.version, kind: "add_buffer", params: { afterKey: "spec", days: 4 } }, po)).rejects.toMatchObject({ code: "PLAN_RULE_CHANGED" })
    const edited = await svc.updateDraft(ids.p1, draft.id, { version: draft.version, kind: "add_buffer", params: { afterKey: "spec", days: 5 } }, po)
    await expect(svc.confirmRule(ids.p1, draft.id, { version: draft.version, kind: "add_buffer", params: { afterKey: "spec", days: 5 } }, po)).rejects.toMatchObject({ code: "PLAN_RULE_CHANGED" })
    const ok = await svc.confirmRule(ids.p1, draft.id, { version: edited.version, kind: "add_buffer", params: { afterKey: "spec", days: 5 } }, po)
    expect(ok.state).toBe("confirmed")
    // Already confirmed: a second confirm is a state error, not a silent success.
    await expect(svc.confirmRule(ids.p1, draft.id, { version: ok.version, kind: "add_buffer", params: { afterKey: "spec", days: 5 } }, po)).rejects.toMatchObject({ code: "PLAN_RULE_STATE" })
  })

  it("two concurrent confirms of one draft: exactly one wins", async () => {
    const draft = await svc.createDraft(ids.p1, buffer, po)
    const results = await Promise.allSettled([1, 2].map(() => svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)))
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const row = await prisma.planLessonRule.findUniqueOrThrow({ where: { id: draft.id } })
    expect(row.version).toBe(draft.version + 1)
  })

  it("stores the normalised params (NFKC) and refuses invalid content and foreign sources", async () => {
    const pre = await svc.createDraft(ids.p1, { kind: "add_prerequisite", params: { beforeKey: "spec", newKey: "review", name: "ﾚﾋﾞｭｰ①", durationDays: 2 } }, po)
    expect((pre.params as { name: string }).name).toBe("レビュー1")
    await expect(svc.createDraft(ids.p1, { kind: "add_buffer", params: { afterKey: "spec", days: 99 } }, po)).rejects.toMatchObject({ code: "PLAN_RULE_INVALID" })
    await expect(svc.createDraft(ids.p1, { ...buffer, sourceBacklogItemIds: [ids.pbiOther] }, po)).rejects.toMatchObject({ code: "PLAN_RULE_INVALID" })
    await expect(svc.createDraft(ids.p2, { ...buffer, sourceSprintId: ids.sprint }, po)).rejects.toMatchObject({ code: "PLAN_RULE_INVALID" })
    await expect(svc.createDraft(ids.p2, { ...buffer, sourceLessonId: ids.lesson }, po)).rejects.toMatchObject({ code: "PLAN_RULE_INVALID" })
  })

  it("a rule of another project is not found from this project", async () => {
    const draft = await svc.createDraft(ids.p1, buffer, po)
    await expect(svc.confirmRule(ids.p2, draft.id, { version: draft.version, ...buffer }, po)).rejects.toMatchObject({ code: "PLAN_RULE_NOT_FOUND" })
    await expect(svc.retireRule(ids.p2, draft.id, draft.version, po)).rejects.toMatchObject({ code: "PLAN_RULE_NOT_FOUND" })
  })

  it("retro_rule_is_project_scope_only: promotion of a retrospective rule is refused", async () => {
    const draft = await svc.createDraft(ids.p1, { ...buffer, sourceSprintId: ids.sprint, quote: "Problem: 検収の段取り" }, po)
    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)
    expect(confirmed.fromRetrospective).toBe(true)
    await expect(svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, lineage: "line-A" }, po)).rejects.toMatchObject({ code: "PLAN_RULE_PROMOTION_BLOCKED" })
  })

  it("promotion_strips_quote and the shared rule applies to other projects of the lineage", async () => {
    const draft = await svc.createDraft(ids.p1, { ...buffer, quote: "引用の文", sourceBacklogItemIds: [ids.pbi] }, po)
    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)
    const requested = await svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, lineage: "line-A" }, po)
    expect(requested.promotionRequest).toMatchObject({ lineage: "line-A", requestedById: ids.po })
    expect((await svc.listSharedAndRequested()).map((r) => r.id)).toContain(draft.id)

    const promoted = await svc.decidePromotion(draft.id, { decision: "confirm", version: requested.version, ...buffer, lineage: "line-A", projectType: null }, admin)
    expect(promoted).toMatchObject({ scope: "shared", lineage: "line-A", quote: null, promotionRequest: null })
    const row = await prisma.planLessonRule.findUniqueOrThrow({ where: { id: draft.id } })
    expect(row.quote).toBeNull()
    expect(row.promotedById).toBe(ids.admin)

    expect((await svc.effectiveLessonRules(target(ids.p2))).rules.map((r) => r.id)).toContain(draft.id)
    expect((await svc.effectiveLessonRules(target(ids.p2, "line-B"))).rules.map((r) => r.id)).not.toContain(draft.id)
    // A shared rule is the admin's now: the project routes no longer reach it.
    await expect(svc.retireRule(ids.p1, draft.id, promoted.version, po)).rejects.toMatchObject({ code: "PLAN_RULE_NOT_FOUND" })
  })

  it("rule_with_newly_confidential_source_stops_outside_project (PBI and lesson, checked at use time)", async () => {
    const draft = await svc.createDraft(ids.p1, { ...buffer, sourceBacklogItemIds: [ids.pbi], sourceLessonId: ids.lesson }, po)
    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)
    const requested = await svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, projectType: "software" }, po)
    await svc.decidePromotion(draft.id, { decision: "confirm", version: requested.version, ...buffer, lineage: null, projectType: "software" }, admin)
    expect((await svc.effectiveLessonRules(target(ids.p2, null))).rules.map((r) => r.id)).toContain(draft.id)

    await prisma.productBacklogItem.update({ where: { id: ids.pbi }, data: { confidential: true } })
    try {
      const outside = await svc.effectiveLessonRules(target(ids.p2, null))
      expect(outside.rules.map((r) => r.id)).not.toContain(draft.id)
      expect(outside.skipped).toContainEqual({ id: draft.id, reason: "source_confidential" })
      expect((await svc.effectiveLessonRules(target(ids.p1, null))).rules.map((r) => r.id)).toContain(draft.id)
      const listed = (await svc.listSharedAndRequested()).find((r) => r.id === draft.id)
      expect(listed).toMatchObject({ suspended: true, sourceConfidential: true })
    } finally {
      await prisma.productBacklogItem.update({ where: { id: ids.pbi }, data: { confidential: false } })
    }

    await prisma.lesson.update({ where: { id: ids.lesson }, data: { confidential: true } })
    try {
      expect((await svc.effectiveLessonRules(target(ids.p2, null))).rules.map((r) => r.id)).not.toContain(draft.id)
    } finally {
      await prisma.lesson.update({ where: { id: ids.lesson }, data: { confidential: false } })
    }

    // A trashed source PBI counts as confidential too.
    await prisma.productBacklogItem.update({ where: { id: ids.pbi }, data: { deletedAt: new Date() } })
    try {
      expect((await svc.effectiveLessonRules(target(ids.p2, null))).rules.map((r) => r.id)).not.toContain(draft.id)
    } finally {
      await prisma.productBacklogItem.update({ where: { id: ids.pbi }, data: { deletedAt: null } })
    }
  })

  it("a source that became confidential after the request blocks the admin's confirm", async () => {
    const draft = await svc.createDraft(ids.p1, { ...buffer, sourceBacklogItemIds: [ids.pbi] }, po)
    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)
    const requested = await svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, lineage: "line-C" }, po)
    await prisma.productBacklogItem.update({ where: { id: ids.pbi }, data: { confidential: true } })
    try {
      await expect(svc.decidePromotion(draft.id, { decision: "confirm", version: requested.version, ...buffer, lineage: "line-C", projectType: null }, admin)).rejects.toMatchObject({ code: "PLAN_RULE_PROMOTION_BLOCKED" })
      const rejected = await svc.decidePromotion(draft.id, { decision: "reject", version: requested.version }, admin)
      expect(rejected).toMatchObject({ scope: "project", promotionRequest: null })
    } finally {
      await prisma.productBacklogItem.update({ where: { id: ids.pbi }, data: { confidential: false } })
    }
  })

  it("a promotion asks only for the project's own lineages / type; one open request; the admin repeats the reach", async () => {
    const draft = await svc.createDraft(ids.p1, buffer, po)
    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)
    await expect(svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, lineage: "other-dept-family" }, po)).rejects.toMatchObject({ code: "PLAN_RULE_INVALID" })
    await expect(svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, projectType: "general" }, po)).rejects.toMatchObject({ code: "PLAN_RULE_INVALID" })
    const requested = await svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, lineage: "line-A" }, po)
    await expect(svc.requestPromotion(ids.p1, draft.id, { version: requested.version, lineage: "line-C" }, po)).rejects.toMatchObject({ code: "PLAN_RULE_STATE" })
    // The admin confirms what was requested — not a wider reach.
    await expect(svc.decidePromotion(draft.id, { decision: "confirm", version: requested.version, ...buffer, lineage: null, projectType: "software" }, admin)).rejects.toMatchObject({ code: "PLAN_RULE_CHANGED" })
    await svc.decidePromotion(draft.id, { decision: "reject", version: requested.version }, admin)
  })

  it("sharing never takes a rule away from its source project", async () => {
    const draft = await svc.createDraft(ids.p1, { kind: "split", params: { key: "impl", parts: 2 } }, po)
    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, kind: "split", params: { key: "impl", parts: 2 } }, po)
    const requested = await svc.requestPromotion(ids.p1, draft.id, { version: confirmed.version, lineage: "line-C" }, po)
    await svc.decidePromotion(draft.id, { decision: "confirm", version: requested.version, kind: "split", params: { key: "impl", parts: 2 }, lineage: "line-C", projectType: null }, admin)
    // The source project plans a schedule of another lineage: the rule still applies there.
    expect((await svc.effectiveLessonRules(target(ids.p1, "line-A"))).rules.map((r) => r.id)).toContain(draft.id)
    expect((await svc.effectiveLessonRules(target(ids.p2, "line-A"))).rules.map((r) => r.id)).not.toContain(draft.id)
  })

  it("a confidential, unconfirmed or foreign lesson cannot be cited (same answer for each)", async () => {
    const secret = `${tag}-lesson-secret`
    const draftLesson = `${tag}-lesson-draft`
    await prisma.lesson.create({ data: { id: secret, signature: `${tag}-sig2`, scope: "global", symptom: "synthetic", state: "confirmed", confidential: true } })
    await prisma.lesson.create({ data: { id: draftLesson, signature: `${tag}-sig3`, scope: "global", symptom: "synthetic" } })
    for (const sourceLessonId of [secret, draftLesson, `${tag}-missing`]) {
      await expect(svc.createDraft(ids.p1, { ...buffer, sourceLessonId }, po)).rejects.toMatchObject({ code: "PLAN_RULE_INVALID" })
    }
  })

  it("a lesson whose scope moved away from the source project counts as gone at use time", async () => {
    const draft = await svc.createDraft(ids.p1, { ...buffer, sourceLessonId: ids.lesson }, po)
    await svc.confirmRule(ids.p1, draft.id, { version: draft.version, ...buffer }, po)
    expect((await svc.listProjectRules(ids.p1)).find((r) => r.id === draft.id)?.sourceConfidential).toBe(false)
    await prisma.lesson.update({ where: { id: ids.lesson }, data: { scope: `project:${ids.p2}` } })
    try {
      expect((await svc.listProjectRules(ids.p1)).find((r) => r.id === draft.id)?.sourceConfidential).toBe(true)
    } finally {
      await prisma.lesson.update({ where: { id: ids.lesson }, data: { scope: `project:${ids.p1}` } })
    }
  })

  it("a retired rule stops changing plans", async () => {
    const draft = await svc.createDraft(ids.p1, { kind: "cap_parallel", params: { role: "qa", max: 2 } }, po)
    const confirmed = await svc.confirmRule(ids.p1, draft.id, { version: draft.version, kind: "cap_parallel", params: { role: "qa", max: 2 } }, po)
    const retired = await svc.retireRule(ids.p1, draft.id, confirmed.version, po)
    expect(retired.state).toBe("retired")
    expect((await svc.effectiveLessonRules(target(ids.p1))).rules.map((r) => r.id)).not.toContain(draft.id)
  })

  it("the table CHECKs refuse rows the use-time decision would misread", async () => {
    const base = { kind: "add_buffer", params: { afterKey: "a", days: 1 }, sourceProjectId: ids.p1 }
    await expect(prisma.planLessonRule.create({ data: { ...base, scope: "shared" } })).rejects.toThrow()
    await expect(prisma.planLessonRule.create({ data: { ...base, scope: "project", lineage: "x" } })).rejects.toThrow()
    await expect(prisma.planLessonRule.create({ data: { ...base, scope: "shared", lineage: "x", quote: "q" } })).rejects.toThrow()
    await expect(prisma.planLessonRule.create({ data: { ...base, state: "confirmed" } })).rejects.toThrow()
    await expect(prisma.planLessonRule.create({ data: { ...base, kind: "rewrite_everything" } })).rejects.toThrow()
    await expect(prisma.planLessonRule.create({ data: { ...base, params: [1, 2] } })).rejects.toThrow()
    await expect(prisma.planLessonRule.create({ data: { ...base, scope: "shared", lineage: "x", state: "draft" } })).rejects.toThrow()
    // A NULL list would read as "cites no PBI" and skip the confidentiality check: refused.
    const row = await prisma.planLessonRule.create({ data: base })
    await expect(prisma.$executeRaw`UPDATE "plan_lesson_rule" SET "sourceBacklogItemIds" = NULL WHERE "id" = ${row.id}`).rejects.toThrow()
  })
})
