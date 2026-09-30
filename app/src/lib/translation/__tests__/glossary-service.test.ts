import { beforeEach, describe, expect, it, vi } from "vitest"

const glossary = {
  upsert: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const fieldTranslation = { updateMany: vi.fn() }
const aiLog = vi.fn()

vi.mock("@/lib/prisma", () => ({ prisma: { glossary, fieldTranslation } }))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: (...a: unknown[]) => aiLog(...a) }))

const svc = await import("@/lib/translation/glossary-service")
const { cleanGlossaryInput } = await import("@/lib/translation/hooks")

const NOW = new Date("2026-01-02T03:04:05.000Z")
function row(over: Record<string, unknown> = {}) {
  return {
    id: "g1",
    sourceLocale: "ja",
    targetLocale: "id",
    term: "改善",
    translation: "KAIZEN",
    note: null,
    autoReverse: false,
    usageCount: 0,
    updatedAt: NOW,
    ...over,
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  glossary.upsert.mockResolvedValue(row())
  glossary.findUnique.mockResolvedValue(null)
  fieldTranslation.updateMany.mockResolvedValue({ count: 2 })
})

describe("upsertGlossary", () => {
  it("rejects blank term or translation", async () => {
    await expect(
      svc.upsertGlossary({ sourceLocale: "ja", targetLocale: "id", term: "  ", translation: "x" }, "u1")
    ).rejects.toThrow()
    await expect(
      svc.upsertGlossary({ sourceLocale: "ja", targetLocale: "id", term: "x", translation: " " }, "u1")
    ).rejects.toThrow()
    expect(glossary.upsert).not.toHaveBeenCalled()
  })

  it("upserts forward and auto-registers the reverse row when absent", async () => {
    const out = await svc.upsertGlossary(
      { sourceLocale: "ja", targetLocale: "id", term: " 改善 ", translation: " KAIZEN ", note: "n" },
      "u1"
    )
    expect(out).toEqual({
      id: "g1",
      sourceLocale: "ja",
      targetLocale: "id",
      term: "改善",
      translation: "KAIZEN",
      note: null,
      autoReverse: false,
      usageCount: 0,
      updatedAt: NOW.toISOString(),
    })
    const first = glossary.upsert.mock.calls[0][0]
    expect(first.where.sourceLocale_targetLocale_termNorm).toMatchObject({ sourceLocale: "ja", targetLocale: "id" })
    expect(first.create).toMatchObject({ term: "改善", translation: "KAIZEN", note: "n", createdBy: "u1" })
    expect(first.update).toMatchObject({ note: "n", updatedBy: "u1" })
    expect(glossary.upsert).toHaveBeenCalledTimes(2)
    const reverse = glossary.upsert.mock.calls[1][0]
    expect(reverse.where.sourceLocale_targetLocale_termNorm).toMatchObject({ sourceLocale: "id", targetLocale: "ja" })
    expect(reverse.create).toMatchObject({ term: "KAIZEN", translation: "改善", autoReverse: true })
    await flush()
    expect(fieldTranslation.updateMany).toHaveBeenCalledWith({
      where: { status: "done", sourceLocale: "ja", textJa: { contains: "改善" } },
      data: expect.objectContaining({ status: "pending", attempts: 0 }),
    })
  })

  it("omits note from the update when undefined", async () => {
    await svc.upsertGlossary({ sourceLocale: "ja", targetLocale: "id", term: "a", translation: "b" }, null)
    const first = glossary.upsert.mock.calls[0][0]
    expect("note" in first.update).toBe(false)
    expect(first.create.note).toBeNull()
  })

  it("does not overwrite a hand-edited reverse row", async () => {
    glossary.findUnique.mockResolvedValue({ autoReverse: false })
    await svc.upsertGlossary({ sourceLocale: "id", targetLocale: "ja", term: "rapat", translation: "会議" }, "u1")
    expect(glossary.upsert).toHaveBeenCalledTimes(1)
    await flush()
    expect(fieldTranslation.updateMany.mock.calls[0][0].where).toMatchObject({ textId: { contains: "rapat" } })
  })

  it("refreshes an auto-generated reverse row", async () => {
    glossary.findUnique.mockResolvedValue({ autoReverse: true })
    await svc.upsertGlossary({ sourceLocale: "ja", targetLocale: "id", term: "a", translation: "b" }, "u1")
    expect(glossary.upsert).toHaveBeenCalledTimes(2)
  })

  it("skips the reverse when withReverse=false", async () => {
    await svc.upsertGlossary({ sourceLocale: "ja", targetLocale: "id", term: "a", translation: "b" }, "u1", false)
    expect(glossary.upsert).toHaveBeenCalledTimes(1)
    expect(glossary.findUnique).not.toHaveBeenCalled()
  })

  it("swallows invalidation failures", async () => {
    fieldTranslation.updateMany.mockRejectedValue(new Error("db"))
    await expect(
      svc.upsertGlossary({ sourceLocale: "ja", targetLocale: "id", term: "a", translation: "b" }, "u1")
    ).resolves.toBeTruthy()
    await flush()
  })
})

describe("applyGlossaryMarkup / cleanGlossaryInput", () => {
  it("strips markup, registers pairs, leaves other fields alone", async () => {
    const res = await svc.applyGlossaryMarkup(
      { title: "この改善<<KAIZEN>>を進める", points: 3, plain: "no markup" },
      "u1"
    )
    expect(res.fields).toEqual({ title: "この改善を進める", points: 3, plain: "no markup" })
    expect(res.registered).toEqual([expect.objectContaining({ term: "改善", translation: "KAIZEN" })])
    expect(glossary.upsert).toHaveBeenCalled()
  })

  it("logs and continues when registration fails", async () => {
    glossary.upsert.mockRejectedValue(new Error("boom"))
    const res = await svc.applyGlossaryMarkup({ t: "改善<<KAIZEN>>" }, "u1")
    expect(res.fields.t).toBe("改善")
    expect(res.registered).toEqual([])
    expect(aiLog).toHaveBeenCalledWith("GLOSSARY", expect.stringContaining("boom"))
  })

  it("logs non-Error rejections too", async () => {
    glossary.upsert.mockRejectedValue("str")
    await svc.applyGlossaryMarkup({ t: "改善<<KAIZEN>>" }, "u1")
    expect(aiLog).toHaveBeenCalledWith("GLOSSARY", expect.stringContaining("str"))
  })

  it("cleanGlossaryInput returns only the cleaned fields", async () => {
    expect(await cleanGlossaryInput({ a: "rapat<<会議>> hari ini" }, null)).toEqual({ a: "rapat hari ini" })
  })
})

describe("findGlossaryForText / bumpGlossaryUsage", () => {
  it("returns matched terms scoped to the locale pair", async () => {
    glossary.findMany.mockResolvedValue([
      { id: "a", term: "改善", termNorm: "改善", translation: "KAIZEN" },
      { id: "b", term: "会議", termNorm: "会議", translation: "rapat" },
    ])
    const out = await svc.findGlossaryForText("改善活動", "ja", "id")
    expect(glossary.findMany).toHaveBeenCalledWith({
      where: { sourceLocale: "ja", targetLocale: "id" },
      select: { id: true, term: true, termNorm: true, translation: true },
    })
    expect(out).toEqual([{ id: "a", term: "改善", translation: "KAIZEN" }])
  })

  it("bumpGlossaryUsage is a no-op for an empty list", async () => {
    await svc.bumpGlossaryUsage([])
    expect(glossary.updateMany).not.toHaveBeenCalled()
  })

  it("bumpGlossaryUsage increments usage", async () => {
    await svc.bumpGlossaryUsage(["a", "b"])
    expect(glossary.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      data: { usageCount: { increment: 1 } },
    })
  })
})

describe("admin operations", () => {
  it("listGlossary filters by source and query", async () => {
    glossary.findMany.mockResolvedValue([row()])
    glossary.count.mockResolvedValue(1)
    const out = await svc.listGlossary({ q: " 改 ", source: "ja", limit: 10, offset: 5 })
    const where = { sourceLocale: "ja", OR: [{ term: { contains: "改" } }, { translation: { contains: "改" } }] }
    expect(glossary.findMany).toHaveBeenCalledWith({ where, orderBy: { updatedAt: "desc" }, take: 10, skip: 5 })
    expect(glossary.count).toHaveBeenCalledWith({ where })
    expect(out.total).toBe(1)
    expect(out.rows[0].updatedAt).toBe(NOW.toISOString())
  })

  it("listGlossary without filters uses an empty where", async () => {
    glossary.findMany.mockResolvedValue([])
    glossary.count.mockResolvedValue(0)
    await svc.listGlossary({ q: "  ", limit: 1, offset: 0 })
    expect(glossary.count).toHaveBeenCalledWith({ where: {} })
  })

  it("updateGlossary returns null for a missing row", async () => {
    expect(await svc.updateGlossary("x", { term: "a" }, "u1")).toBeNull()
    expect(glossary.update).not.toHaveBeenCalled()
  })

  it("updateGlossary renames and invalidates old and new terms", async () => {
    glossary.findUnique.mockResolvedValue(row())
    glossary.update.mockResolvedValue(row({ term: "改良" }))
    const out = await svc.updateGlossary("g1", { term: " 改良 ", note: "memo" }, "u2")
    expect(glossary.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ term: "改良", translation: "KAIZEN", note: "memo", updatedBy: "u2", autoReverse: false }),
    })
    expect(out?.term).toBe("改良")
    await flush()
    expect(fieldTranslation.updateMany).toHaveBeenCalledTimes(2)
  })

  it("updateGlossary keeps current values for blank patches", async () => {
    glossary.findUnique.mockResolvedValue(row())
    glossary.update.mockResolvedValue(row())
    await svc.updateGlossary("g1", { term: " ", translation: "" }, "u2")
    const data = glossary.update.mock.calls[0][0].data
    expect(data).toMatchObject({ term: "改善", translation: "KAIZEN" })
    expect("note" in data).toBe(false)
    await flush()
    expect(fieldTranslation.updateMany).toHaveBeenCalledTimes(1)
  })

  it("removeGlossary returns false when missing and true after delete", async () => {
    expect(await svc.removeGlossary("x")).toBe(false)
    glossary.findUnique.mockResolvedValue(row({ sourceLocale: "id", term: "rapat" }))
    expect(await svc.removeGlossary("g1")).toBe(true)
    expect(glossary.delete).toHaveBeenCalledWith({ where: { id: "g1" } })
  })

  it("retranslateGlossary requeues rows for selected ids", async () => {
    glossary.findMany.mockResolvedValue([
      { sourceLocale: "ja", term: "改善" },
      { sourceLocale: "id", term: "rapat" },
    ])
    fieldTranslation.updateMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 4 })
    expect(await svc.retranslateGlossary(["a", "b"])).toEqual({ requeued: 7 })
    expect(glossary.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["a", "b"] } })
  })

  it("retranslateGlossary without ids covers every row", async () => {
    glossary.findMany.mockResolvedValue([])
    expect(await svc.retranslateGlossary()).toEqual({ requeued: 0 })
    expect(glossary.findMany.mock.calls[0][0].where).toEqual({})
  })
})
