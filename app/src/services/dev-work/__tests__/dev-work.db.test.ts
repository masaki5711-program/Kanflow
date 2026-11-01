import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * Concurrency of work claims against a REAL MariaDB / MySQL (the rest of the suite
 * mocks Prisma). Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a
 * migrated, disposable test database (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 DATABASE_PASSWORD=... DATABASE_NAME=kanflow_test npx vitest run src/services/dev-work/__tests__/dev-work.db.test.ts
 *
 * It checks the property the PBI row lock + READ COMMITTED transaction exist for:
 * concurrent first claims of one target never both win.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("work claims on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `k5test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, pbi: `${tag}-b`, users: Array.from({ length: 6 }, (_, i) => `${tag}-u${i}`) }

  let prisma: typeof import("@/lib/prisma").prisma
  let claimWork: typeof import("../dev-work.service").claimWork

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    claimWork = (await import("../dev-work.service")).claimWork
    await prisma.user.createMany({ data: ids.users.map((id) => ({ id, name: id, email: `${id}@example.test`, password: "synthetic" })) })
    await prisma.project.create({ data: { id: ids.project, name: tag } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbi, projectId: ids.project, displayId: 1, initiative: "synthetic" } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.workClaim.deleteMany({ where: { projectId: ids.project } })
    await prisma.productBacklogItem.deleteMany({ where: { id: ids.pbi } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
  })

  it("six users claiming the same PBI at once: exactly one wins, the others get TASK_CLAIMED", async () => {
    const results = await Promise.allSettled(
      ids.users.map((userId) => claimWork(ids.project, { pbi: ids.pbi, sessionId: `s-${userId}` }, { userId, userName: userId, systemRole: "member" })),
    )
    const won = results.filter((r) => r.status === "fulfilled")
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(won).toHaveLength(1)
    for (const r of refused) expect(r.reason).toMatchObject({ code: "TASK_CLAIMED" })
    expect(await prisma.workClaim.count({ where: { backlogItemId: ids.pbi, releasedAt: null } })).toBe(1)
  })

  it("a sprint board read (findOpenClaimsOfSprint) finds the sprint's task claims and whole-PBI claims, nothing else", async () => {
    const repo = await import("../dev-work.repository")
    const s = { sprint: `${tag}-s`, other: `${tag}-s2`, pbi2: `${tag}-b2`, t1: `${tag}-t1`, t2: `${tag}-t2` }
    const now = new Date()
    await prisma.productBacklogItem.create({ data: { id: s.pbi2, projectId: ids.project, displayId: 2, initiative: "synthetic" } })
    await prisma.sprint.createMany({
      data: [s.sprint, s.other].map((id) => ({ id, projectId: ids.project, sprintName: id, startDate: now, endDate: now })),
    })
    await prisma.sprintBacklogItem.createMany({
      data: [
        { id: s.t1, sprintId: s.sprint, pbItemId: ids.pbi, taskName: "synthetic" },
        { id: s.t2, sprintId: s.other, pbItemId: s.pbi2, taskName: "synthetic" },
      ],
    })
    const base = { projectId: ids.project, userId: ids.users[0], heartbeatAt: now }
    await prisma.workClaim.createMany({
      data: [
        { ...base, id: `${tag}-c1`, backlogItemId: ids.pbi, taskId: s.t1, sessionId: "a" },
        { ...base, id: `${tag}-c3`, backlogItemId: s.pbi2, taskId: s.t2, sessionId: "c" },
        { ...base, id: `${tag}-c4`, backlogItemId: s.pbi2, taskId: null, sessionId: "d" },
      ],
    })
    const rows = await repo.findOpenClaimsOfSprint(prisma, ids.project, s.sprint, new Date(now.getTime() - 3_600_000))
    // The sprint's task claim + the earlier test's whole-PBI claim on the same PBI; not the other sprint's PBI.
    expect(rows.map((r) => r.id)).toContain(`${tag}-c1`)
    expect(rows.every((r) => r.backlogItemId === ids.pbi)).toBe(true)
    expect(rows.some((r) => r.taskId === null)).toBe(true)
    await prisma.sprintBacklogItem.deleteMany({ where: { id: { in: [s.t1, s.t2] } } })
    await prisma.sprint.deleteMany({ where: { id: { in: [s.sprint, s.other] } } })
    await prisma.workClaim.deleteMany({ where: { backlogItemId: s.pbi2 } })
    await prisma.productBacklogItem.deleteMany({ where: { id: s.pbi2 } })
  })
})
