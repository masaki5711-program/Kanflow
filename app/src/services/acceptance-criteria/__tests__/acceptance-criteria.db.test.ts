import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * Seq allocation of 受入基準 against a REAL MariaDB / MySQL (the rest of the suite mocks Prisma).
 * Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database
 * (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 DATABASE_PASSWORD=... DATABASE_NAME=kanflow_test npx vitest run src/services/acceptance-criteria/__tests__/acceptance-criteria.db.test.ts
 *
 * Checks what the PBI row lock + READ COMMITTED transaction exist for: concurrent adds get distinct
 * seqs, a deleted item's seq is never handed out again, and (pbiId, seq) is unique.
 * Re-run at the PostgreSQL migration (the lock is a raw `SELECT ... FOR UPDATE`).
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("acceptance criteria on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `w5test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, pbi: `${tag}-b` }
  const actor = { userId: `${tag}-u`, userName: "synthetic", systemRole: "member" }

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../acceptance-criteria.service")

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../acceptance-criteria.service")
    await prisma.user.create({ data: { id: actor.userId, name: actor.userId, email: `${actor.userId}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: ids.project, name: tag } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbi, projectId: ids.project, displayId: 7, initiative: "synthetic" } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.acceptanceCriterion.deleteMany({ where: { pbiId: ids.pbi } })
    await prisma.productBacklogItem.deleteMany({ where: { id: ids.pbi } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
    await prisma.user.deleteMany({ where: { id: actor.userId } })
  })

  it("ten concurrent adds get seqs 1..10 exactly once", async () => {
    const dtos = await Promise.all(Array.from({ length: 10 }, (_, i) => svc.createAcceptanceCriterion(ids.project, ids.pbi, { text: `item ${i}` }, actor)))
    expect(dtos.map((d) => d.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(dtos[0].id).toMatch(/^PBI-7\/AC-\d+$/)
  })

  it("after a soft delete the number is not reused; the unique index refuses a duplicate", async () => {
    await svc.deleteAcceptanceCriterion(ids.project, ids.pbi, "AC-10", actor)
    expect((await svc.createAcceptanceCriterion(ids.project, ids.pbi, { text: "next" }, actor)).seq).toBe(11)
    await expect(prisma.acceptanceCriterion.create({ data: { pbiId: ids.pbi, seq: 11, text: "dup" } })).rejects.toBeTruthy()
  })

  it("rows go with the PBI (ON DELETE CASCADE)", async () => {
    await prisma.productBacklogItem.create({ data: { id: `${ids.pbi}2`, projectId: ids.project, displayId: 8, initiative: "synthetic" } })
    await prisma.acceptanceCriterion.create({ data: { pbiId: `${ids.pbi}2`, seq: 1, text: "x" } })
    await prisma.productBacklogItem.delete({ where: { id: `${ids.pbi}2` } })
    expect(await prisma.acceptanceCriterion.count({ where: { pbiId: `${ids.pbi}2` } })).toBe(0)
  })
})
