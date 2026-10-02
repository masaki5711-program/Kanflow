import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  global: {
    fieldTranslation: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  aiLog: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: m.global }))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: m.aiLog }))

const svc = await import("@/lib/translation/service")

/** Flatten a tagged-template call ([strings, ...values]) into the bound values. */
function boundValues(call: unknown[]): unknown[] {
  return call.slice(1)
}

beforeEach(() => vi.clearAllMocks())

describe("read side", () => {
  it("getI18nFor returns an empty map for no ids without querying", async () => {
    const out = await svc.getI18nFor("backlog_item", ["", ""])
    expect(out.size).toBe(0)
    expect(m.global.fieldTranslation.findMany).not.toHaveBeenCalled()
  })

  it("getI18nFor groups rows per entity and de-duplicates ids", async () => {
    m.global.fieldTranslation.findMany.mockResolvedValue([
      { entityId: "a", field: "userStory", textJa: "話", textId: "cerita", textEn: null, sourceLocale: "ja", status: "done" },
      { entityId: "a", field: "epic", textJa: null, textId: "epik", textEn: "epic (en)", sourceLocale: "id", status: "pending" },
      { entityId: "b", field: "userStory", textJa: "x", textId: null, textEn: null, sourceLocale: "ja", status: "failed" },
    ])
    const out = await svc.getI18nFor("backlog_item", ["a", "b", "a"])
    expect(m.global.fieldTranslation.findMany).toHaveBeenCalledWith({
      where: { entityType: "backlog_item", entityId: { in: ["a", "b"] } },
      select: { entityId: true, field: true, textJa: true, textId: true, textEn: true, sourceLocale: true, status: true },
    })
    expect(out.get("a")).toEqual({
      userStory: { ja: "話", id: "cerita", en: null, source: "ja", status: "done" },
      epic: { ja: null, id: "epik", en: "epic (en)", source: "id", status: "pending" },
    })
    expect(out.get("b")?.userStory?.status).toBe("failed")
  })

  it("attachI18n adds i18n (empty object when missing) without mutating input", async () => {
    m.global.fieldTranslation.findMany.mockResolvedValue([
      { entityId: "1", field: "title", textJa: "目標", textId: "tujuan", sourceLocale: "ja", status: "done" },
    ])
    const rows = [{ id: "1", title: "目標" }, { id: "2", title: "x" }]
    const out = await svc.attachI18n("product_goal", rows)
    expect(out[0].i18n.title?.id).toBe("tujuan")
    expect(out[1].i18n).toEqual({})
    expect(rows[0]).not.toHaveProperty("i18n")
  })

  it("attachI18nOne supports a custom id key", async () => {
    m.global.fieldTranslation.findMany.mockResolvedValue([])
    const out = await svc.attachI18nOne("project", { projectId: "p1", name: "n" }, "projectId")
    expect(out).toEqual({ projectId: "p1", name: "n", i18n: {} })
    expect(m.global.fieldTranslation.findMany.mock.calls[0][0].where.entityId).toEqual({ in: ["p1"] })
  })
})

describe("admin counts", () => {
  it("translationCounts aggregates statuses and the last error", async () => {
    m.global.fieldTranslation.groupBy.mockResolvedValue([
      { status: "pending", _count: { _all: 3 } },
      { status: "failed", _count: { _all: 1 } },
    ])
    const at = new Date("2026-02-03T00:00:00Z")
    m.global.fieldTranslation.findFirst.mockResolvedValue({
      entityType: "project",
      entityId: "p1",
      field: "name",
      lastError: "timeout",
      updatedAt: at,
    })
    expect(await svc.translationCounts()).toEqual({
      pending: 3,
      running: 0,
      done: 0,
      failed: 1,
      lastError: { entityType: "project", entityId: "p1", field: "name", error: "timeout", at: at.toISOString() },
    })
  })

  it("translationCounts reports null lastError when none", async () => {
    m.global.fieldTranslation.groupBy.mockResolvedValue([])
    m.global.fieldTranslation.findFirst.mockResolvedValue(null)
    const out = await svc.translationCounts()
    expect(out).toMatchObject({ pending: 0, done: 0, lastError: null })
  })

  it("translationCounts coerces a null lastError message to empty string", async () => {
    m.global.fieldTranslation.groupBy.mockResolvedValue([])
    m.global.fieldTranslation.findFirst.mockResolvedValue({
      entityType: "p", entityId: "e", field: "f", lastError: null, updatedAt: new Date(0),
    })
    expect((await svc.translationCounts()).lastError?.error).toBe("")
  })

  it("retryFailedTranslations requeues failed rows", async () => {
    m.global.fieldTranslation.updateMany.mockResolvedValue({ count: 4 })
    expect(await svc.retryFailedTranslations()).toEqual({ requeued: 4 })
    expect(m.global.fieldTranslation.updateMany).toHaveBeenCalledWith({
      where: { status: "failed" },
      data: expect.objectContaining({ status: "pending", attempts: 0, lastError: null }),
    })
  })
})

describe("enqueueNow branches", () => {
  it("skips undefined and unknown fields, deletes blank ones", async () => {
    await svc.enqueueNow("project", "p1", { name: undefined, bogus: "x", description: "   " })
    expect(m.global.fieldTranslation.deleteMany).toHaveBeenCalledWith({
      where: { entityType: "project", entityId: "p1", field: "description" },
    })
    expect(m.global.$executeRaw).not.toHaveBeenCalled()
  })

  it("treats null as delete", async () => {
    await svc.enqueueNow("project", "p1", { name: null })
    expect(m.global.fieldTranslation.deleteMany).toHaveBeenCalledTimes(1)
  })

  it("stores legacy JA/ID pairs as pending (English side still missing, no translatedAt)", async () => {
    await svc.enqueueNow("project", "p1", { name: "改善プロジェクト\nProyek perbaikan" })
    const values = boundValues(m.global.$executeRaw.mock.calls[0])
    expect(values).toContain("改善プロジェクト")
    expect(values).toContain("Proyek perbaikan")
    expect(values).toContain("pending")
    expect(values).not.toContain("done")
    expect(values).toContain("legacy-pairs")
    // translatedAt is the last bound value and stays null until English exists.
    expect(values[values.length - 1]).toBeNull()
  })

  it("stores an English source in text_en as pending, with ja/id left null", async () => {
    const text = "We should check this with the supervisor before we continue"
    await svc.enqueueNow("project", "p1", { name: text })
    const values = boundValues(m.global.$executeRaw.mock.calls[0])
    expect(values).toContain("en")
    expect(values).toContain("pending")
    expect(values).toContain(text)
    // Bound order: entityType, entityId, field, source, hash, textJa, textId, textEn, status, priority, model, translatedAt.
    expect(values[5]).toBeNull()
    expect(values[6]).toBeNull()
    expect(values[7]).toBe(text)
  })

  it("stores Indonesian text in text_id as pending", async () => {
    await svc.enqueueNow("project", "p1", { name: "Proyek perbaikan kualitas" })
    const values = boundValues(m.global.$executeRaw.mock.calls[0])
    expect(values).toContain("id")
    expect(values).toContain("pending")
    expect(values).toContain("Proyek perbaikan kualitas")
  })

  it("enqueueTranslations logs non-Error failures", async () => {
    m.global.$executeRaw.mockRejectedValue("nope")
    await svc.enqueueTranslations("project", "p1", { name: "x" })
    expect(m.aiLog).toHaveBeenCalledWith("XLATE_ENQUEUE", expect.stringContaining("nope"))
  })
})

describe("backfillTranslations limits", () => {
  it("stops scanning when the limit is exhausted and logs the count", async () => {
    m.global.$queryRaw.mockResolvedValue([{ id: "e1", txt: "テキスト" }])
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ txt: "テキスト" }]), $executeRaw: vi.fn(), fieldTranslation: { deleteMany: vi.fn() } }
    m.global.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx))
    await expect(svc.backfillTranslations(2)).resolves.toBe(2)
    expect(m.global.$queryRaw).toHaveBeenCalledTimes(2)
    expect(m.aiLog).toHaveBeenCalledWith("XLATE_BACKFILL", "enqueued 2 field(s)")
  })

  it("does nothing with a zero limit", async () => {
    await expect(svc.backfillTranslations(0)).resolves.toBe(0)
    expect(m.global.$queryRaw).not.toHaveBeenCalled()
    expect(m.aiLog).not.toHaveBeenCalled()
  })

  it("skips candidates whose re-read text is blank", async () => {
    m.global.$queryRaw.mockResolvedValueOnce([{ id: "e1", txt: "x" }]).mockResolvedValue([])
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ txt: "   " }]), $executeRaw: vi.fn() }
    m.global.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx))
    await expect(svc.backfillTranslations(3)).resolves.toBe(0)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
})

describe("purgeOrphanTranslations counts", () => {
  it("handles bigint and missing counts in dry-run", async () => {
    m.global.$queryRaw.mockResolvedValueOnce([{ n: BigInt(2) }]).mockResolvedValue([])
    const out = await svc.purgeOrphanTranslations({ dryRun: true })
    expect(out.total).toBe(2)
    expect(out.dryRun).toBe(true)
    expect(Object.values(out.byEntity)).toEqual([2])
  })

  it("defaults to deleting", async () => {
    m.global.$executeRaw.mockResolvedValue(0)
    const out = await svc.purgeOrphanTranslations()
    expect(out).toEqual({ dryRun: false, byEntity: {}, total: 0 })
    expect(m.aiLog).toHaveBeenCalledWith("XLATE_PURGE", "deleted 0 orphan translation row(s)")
  })
})
