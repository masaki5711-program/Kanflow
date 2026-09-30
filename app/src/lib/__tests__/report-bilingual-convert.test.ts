import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  translateTo: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { aiReport: { findMany: m.findMany, update: m.update, deleteMany: m.deleteMany } },
}))
vi.mock("@/lib/ollama", () => ({ translateTo: m.translateTo }))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn() }))

const { convertLegacyAiReports, LEGACY_CONVERSION_BATCH } = await import("@/lib/report-bilingual")
const { resolveAiReportRetentionDays } = await import("@/lib/ai-report-retention")

const BILINGUAL = "Laporan mingguan tim\n週次のチーム報告"

describe("convertLegacyAiReports", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.translateTo.mockImplementation(async (line: string, to: string) => (to === "id" ? `Terjemahan ${line.length}` : `訳${line}`))
  })

  it("converts only single-language rows, never deletes, bounded batch", async () => {
    m.findMany.mockResolvedValue([
      { id: "legacy", structured: null, body: "日本語だけの報告" },
      { id: "ok", structured: null, body: BILINGUAL },
      { id: "empty", structured: null, body: null },
    ])
    const before = vi.fn(async () => undefined)
    await expect(convertLegacyAiReports({ beforeConvert: before })).resolves.toEqual({ converted: 1 })
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: LEGACY_CONVERSION_BATCH }))
    expect(m.update).toHaveBeenCalledTimes(1)
    expect(m.update.mock.calls[0][0].where).toEqual({ id: "legacy" })
    expect(m.update.mock.calls[0][0].data.body).toContain("日本語だけの報告")
    expect(before).toHaveBeenCalledTimes(1)
    expect(m.deleteMany).not.toHaveBeenCalled()
  })

  it("does nothing (no LLM, no yield) when every row is already bilingual", async () => {
    m.findMany.mockResolvedValue([{ id: "ok", structured: null, body: BILINGUAL }])
    const before = vi.fn(async () => undefined)
    await expect(convertLegacyAiReports({ beforeConvert: before })).resolves.toEqual({ converted: 0 })
    expect(before).not.toHaveBeenCalled()
    expect(m.translateTo).not.toHaveBeenCalled()
  })

  it("stops when aborted", async () => {
    m.findMany.mockResolvedValue([{ id: "legacy", structured: null, body: "日本語だけの報告" }])
    const c = new AbortController()
    c.abort()
    await expect(convertLegacyAiReports({ signal: c.signal })).resolves.toEqual({ converted: 0 })
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("resolveAiReportRetentionDays", () => {
  it("defaults to 90; SURVEILLANCE_RETENTION_DAYS wins over the AI_REPORT_RETENTION_DAYS alias", () => {
    expect(resolveAiReportRetentionDays({})).toBe(90)
    expect(resolveAiReportRetentionDays({ AI_REPORT_RETENTION_DAYS: "30" })).toBe(30)
    expect(resolveAiReportRetentionDays({ AI_REPORT_RETENTION_DAYS: "30", SURVEILLANCE_RETENTION_DAYS: "60" })).toBe(60)
    expect(resolveAiReportRetentionDays({ SURVEILLANCE_RETENTION_DAYS: "x", AI_REPORT_RETENTION_DAYS: "0" })).toBe(90)
  })
})
