import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  global: {
    fieldTranslation: { deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  aiLog: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: m.global }))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: m.aiLog }))

const svc = await import("@/lib/translation/service")

function fakeTx() {
  return { fieldTranslation: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) }, $executeRaw: vi.fn() }
}

describe("translation service — write side", () => {
  beforeEach(() => vi.clearAllMocks())

  it("picks only translatable fields present in the record", () => {
    expect(svc.pickTranslatableFields("product_goal", { title: "T", description: null, projectId: "p" })).toEqual({
      title: "T",
      description: null,
    })
  })

  it("A3-02: treats present-but-undefined keys as 'not changed' (only explicit null / '' clears)", () => {
    expect(svc.pickTranslatableFields("sprint_task", { taskName: undefined, completionComment: null, status: "done" })).toEqual({
      completionComment: null,
    })
  })

  it("A3-02: a status-only patch with undefined text keys neither deletes nor upserts rows", async () => {
    const tx = fakeTx()
    await svc.enqueueTranslations("sprint_task", "t1", { taskName: undefined, completionComment: undefined, status: "done" }, tx as never)
    expect(tx.fieldTranslation.deleteMany).not.toHaveBeenCalled()
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it("enqueues on the given transaction client, not the global one", async () => {
    const tx = fakeTx()
    await svc.enqueueTranslations("product_goal", "g1", { title: "目標", description: "" }, tx as never)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.fieldTranslation.deleteMany).toHaveBeenCalledWith({
      where: { entityType: "product_goal", entityId: "g1", field: "description" },
    })
    expect(m.global.$executeRaw).not.toHaveBeenCalled()
  })

  it("stamps requested_at/updated_at in UTC to match Prisma-written timestamps", async () => {
    const tx = fakeTx()
    await svc.enqueueTranslations("product_goal", "g1", { title: "目標" }, tx as never)
    const sql = (tx.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join("?")
    expect(sql).toContain("UTC_TIMESTAMP(3)")
    expect(sql).not.toContain("NOW(")
  })

  it("keeps the old signature working (global client)", async () => {
    await svc.enqueueTranslations("sprint", "s1", { sprintName: "Sprint 1" })
    expect(m.global.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it("never throws from enqueueTranslations", async () => {
    const tx = fakeTx()
    tx.$executeRaw.mockRejectedValue(new Error("db down"))
    await expect(svc.enqueueTranslations("sprint", "s1", { sprintName: "x" }, tx as never)).resolves.toBeUndefined()
    expect(m.aiLog).toHaveBeenCalledWith("XLATE_ENQUEUE", expect.stringContaining("db down"))
  })

  it("deleteTranslationsForMany de-duplicates, chunks and throws on failure", async () => {
    const tx = fakeTx()
    const ids = Array.from({ length: 1500 }, (_, i) => `id${i}`)
    await expect(svc.deleteTranslationsForMany("backlog_item", [...ids, "id1", ""], tx as never)).resolves.toBe(4)
    expect(tx.fieldTranslation.deleteMany).toHaveBeenCalledTimes(2)
    expect(await svc.deleteTranslationsForMany("backlog_item", [], tx as never)).toBe(0)
    tx.fieldTranslation.deleteMany.mockRejectedValue(new Error("fail"))
    await expect(svc.deleteTranslationsForMany("sprint", ["a"], tx as never)).rejects.toThrow("fail")
  })

  it("deleteTranslationsFor stays best-effort", async () => {
    const tx = fakeTx()
    tx.fieldTranslation.deleteMany.mockRejectedValue(new Error("fail"))
    await expect(svc.deleteTranslationsFor("sprint", "s1", tx as never)).resolves.toBeUndefined()
  })
})

describe("purgeOrphanTranslations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("counts per entity in dry-run mode without deleting", async () => {
    m.global.$queryRaw.mockImplementation(async () => [{ n: BigInt(1) }])
    const out = await svc.purgeOrphanTranslations({ dryRun: true })
    expect(out.dryRun).toBe(true)
    expect(out.total).toBe(13)
    expect(out.byEntity.project).toBe(1)
    expect(m.global.$executeRaw).not.toHaveBeenCalled()
  })

  it("deletes in batches until a short batch", async () => {
    m.global.$executeRaw.mockResolvedValueOnce(5000).mockResolvedValueOnce(3).mockResolvedValue(0)
    const out = await svc.purgeOrphanTranslations()
    expect(out).toEqual({ dryRun: false, byEntity: { project: 5003 }, total: 5003 })
    expect(m.global.$executeRaw).toHaveBeenCalledTimes(14)
    expect(m.global.$queryRaw).not.toHaveBeenCalled()
  })
})

describe("backfillTranslations", () => {
  beforeEach(() => vi.clearAllMocks())

  function backfillOne(txRows: Array<{ txt: string | null }>) {
    // Only the very first (entity, field) scan finds a candidate.
    m.global.$queryRaw.mockResolvedValueOnce([{ id: "e1", txt: "古い" }]).mockResolvedValue([])
    const tx = { $queryRaw: vi.fn().mockResolvedValue(txRows), $executeRaw: vi.fn(), fieldTranslation: { deleteMany: vi.fn() } }
    m.global.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx))
    return tx
  }

  it("skips (creates nothing) when the entity was deleted after the scan", async () => {
    const tx = backfillOne([])
    await expect(svc.backfillTranslations(5)).resolves.toBe(0)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(m.global.$executeRaw).not.toHaveBeenCalled()
  })

  it("enqueues inside the locking transaction with the text re-read under the lock", async () => {
    const tx = backfillOne([{ txt: "新しい" }])
    await expect(svc.backfillTranslations(5)).resolves.toBe(1)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw.mock.calls[0]).toContain("新しい")
    expect(m.global.$executeRaw).not.toHaveBeenCalled()
  })

  it("A3-03: never backfills soft-deleted comments (live filter on the scan and the re-read)", async () => {
    m.global.$queryRaw.mockResolvedValue([])
    await svc.backfillTranslations(5)
    const scans = m.global.$queryRaw.mock.calls.map((c) => JSON.stringify(c))
    const commentScan = scans.find((c) => c.includes('"comment"') && c.includes('"body"'))
    expect(commentScan).toContain("t.`deletedAt` IS NULL")
    const pbiScan = scans.find((c) => c.includes('"backlog_item"'))
    expect(pbiScan).not.toContain("deletedAt")
  })
})
