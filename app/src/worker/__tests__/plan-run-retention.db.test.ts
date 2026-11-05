import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * Estimate-run retention against a REAL PostgreSQL: a run past its purgeAfter goes, with its feedback (ON DELETE
 * CASCADE); a run before it stays. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable
 * test database (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/worker/__tests__/plan-run-retention.db.test.ts
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"
// Dates long past: the sweep is global, and every real run (including those other DB test files make meanwhile)
// expires a year after it was made, so nothing but these rows is touched.
const NOW = new Date("2020-01-02T00:00:00.000Z")

describe.skipIf(!enabled)("estimate-run retention on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `retest-${Date.now().toString(36)}`
  const project = `${tag}-p`
  const user = `${tag}-u`
  let prisma: typeof import("@/lib/prisma").prisma

  const run = (id: string, purgeAfter: Date) => ({
    id,
    projectId: project,
    createdById: user,
    // As the service makes them: created a year before purgeAfter, approvable for 24 h (plan_estimate_run_lifetime_chk).
    createdAt: new Date(purgeAfter.getTime() - 365 * 86_400_000),
    expiresAt: new Date(purgeAfter.getTime() - 364 * 86_400_000),
    purgeAfter,
    referenceDate: new Date("2026-11-01T00:00:00.000Z"),
    startDate: new Date("2026-11-09T00:00:00.000Z"),
    lineage: `${tag}-line`,
    projectType: "general",
    templateHash: "a".repeat(64),
    inputHash: "b".repeat(64),
    methodVersion: "e5-v1",
    gateOn: false,
    schedule: {},
    summary: {},
    evidence: {},
    ownerPlan: {},
    engineInput: {},
  })

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    await prisma.user.create({ data: { id: user, name: user, email: `${user}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: project, name: `${tag}-名前` } })
    await prisma.planEstimateRun.create({ data: run(`${tag}-old`, new Date("2020-01-01T00:00:00.000Z")) })
    await prisma.planEstimateRun.create({ data: run(`${tag}-new`, new Date("2020-01-03T00:00:00.000Z")) })
    for (const runId of [`${tag}-old`, `${tag}-new`]) await prisma.planEstimateFeedback.create({ data: { runId, key: "build", kind: "too_low", userId: user } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.planEstimateRun.deleteMany({ where: { projectId: project } })
    await prisma.project.deleteMany({ where: { id: project } })
    await prisma.user.deleteMany({ where: { id: user } })
  })

  it("deletes only the run past its deadline, and its feedback with it", async () => {
    const { purgeExpiredEstimateRuns } = await import("../jobs/plan-run-retention")
    const out = await purgeExpiredEstimateRuns({ now: () => NOW })
    expect(out.estimateRuns.deleted).toBeGreaterThanOrEqual(1)
    const left = await prisma.planEstimateRun.findMany({ where: { projectId: project }, select: { id: true } })
    expect(left.map((r) => r.id)).toEqual([`${tag}-new`])
    const feedback = await prisma.planEstimateFeedback.findMany({ where: { runId: { in: [`${tag}-old`, `${tag}-new`] } }, select: { runId: true } })
    expect(feedback.map((f) => f.runId)).toEqual([`${tag}-new`])
  })
})
