import { describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

const { buildImprovementWorkbook, sortByStage, toQcItem } = await import("../improvement.export")
const { workbookBuffer, loadWorkbook } = await import("../excel.shared")

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: "r1",
    pbItem: null,
    initiative: "段取り改善",
    epic: null,
    userStory: "治具を共通化して段取りを短くする",
    releaseNote: "効果報告",
    assignedPo: "山田",
    kaizenStage: "standardized",
    metricCategory: "time",
    metricName: "段取り時間",
    metricUnit: "分",
    direction: "decrease",
    baselineValue: 60,
    targetValue: 30,
    resultValue: 45,
    annualEffectUsd: 1_200_000,
    manualLink: "https://std/1",
    standardizedAt: new Date("2026-09-01T00:00:00Z"),
    releaseDate: new Date("2026-09-01T00:00:00Z"),
    rollouts: [{ id: "ro", targetName: "第2ライン", status: "done", doneAt: new Date("2026-09-20T00:00:00Z"), sortOrder: 0 }],
    checks: [{ id: "c", kind: "1m", dueDate: new Date("2026-10-01T00:00:00Z"), checkedAt: null, result: null, note: null, checkedByName: null, notifiedAt: null }],
    photos: [{ id: "p", phase: "before" }, { id: "q", phase: "after" }, { id: "s", phase: "after" }],
    ...over,
  }) as never

describe("improvement export", () => {
  it("maps a board row (title from the story, photo counts per phase)", () => {
    const item = toQcItem(row())
    expect(item).toMatchObject({ title: "治具を共通化して段取りを短くする", theme: "段取り改善", photoCounts: { before: 1, after: 2 } })
    expect(item.countermeasure).toContain("効果報告")
  })

  it("sorts by stage in board order", () => {
    expect(sortByStage([{ kaizenStage: "sustained" }, { kaizenStage: "measuring" }, { kaizenStage: "deferred" }]).map((r) => r.kaizenStage)).toEqual([
      "measuring",
      "sustained",
      "deferred",
    ])
  })

  it("builds a summary sheet plus one A3-landscape QC-story sheet per item", async () => {
    const wb = buildImprovementWorkbook([toQcItem(row()), toQcItem(row({ id: "r2", kaizenStage: "measuring", userStory: "二つ目" }))], "ja", {
      projectName: "FA2 Line 9",
      created: new Date("2026-10-02T00:00:00Z"),
    })
    const loaded = await loadWorkbook(await workbookBuffer(wb))
    expect(loaded.worksheets.map((w) => w.name)).toEqual(["改善成果一覧", "1_二つ目", "2_治具を共通化して段取りを短くする"])
    const summary = loaded.getWorksheet("改善成果一覧")!
    expect(summary.getRow(1).getCell(1).value).toBe("テーマ")
    const qc = loaded.worksheets[2]
    expect(qc.pageSetup).toMatchObject({ paperSize: 8, orientation: "landscape", fitToWidth: 1, fitToHeight: 1 })
    expect(qc.getCell("A1").value).toBe("改善成果報告書")
    expect(qc.getCell("F10").value).toBeCloseTo(0.5)
    const texts = JSON.stringify(qc.getSheetValues())
    for (const heading of ["テーマ", "現状把握（改善前）", "目標", "対策", "効果（改善後）", "標準化", "横展開", "定着確認", "第2ライン"]) {
      expect(texts).toContain(heading)
    }
  })
})
