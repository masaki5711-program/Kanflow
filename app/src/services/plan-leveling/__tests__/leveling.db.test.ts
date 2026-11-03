import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * 稼働量 and levelling (plan 12 E4) against a REAL PostgreSQL. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at
 * a migrated, disposable test database (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan-leveling/__tests__/leveling.db.test.ts
 *
 * Scenario (plan 12 §8.4): three synthetic people, two projects. u2 is busy in the OTHER project for a week; u3 works
 * half-time. After levelling no person-day is above capacity, the end moves only as far as capacity forces, and the
 * other project's item names never appear. The capacity rows are seeded in beforeAll, so every test stands alone.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

/** Mon–Fri day keys from `from` to `to` (inclusive). */
function weekdays(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = d(from).getTime(); t <= d(to).getTime(); t += 86_400_000) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

describe.skipIf(!enabled)("capacity and levelling on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `e4test-${Date.now().toString(36)}`
  const ids = { a: `${tag}-a`, b: `${tag}-b`, u1: `${tag}-u1`, u2: `${tag}-u2`, u3: `${tag}-u3`, mgr: `${tag}-mgr`, outsider: `${tag}-out`, section: `${tag}-sec` }
  const po = { userId: ids.u1, userName: "PO", systemRole: "member" }
  const u3self = { userId: ids.u3, userName: "u3", systemRole: "member" }

  let prisma: typeof import("@/lib/prisma").prisma
  let cap: typeof import("../capacity.service")
  let load: typeof import("../load.service")
  let u3Own: Awaited<ReturnType<typeof import("../capacity.service").createUserCapacity>>
  let u2Alloc: Awaited<ReturnType<typeof import("../capacity.service").createAllocation>>

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    cap = await import("../capacity.service")
    load = await import("../load.service")
    for (const u of [ids.u1, ids.u2, ids.u3, ids.mgr, ids.outsider]) {
      await prisma.user.create({ data: { id: u, name: u, email: `${u}@example.test`, password: "synthetic", role: u === ids.mgr ? "section_manager" : "member" } })
    }
    await prisma.section.create({ data: { id: ids.section, name: `${tag}-sec` } })
    await prisma.userSection.create({ data: { userId: ids.mgr, sectionId: ids.section } })
    await prisma.userSection.create({ data: { userId: ids.u3, sectionId: ids.section } })
    await prisma.project.create({ data: { id: ids.a, name: `${tag}-A` } })
    await prisma.project.create({ data: { id: ids.b, name: `${tag}-B` } })
    for (const [u, role] of [
      [ids.u1, "po"],
      [ids.u2, "dev"],
      [ids.u3, "dev"],
    ] as const)
      await prisma.projectMember.create({ data: { projectId: ids.a, userId: u, role } })
    await prisma.projectMember.create({ data: { projectId: ids.b, userId: ids.u2, role: "dev" } })
    await prisma.projectMember.create({ data: { projectId: ids.b, userId: ids.u1, role: "dev" } })
    await prisma.projectSection.create({ data: { projectId: ids.a, sectionId: ids.section } })
    // Project B: u2 holds a secret item Mon 11-02 .. Fri 11-06.
    await prisma.planItem.create({ data: { projectId: ids.b, name: "極秘の別案件（合成）", ownerId: ids.u2, plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-06") } })
    // Project B, January 2027 (outside the levelled weeks): rows dailyLoad must skip or count for u1.
    const jan = { projectId: ids.b, ownerId: ids.u1, plannedStart: d("2027-01-11"), plannedEnd: d("2027-01-15") }
    await prisma.planItem.create({ data: { ...jan, name: "done", status: "done" } })
    await prisma.planItem.create({ data: { ...jan, name: "on hold", status: "on_hold" } })
    await prisma.planItem.create({ data: { ...jan, name: "deleted", deletedAt: new Date() } })
    await prisma.planItem.create({ data: { ...jan, name: "milestone", isMilestone: true } })
    const parent = await prisma.planItem.create({ data: { ...jan, name: "parent" } })
    await prisma.planItem.create({ data: { ...jan, name: "child", parentId: parent.id } })
    // Project A's loaded base schedule: three dev items in parallel and one after.
    await prisma.planScheduleLoad.create({
      data: {
        projectId: ids.a,
        lineage: `${tag}-line`,
        scheduleHash: "b".repeat(64),
        skipWeekends: true,
        startDate: d("2026-11-02"),
        content: {
          items: [
            { key: "i1", name: "実装1", durationDays: 3, role: "dev" },
            { key: "i2", name: "実装2", durationDays: 3, role: "dev" },
            { key: "i3", name: "実装3", durationDays: 3, role: "dev" },
            { key: "test", name: "試験", durationDays: 2, role: "dev", dependsOn: ["i1", "i2", "i3"] },
            { key: "wait", name: "納期待ち", durationDays: 5, load: 0, role: "dev" },
          ],
        },
      },
    })
    // u3 works half-time (set by u3); u2 is allocated fully to A (set by the PO).
    u3Own = await cap.createUserCapacity(ids.u3, { from: "2026-11-01", to: null, fte: 0.5 }, u3self)
    u2Alloc = await cap.createAllocation(ids.a, { userId: ids.u2, from: "2026-11-01", to: null, fte: 1 }, po)
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.memberCapacityAudit.deleteMany({ where: { userId: { in: Object.values(ids) } } })
    await prisma.memberCapacity.deleteMany({ where: { userId: { in: Object.values(ids) } } })
    await prisma.planScheduleLoad.deleteMany({ where: { projectId: { in: [ids.a, ids.b] } } })
    await prisma.planItem.deleteMany({ where: { projectId: { in: [ids.a, ids.b] }, parentId: { not: null } } })
    await prisma.planItem.deleteMany({ where: { projectId: { in: [ids.a, ids.b] } } })
    await prisma.activityLog.deleteMany({ where: { projectId: { in: [ids.a, ids.b] } } })
    await prisma.projectSection.deleteMany({ where: { projectId: ids.a } })
    await prisma.projectMember.deleteMany({ where: { projectId: { in: [ids.a, ids.b] } } })
    await prisma.project.deleteMany({ where: { id: { in: [ids.a, ids.b] } } })
    await prisma.userSection.deleteMany({ where: { sectionId: ids.section } })
    await prisma.section.deleteMany({ where: { id: ids.section } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.u1, ids.u2, ids.u3, ids.mgr, ids.outsider] } } })
  })

  it("capacity: overlap refused (also on update, and for adjacent / open periods); members only; rows scoped", async () => {
    await expect(cap.createUserCapacity(ids.u3, { from: "2026-12-01", to: "2026-12-31", fte: 1 }, po)).rejects.toMatchObject({ code: "CAPACITY_OVERLAP" })
    // An allocation is a different series: it does not clash with the own FTE.
    expect(u2Alloc.projectId).toBe(ids.a)
    await expect(cap.createAllocation(ids.a, { userId: ids.outsider, from: "2026-11-01", fte: 1 }, po)).rejects.toMatchObject({ code: "CAPACITY_NOT_MEMBER" })
    // Adjacent periods are fine; the day after an end may start a new period.
    const before = await cap.createUserCapacity(ids.u1, { from: "2026-10-01", to: "2026-10-31", fte: 0.8 }, po)
    const next = await cap.createUserCapacity(ids.u1, { from: "2026-11-01", to: "2026-11-30", fte: 1 }, po)
    await expect(cap.createUserCapacity(ids.u1, { from: "2026-10-31", to: "2026-10-31", fte: 1 }, po)).rejects.toMatchObject({ code: "CAPACITY_OVERLAP" })
    // Moving a row onto its neighbour is an overlap too.
    await expect(cap.updateCapacity(next.id, { userId: ids.u1, projectId: null }, { from: "2026-10-15", to: "2026-11-30", fte: 1, version: next.version }, po)).rejects.toMatchObject({ code: "CAPACITY_OVERLAP" })
    // A stale version says "changed", not "overlap".
    await expect(cap.updateCapacity(next.id, { userId: ids.u1, projectId: null }, { from: "2026-10-15", to: "2026-11-30", fte: 1, version: next.version + 5 }, po)).rejects.toMatchObject({ code: "CAPACITY_CHANGED" })
    await cap.deleteCapacity(before.id, { userId: ids.u1, projectId: null }, before.version, po)
    await cap.deleteCapacity(next.id, { userId: ids.u1, projectId: null }, next.version, po)
    // po_sets_only_own_project_allocation: the row is not reachable through project B.
    await expect(cap.updateCapacity(u2Alloc.id, { projectId: ids.b }, { from: "2026-11-01", to: null, fte: 0.2, version: u2Alloc.version }, po)).rejects.toMatchObject({ code: "CAPACITY_NOT_FOUND" })
    // An own-FTE row is not reachable as an allocation, nor as another person's own row.
    await expect(cap.updateCapacity(u3Own.id, { projectId: ids.a }, { from: "2026-11-01", to: null, fte: 1, version: u3Own.version }, po)).rejects.toMatchObject({ code: "CAPACITY_NOT_FOUND" })
    await expect(cap.updateCapacity(u3Own.id, { userId: ids.u2, projectId: null }, { from: "2026-11-01", to: null, fte: 1, version: u3Own.version }, po)).rejects.toMatchObject({ code: "CAPACITY_NOT_FOUND" })
  })

  it("concurrent overlapping writes for one person: exactly one wins", async () => {
    const results = await Promise.allSettled([
      cap.createUserCapacity(ids.u2, { from: "2027-03-01", to: "2027-03-31", fte: 0.5 }, po),
      cap.createUserCapacity(ids.u2, { from: "2027-03-15", to: "2027-04-15", fte: 0.6 }, po),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CAPACITY_OVERLAP" } })
    const rows = await cap.listUserCapacity(ids.u2)
    for (const r of rows) await cap.deleteCapacity(r.id, { userId: ids.u2, projectId: null }, r.version, po)
  })

  it("every change leaves a durable trail with the values before and after (numbers only)", async () => {
    const trail = await prisma.memberCapacityAudit.findMany({ where: { capacityId: u3Own.id }, orderBy: { createdAt: "asc" } })
    expect(trail[0]).toMatchObject({ op: "create", userId: ids.u3, projectId: null, actorId: ids.u3, before: null, after: { from: "2026-11-01", to: null, fte: 0.5 } })
    const row = await prisma.memberCapacity.create({ data: { userId: ids.u1, from: d("2028-01-01"), to: d("2028-01-31"), fte: 0.4 } })
    const updated = await cap.updateCapacity(row.id, { userId: ids.u1, projectId: null }, { from: "2028-01-01", to: "2028-01-31", fte: 0.6, version: row.version }, po)
    await cap.deleteCapacity(row.id, { userId: ids.u1, projectId: null }, updated.version, po)
    const ops = await prisma.memberCapacityAudit.findMany({ where: { capacityId: row.id }, orderBy: { createdAt: "asc" }, select: { op: true, actorId: true, before: true, after: true } })
    expect(ops).toEqual([
      { op: "update", actorId: ids.u1, before: { from: "2028-01-01", to: "2028-01-31", fte: 0.4 }, after: { from: "2028-01-01", to: "2028-01-31", fte: 0.6 } },
      { op: "delete", actorId: ids.u1, before: { from: "2028-01-01", to: "2028-01-31", fte: 0.6 }, after: null },
    ])
    // An allocation change also shows in the project's history.
    expect(await prisma.activityLog.count({ where: { projectId: ids.a, diff: { contains: u2Alloc.id } } })).toBeGreaterThan(0)
  })

  it("capacity_has_no_free_text_note: neither table has a text column for a reason", async () => {
    const cols = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
      SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('member_capacity', 'member_capacity_audit')`
    const texty = (t: string) => cols.filter((c) => c.table_name === t && /text|character/.test(c.data_type)).map((c) => c.column_name).sort()
    expect(texty("member_capacity")).toEqual(["createdById", "id", "projectId", "userId"])
    expect(texty("member_capacity_audit")).toEqual(["actorId", "capacityId", "id", "op", "projectId", "userId"])
  })

  it("the section manager of the person's section is recognised (canManageUserCapacity input)", async () => {
    expect(await cap.sharesSectionAsManager(ids.mgr, "section_manager", ids.u3)).toBe(true)
    expect(await cap.sharesSectionAsManager(ids.mgr, "section_manager", ids.u2)).toBe(false)
    expect(await cap.sharesSectionAsManager(ids.u1, "member", ids.u3)).toBe(false)
  })

  it("capacityRows: own FTE (default 1.0, open end) capped by the allocation, inclusive bounds", async () => {
    const row = await prisma.memberCapacity.create({ data: { userId: ids.u1, projectId: ids.a, from: d("2029-01-10"), to: d("2029-01-20"), fte: 0.3 } })
    const own = await prisma.memberCapacity.create({ data: { userId: ids.u1, from: d("2029-01-15"), to: d("2029-01-31"), fte: 0.8 } })
    const c = await cap.capacityRows([ids.u1, ids.u3], ids.a)
    expect(c.ownFte(ids.u3, "2030-01-01")).toBe(0.5) // open-ended own row
    expect(c.ownFte(ids.u1, "2029-01-14")).toBe(1) // no own row that day
    expect(c.ownFte(ids.u1, "2029-01-15")).toBe(0.8) // first day included
    expect(c.ownFte(ids.u1, "2029-01-31")).toBe(0.8) // last day included
    expect(c.fte(ids.u1, "2029-01-20")).toBe(0.3) // allocation caps the own FTE
    expect(c.fte(ids.u1, "2029-01-21")).toBe(0.8) // the allocation has ended
    await prisma.memberCapacity.deleteMany({ where: { id: { in: [row.id, own.id] } } })
  })

  it("dailyLoad counts live, unfinished leaves only (not done, on hold, deleted, parents, milestones) and can exclude a project", async () => {
    const l = await load.dailyLoad([ids.u1], "2027-01-11", "2027-01-15")
    // Only the child leaf counts; the milestone is held but takes nothing.
    expect(l.get(ids.u1)?.get(Math.floor(d("2027-01-12").getTime() / 86_400_000))).toEqual({ load: 1, count: 1 })
    const excluded = await load.dailyLoad([ids.u1, ids.u2], "2026-11-01", "2027-01-31", { excludeProjectId: ids.b })
    expect(excluded.size).toBe(0)
  })

  it("no_user_exceeds_capacity_after_leveling (§8.4): per-person days recomputed from the placements; end set by capacity only", async () => {
    const r = await load.levelProject(ids.a, { startDate: "2026-11-02", roleAssignments: { dev: [ids.u1, ids.u2, ids.u3] } })
    expect(r.after.every((s) => s.daysOverCapacity === 0)).toBe(true)
    // Recompute independently: a load-1 item fills the person's day (whatever their FTE), and u2's day is already full
    // in project B the first week. No person-day may hold more than one.
    const busyInB = new Set(weekdays("2026-11-02", "2026-11-06"))
    const held = new Map<string, number>()
    for (const p of r.placements) {
      if (p.key === "wait") continue // ℓ = 0
      for (const part of p.split ?? [p]) {
        if (!part.owner) continue
        for (const day of weekdays(part.start, part.end)) held.set(`${part.owner.userId}|${day}`, (held.get(`${part.owner.userId}|${day}`) ?? 0) + 1)
      }
    }
    for (const [k, n] of held) {
      const [u, day] = k.split("|")
      expect(n + (u === ids.u2 && busyInB.has(day) ? 1 : 0), k).toBeLessThanOrEqual(1)
    }
    // The half-time person can hold work (at their pace): u3 is given at least one of the build items.
    expect(r.placements.some((p) => p.key.startsWith("i") && p.owner?.userId === ids.u3)).toBe(true)
    // Three builds for two free people in week 1: one build waits until Thu 11-05 (ends Mon 11-09), then the test
    // (2 days). The end moves by exactly that.
    expect(r.plannedEnd).toBe("2026-11-11")
    const lastBuild = r.placements.filter((p) => p.key.startsWith("i")).map((p) => p.end).sort().at(-1) ?? ""
    expect((r.placements.find((p) => p.key === "test")?.start ?? "") > lastBuild).toBe(true)
    const json = JSON.stringify(r)
    expect(json).not.toContain("極秘の別案件")
    expect(json).not.toContain(ids.b)
  })

  it("role_assignment_outside_project_rejected and section_manager_not_member_cannot_be_assigned", async () => {
    await expect(load.levelProject(ids.a, { startDate: "2026-11-02", roleAssignments: { dev: [ids.u1, ids.outsider] } })).rejects.toMatchObject({ code: "PLAN_ROLE_ASSIGNMENT_INVALID" })
    // The section manager sees project A through the section but is no explicit member.
    await expect(load.levelProject(ids.a, { startDate: "2026-11-02", roleAssignments: { dev: [ids.mgr] } })).rejects.toMatchObject({ code: "PLAN_ROLE_ASSIGNMENT_INVALID" })
  })

  it("member_cannot_see_others_load; po_sees_utilization_but_not_other_project_names; the FTE itself is not shown", async () => {
    const own = await load.memberLoad(ids.a, { userId: ids.u2, canViewOthers: false }, { from: "2026-11-02", to: "2026-11-13" })
    expect(own.map((m) => m.userId)).toEqual([ids.u2])
    // u2 holds B's item all of the first week: busy every working day of it, free the second.
    expect(own[0].days.filter((x) => x.date <= "2026-11-06").every((x) => x.utilization === 1)).toBe(true)
    expect(own[0].days.filter((x) => x.date > "2026-11-06").every((x) => x.utilization === 0)).toBe(true)
    expect(own[0]).toMatchObject({ maxUtilization: 1, daysOver: 0, overlapDays: 0 })
    const all = await load.memberLoad(ids.a, { userId: ids.u1, canViewOthers: true }, { from: "2026-11-02", to: "2026-11-13" })
    expect(all.map((m) => m.userId).sort()).toEqual([ids.u1, ids.u2, ids.u3].sort())
    // u3 is half-time but free: nothing in the response depends on the 0.5.
    expect(all.find((m) => m.userId === ids.u3)).toMatchObject({ maxUtilization: 0, daysOver: 0 })
    const json = JSON.stringify(all)
    expect(json).not.toContain("極秘の別案件")
    expect(json).not.toContain(ids.b)
    expect(json).not.toContain("0.5")
  })

  it("a day without time (own FTE 0) that holds a leaf shows as over, like a double booking", async () => {
    const off = await prisma.memberCapacity.create({ data: { userId: ids.u1, from: d("2027-01-11"), to: d("2027-01-12"), fte: 0 } })
    const rows = await load.memberLoad(ids.b, { userId: ids.u1, canViewOthers: false }, { from: "2027-01-11", to: "2027-01-15" })
    expect(rows[0].days.map((x) => x.utilization)).toEqual([2, 2, 1, 1, 1])
    // Same counts as a double booking: daysOver and overlapDays never tell leave from overbooking.
    expect(rows[0]).toMatchObject({ maxUtilization: 2, daysOver: 2, overlapDays: 2 })
    await prisma.memberCapacity.delete({ where: { id: off.id } })
  })
})
