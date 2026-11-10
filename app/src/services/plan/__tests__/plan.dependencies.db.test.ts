import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * Plan dependencies against a REAL PostgreSQL (the rest of the suite mocks the repository). Skipped unless
 * KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (synthetic rows only, removed
 * afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan/__tests__/plan.dependencies.db.test.ts
 *
 * What it pins (the things mocks cannot show): the per-project writer lock is SQL the database accepts, and two
 * writers whose additions would close a cycle together never both commit (web UI and MCP set_plan_dependencies run
 * the same code); a refused replacement leaves the stored list as it was; a delete racing a replacement of the same
 * dependency ends cleanly on both sides.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("plan dependencies on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `deptest-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, po: `${tag}-po`, a: `${tag}-a`, b: `${tag}-b`, c: `${tag}-c` }
  const actor = { userId: ids.po, userName: "PO", systemRole: "member" }

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../plan.schedule")

  const stored = async () =>
    (await prisma.planItemDependency.findMany({ where: { projectId: ids.project }, select: { predecessorId: true, successorId: true } }))
      .map((e) => `${e.predecessorId.slice(tag.length + 1)}>${e.successorId.slice(tag.length + 1)}`)
      .sort()

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../plan.schedule")
    await prisma.user.create({ data: { id: ids.po, name: ids.po, email: `${ids.po}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: ids.project, name: tag } })
    await prisma.planItem.createMany({ data: [ids.a, ids.b, ids.c].map((id, i) => ({ id, projectId: ids.project, name: id, sortOrder: i })) })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.planItem.deleteMany({ where: { projectId: ids.project } })
    await prisma.activityLog.deleteMany({ where: { projectId: ids.project } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
    await prisma.user.deleteMany({ where: { id: ids.po } })
  })

  it("replaces the predecessor list and writes each change to the activity history", async () => {
    await expect(svc.setPredecessors(ids.project, ids.c, [ids.a, ids.b], actor)).resolves.toEqual({ successorId: ids.c, dependsOn: [ids.a, ids.b], added: 2, removed: 0, removedIds: [] })
    await expect(svc.setPredecessors(ids.project, ids.c, [ids.b], actor)).resolves.toMatchObject({ added: 0, removed: 1, removedIds: [ids.a] })
    expect(await stored()).toEqual(["b>c"])
    const log = await prisma.activityLog.findMany({ where: { projectId: ids.project, entityId: ids.c } })
    expect(log).toHaveLength(3)
  })

  it("a refused replacement (cycle) leaves the stored list as it was", async () => {
    await expect(svc.setPredecessors(ids.project, ids.b, [ids.c], actor)).rejects.toMatchObject({ code: "PLAN_DEPENDENCY_CYCLE" })
    expect(await stored()).toEqual(["b>c"])
    // A replacement that would both remove (b) and add (the item itself: refused) removes nothing.
    await expect(svc.setPredecessors(ids.project, ids.c, [ids.c], actor)).rejects.toMatchObject({ code: "PLAN_DEPENDENCY_INVALID" })
    expect(await stored()).toEqual(["b>c"])
  })

  it("a delete racing a replacement of the same dependency: the replacement commits, the delete succeeds or finds it gone (every round)", async () => {
    for (let round = 0; round < 8; round++) {
      await prisma.planItemDependency.deleteMany({ where: { projectId: ids.project } })
      const edge = await prisma.planItemDependency.create({ data: { projectId: ids.project, predecessorId: ids.a, successorId: ids.c } })
      const [removed, replaced] = await Promise.allSettled([
        svc.deleteDependency(ids.project, edge.id, actor),
        svc.setPredecessors(ids.project, ids.c, [ids.b], actor),
      ])
      expect(replaced.status).toBe("fulfilled")
      if (removed.status === "rejected") expect(removed.reason).toMatchObject({ status: 404 })
      expect(await stored()).toEqual(["b>c"])
    }
  })

  it("two writers that would close a cycle together: one commits, the other is refused (every round)", async () => {
    for (let round = 0; round < 8; round++) {
      await prisma.planItemDependency.deleteMany({ where: { projectId: ids.project } })
      // a → b and b → a are each valid alone; together they are a cycle.
      const results = await Promise.allSettled([
        svc.setPredecessors(ids.project, ids.b, [ids.a], actor),
        svc.createDependency(ids.project, { predecessorId: ids.b, successorId: ids.a }, actor),
      ])
      const refused = results.filter((r) => r.status === "rejected")
      expect(refused).toHaveLength(1)
      expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({ code: "PLAN_DEPENDENCY_CYCLE" })
      expect(await stored()).toHaveLength(1)
    }
  })
})
