import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }))
vi.mock("@/lib/translation/glossary-service", () => ({
  listGlossary: vi.fn(async () => ({ rows: [{ id: "g" }], total: 1 })),
  upsertGlossary: vi.fn(async () => ({ id: "g" })),
  updateGlossary: vi.fn(),
  removeGlossary: vi.fn(),
  retranslateGlossary: vi.fn(async () => ({ requeued: 3 })),
}))
vi.mock("@/lib/translation/service", () => ({
  translationCounts: vi.fn(async () => ({ pending: 1 })),
  retryFailedTranslations: vi.fn(async () => ({ requeued: 2 })),
  purgeOrphanTranslations: vi.fn(async (o: { dryRun: boolean }) => ({ dryRun: o.dryRun, byEntity: {}, total: 0 })),
}))
vi.mock("@/services/ai-reports/ai-reports.repository")

const gl = await import("@/lib/translation/glossary-service")
const xl = await import("@/lib/translation/service")
const aiRepo = await import("@/services/ai-reports/ai-reports.repository")
const { TX } = await import("@/services/__tests__/support")
const glossary = await import("../glossary.service")
const admin = await import("@/services/translations-admin/translations-admin.service")
const reports = await import("@/services/ai-reports/ai-reports.service")

describe("glossary.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("wraps list results in the API envelope", async () => {
    expect(await glossary.listTerms({ limit: 50, offset: 0 })).toEqual({ data: [{ id: "g" }], total: 1 })
  })

  it("rejects same-locale pairs", async () => {
    const input = { sourceLocale: "ja" as const, targetLocale: "ja" as const, term: "a", translation: "b" }
    await expect(glossary.createTerm(input, "u")).rejects.toMatchObject({ status: 400 })
    await glossary.createTerm({ ...input, targetLocale: "id" }, "u")
    expect(gl.upsertGlossary).toHaveBeenCalledWith(expect.objectContaining({ targetLocale: "id" }), "u", true)
  })

  it("404s for unknown terms", async () => {
    vi.mocked(gl.updateGlossary).mockResolvedValueOnce(null)
    await expect(glossary.updateTerm("x", {}, "u")).rejects.toMatchObject({ status: 404 })
    vi.mocked(gl.removeGlossary).mockResolvedValueOnce(false)
    await expect(glossary.deleteTerm("x")).rejects.toMatchObject({ status: 404 })
    vi.mocked(gl.updateGlossary).mockResolvedValueOnce({ id: "g" } as never)
    await expect(glossary.updateTerm("g", { note: null }, "u")).resolves.toEqual({ id: "g" })
    vi.mocked(gl.removeGlossary).mockResolvedValueOnce(true)
    await expect(glossary.deleteTerm("g")).resolves.toBeUndefined()
    expect(await glossary.retranslate(undefined)).toEqual({ requeued: 3 })
  })
})

describe("translations-admin.service", () => {
  it("delegates counts / retry and defaults purge to a real run", async () => {
    expect(await admin.queueCounts()).toEqual({ pending: 1 })
    expect(await admin.retryFailed()).toEqual({ requeued: 2 })
    await admin.purgeOrphans({}, "admin1")
    expect(xl.purgeOrphanTranslations).toHaveBeenCalledWith({ dryRun: false })
    await admin.purgeOrphans({ dryRun: true }, "admin1")
    expect(xl.purgeOrphanTranslations).toHaveBeenLastCalledWith({ dryRun: true })
  })
})

describe("ai-reports.service", () => {
  it("saves a report and supersedes older ones atomically", async () => {
    vi.mocked(aiRepo.insertReport).mockResolvedValue({ id: "r2" })
    vi.mocked(aiRepo.deleteOtherReports).mockResolvedValue({ count: 1 })
    const out = await reports.saveReplacingPrevious({ projectId: "p", trigger: "sprint_completed", title: "t" })
    expect(out).toEqual({ id: "r2", superseded: 1 })
    expect(aiRepo.deleteOtherReports).toHaveBeenCalledWith(TX, "p", "sprint_completed", "r2")
    vi.mocked(aiRepo.findLatestReports).mockResolvedValue([] as never)
    expect(await reports.listLatestReports("p")).toEqual([])
  })
})
