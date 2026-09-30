import { describe, expect, it } from "vitest"
import type { StructuredReport } from "@/lib/report-tool"
import { detectReportLang, localizeStructuredReport, pickBilingualLines, pickReportTitle } from "./ai-report-language"

const PAIRS = [
  "Kecepatan tim stabil dan semua tugas selesai tepat waktu.",
  "チームの速度は安定しており、すべてのタスクが期限内に完了しました。",
  "",
  "Sprint berikutnya perlu kapasitas yang lebih kecil.",
  "次のスプリントはキャパシティを小さくする必要があります。",
].join("\n")

describe("pickBilingualLines", () => {
  it("keeps the viewer's side of JA/ID line pairs", () => {
    expect(pickBilingualLines(PAIRS, "ja")).toBe(
      "チームの速度は安定しており、すべてのタスクが期限内に完了しました。\n\n次のスプリントはキャパシティを小さくする必要があります。",
    )
    expect(pickBilingualLines(PAIRS, "id")).toBe(
      "Kecepatan tim stabil dan semua tugas selesai tepat waktu.\n\nSprint berikutnya perlu kapasitas yang lebih kecil.",
    )
  })

  it("leaves single-language text and English viewers untouched", () => {
    expect(pickBilingualLines("進捗は順調です。\n課題はありません。", "id")).toBe("進捗は順調です。\n課題はありません。")
    expect(pickBilingualLines(PAIRS, "en")).toBe(PAIRS)
  })
})

describe("pickReportTitle", () => {
  it("shows a progress report title in the viewer's language", () => {
    expect(pickReportTitle("📊 進捗レポート", "id")).toBe("📊 Laporan progres")
    expect(pickReportTitle("📊 Laporan progres", "en")).toBe("📊 Progress report")
  })

  it("picks one side of a 'JA / ID: name' title and keeps other titles", () => {
    const title = "🏁 スプリント完了レビュー / Tinjauan penyelesaian sprint: S-9"
    expect(pickReportTitle(title, "ja")).toBe("🏁 スプリント完了レビュー: S-9")
    expect(pickReportTitle(title, "id")).toBe("Tinjauan penyelesaian sprint: S-9")
    expect(pickReportTitle(title, "en")).toBe(title)
    expect(pickReportTitle("Weekly / monthly", "ja")).toBe("Weekly / monthly")
  })
})

describe("detectReportLang", () => {
  it("tells bilingual, Japanese, English and Indonesian reports apart", () => {
    expect(detectReportLang(PAIRS)).toBe("bilingual")
    expect(detectReportLang("プロジェクト進捗率は0%です")).toBe("ja")
    expect(detectReportLang("The sprint is on track and all tasks are done")).toBe("en")
    expect(detectReportLang("Progres proyek sudah sesuai rencana")).toBe("id")
  })
})

describe("localizeStructuredReport", () => {
  it("reduces every text field to the viewer's language", () => {
    const pair = (id: string, ja: string) => `${id}\n${ja}`
    const report: StructuredReport = {
      headline: pair("Kecepatan tim stabil dan baik", "チームの速度は安定しています"),
      overview: "概要のみ",
      followUps: [{ status: "resolved", item: pair("Tugas yang tertunda sudah selesai", "遅延タスクは完了しました"), note: null }],
      findings: [{ severity: "info", title: pair("Beban kerja tim seimbang", "負荷は均等です"), detail: null }],
      metrics: [{ label: "SP", value: "12" }],
      causes: [pair("Estimasi tugas yang lebih baik", "見積もりが改善されました")],
      actions: [{ priority: "high", action: pair("Pertahankan kapasitas yang sama", "同じキャパシティを維持する") }],
      outlook: null,
    }
    const ja = localizeStructuredReport(report, "ja")
    expect(ja.headline).toBe("チームの速度は安定しています")
    expect(ja.followUps[0].item).toBe("遅延タスクは完了しました")
    expect(ja.findings[0].title).toBe("負荷は均等です")
    expect(ja.causes).toEqual(["見積もりが改善されました"])
    expect(ja.actions[0].action).toBe("同じキャパシティを維持する")
    expect(ja.overview).toBe("概要のみ")
    expect(localizeStructuredReport(report, "id").headline).toBe("Kecepatan tim stabil dan baik")
    expect(report.headline).toContain("\n")
  })
})
