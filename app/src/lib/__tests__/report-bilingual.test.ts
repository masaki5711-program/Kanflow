import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  translateTo: vi.fn(),
  aiLog: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { aiReport: { findMany: m.findMany, update: m.update } } }))
vi.mock("@/lib/ollama", () => ({ translateTo: m.translateTo }))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: m.aiLog }))

const { bilingualizeStructuredReport, bilingualizeReportBody, convertLegacyAiReports } = await import(
  "@/lib/report-bilingual"
)
import type { StructuredReport } from "@/lib/report-tool"

const PAIR = "Tugas tertunda\nタスクが遅延"

beforeEach(() => {
  vi.clearAllMocks()
  m.translateTo.mockImplementation(async (line: string, to: string) =>
    to === "id" ? `ID(${line.length})` : `訳:${line}`
  )
})

describe("bilingualizeReportBody", () => {
  it("returns empty input untouched", async () => {
    await expect(bilingualizeReportBody("   ")).resolves.toBe("   ")
    expect(m.translateTo).not.toHaveBeenCalled()
  })

  it("pairs JA, ID and English lines and collapses blank runs", async () => {
    const out = await bilingualizeReportBody("遅延あり\n対応中\n\n\nTim perlu bantuan\nThe sprint is behind schedule")
    expect(out).toBe(
      [
        "ID(4)", "遅延あり", "",
        "ID(3)", "対応中", "",
        "Tim perlu bantuan", "訳:Tim perlu bantuan", "",
        "ID(29)", "訳:The sprint is behind schedule",
      ].join("\n")
    )
  })

  it("keeps already-bilingual text unchanged", async () => {
    await expect(bilingualizeReportBody(PAIR)).resolves.toBe(PAIR)
    expect(m.translateTo).not.toHaveBeenCalled()
  })

  it("repairs English-paired text from its Japanese lines", async () => {
    const out = await bilingualizeReportBody("The tasks are still pending\nタスクが保留中")
    expect(out).toBe("ID(7)\nタスクが保留中")
  })

  it("keeps the original when translation fails", async () => {
    m.translateTo.mockRejectedValue(new Error("down"))
    await expect(bilingualizeReportBody("日本語")).resolves.toBe("日本語")
  })
})

describe("bilingualizeStructuredReport", () => {
  it("bilingualizes prose fields but keeps metric values and enums", async () => {
    const report: StructuredReport = {
      headline: "見出し",
      overview: PAIR,
      followUps: [{ status: "resolved", item: "項目", note: "根拠" }, { status: "unresolved", item: "項目2", note: null }],
      findings: [{ severity: "critical", title: "題", detail: null }, { severity: "info", title: "題2", detail: "詳細" }],
      metrics: [{ label: "完了", value: "5 SP" }],
      causes: ["原因"],
      actions: [{ priority: "high", action: "対応" }],
      outlook: null,
    }
    const out = await bilingualizeStructuredReport(report)
    expect(out.headline).toBe("ID(3)\n見出し")
    expect(out.overview).toBe(PAIR)
    expect(out.followUps).toEqual([
      { status: "resolved", item: "ID(2)\n項目", note: "ID(2)\n根拠" },
      { status: "unresolved", item: "ID(3)\n項目2", note: null },
    ])
    expect(out.findings[0]).toEqual({ severity: "critical", title: "ID(1)\n題", detail: null })
    expect(out.findings[1].detail).toBe("ID(2)\n詳細")
    expect(out.metrics).toEqual([{ label: "ID(2)\n完了", value: "5 SP" }])
    expect(out.causes).toEqual(["ID(2)\n原因"])
    expect(out.actions).toEqual([{ priority: "high", action: "ID(2)\n対応" }])
    expect(out.outlook).toBeNull()

    const withOutlook = await bilingualizeStructuredReport({ ...report, followUps: undefined as never, outlook: "見通し" })
    expect(withOutlook.followUps).toEqual([])
    expect(withOutlook.outlook).toBe("ID(3)\n見通し")
  })
})

describe("convertLegacyAiReports (structured rows, errors, abort)", () => {
  const structured = (headline: string, overview: string) =>
    JSON.stringify({ headline, overview, followUps: [], findings: [], metrics: [], causes: [], actions: [], outlook: null })

  it("converts structured rows and writes markdown + summary", async () => {
    m.findMany.mockResolvedValue([
      { id: "s1", structured: structured("見出し", "概要"), body: null },
      { id: "s-ok", structured: structured(PAIR, PAIR), body: null },
      { id: "bad-json", structured: "{", body: "x" },
    ])
    await expect(convertLegacyAiReports({ limit: 5 })).resolves.toEqual({ converted: 1 })
    expect(m.findMany.mock.calls[0][0].take).toBe(5)
    expect(m.update).toHaveBeenCalledTimes(1)
    const { where, data } = m.update.mock.calls[0][0]
    expect(where).toEqual({ id: "s1" })
    expect(JSON.parse(data.structured).headline).toBe("ID(3)\n見出し")
    expect(data.body).toContain("## 概要")
    expect(data.summary).toBe("ID(3)\n見出し")
  })

  it("returns 0 without calling beforeConvert when nothing is pending", async () => {
    m.findMany.mockResolvedValue([])
    const before = vi.fn()
    await expect(convertLegacyAiReports({ beforeConvert: before })).resolves.toEqual({ converted: 0 })
    expect(before).not.toHaveBeenCalled()
  })

  it("logs and skips per-row failures, and stops when aborted", async () => {
    m.findMany.mockResolvedValue([
      { id: "a", structured: null, body: "一つ目" },
      { id: "b", structured: null, body: "二つ目" },
    ])
    m.update.mockRejectedValueOnce(new Error("db")).mockResolvedValue({})
    await expect(convertLegacyAiReports()).resolves.toEqual({ converted: 1 })
    expect(m.aiLog).toHaveBeenCalledWith("CHAT_ERROR", expect.stringContaining("report conversion a: db"))

    m.update.mockReset().mockRejectedValueOnce("str")
    await convertLegacyAiReports()
    expect(m.aiLog).toHaveBeenCalledWith("CHAT_ERROR", expect.stringContaining("str"))

    const ac = new AbortController()
    ac.abort()
    m.update.mockClear()
    await expect(convertLegacyAiReports({ signal: ac.signal })).resolves.toEqual({ converted: 0 })
    expect(m.update).not.toHaveBeenCalled()
  })
})
