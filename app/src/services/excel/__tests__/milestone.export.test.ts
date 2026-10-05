import { describe, expect, it, vi } from "vitest"
import { summarizeBoard } from "@/lib/milestones/summary"
import type { MilestoneBoardDto } from "@/services/milestones/milestones.service"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))
vi.mock("@/services/milestones/milestones.service", () => ({ getBoard: vi.fn() }))

const { buildMilestoneWorkbook } = await import("../milestone.export")

function board(over: Partial<MilestoneBoardDto> = {}): MilestoneBoardDto {
  const stages = [
    { id: "s1", name: "仕様決定", i18n: {}, status: "done", scheduleState: "done", plannedStart: "2026-08-01", plannedEnd: "2026-08-20", actualStart: null, actualEnd: "2026-08-19", isMilestone: false, progressPct: 100, hasChildren: false, version: 1, notes: null, conditions: [{ label: "承認", checked: true, checkedByName: "A", checkedAt: null }], steps: [] },
    { id: "s2", name: "立会検収", i18n: {}, status: "not_started", scheduleState: "delayed", plannedStart: "2026-09-01", plannedEnd: "2026-09-01", actualStart: null, actualEnd: null, isMilestone: true, progressPct: 0, hasChildren: false, version: 1, notes: null, conditions: [], steps: [] },
  ]
  const checks = [{ id: "c1", planItemId: "s2", name: "能力", criterion: "CT 30秒", result: "passed", witness: "山田様", checkedAt: "2026-09-01", note: null, recordedByName: "A", sortOrder: 0 }]
  const punchItems = [{ id: "p1", planItemId: "s2", title: "ボルト不足", detail: null, assigneeId: null, assigneeName: "佐藤", dueDate: "2026-09-30", status: "open", closedAt: null, createdByName: "A", createdAt: new Date(), photos: [] }]
  const documents = [{ id: "d1", name: "図面", status: "received", receivedAt: new Date("2026-09-02T01:00:00Z"), receivedByName: "A", note: null, sortOrder: 0, files: [] }]
  const budgetLines = [{ id: "b1", name: "本体", plannedYen: 100, actualYen: 120, note: null, sortOrder: 0 }]
  const metrics = [{ id: "m1", name: "不良率", unit: "%", direction: "decrease", baselineValue: 2, targetValue: 1, sortOrder: 0, points: [{ month: "2026-09", value: 1.2, recordedByName: null }] }]
  const settings = { checkLabel: "検収", budgetEnabled: true, trendEnabled: true }
  const base = { todayKey: "2026-10-02", settings, templates: ["設備導入"], members: [], stages, checks, punchItems, documents, budgetLines, metrics }
  return { ...base, summary: summarizeBoard({ ...base, budgetEnabled: true }, "2026-10-02"), ...over } as unknown as MilestoneBoardDto
}

describe("buildMilestoneWorkbook", () => {
  it("has summary, check record (named by the check label), punch list, documents and trend sheets", () => {
    const wb = buildMilestoneWorkbook(board(), "ja", { projectName: "設備A", created: new Date("2026-10-02T03:00:00Z") })
    expect(wb.worksheets.map((w) => w.name)).toEqual(["サマリー", "検収記録", "残課題リスト", "引き渡し資料", "推移"])
  })

  it("check record: title with 検収完了, signature columns left blank, landscape", () => {
    const ws = buildMilestoneWorkbook(board(), "ja", { projectName: "設備A", created: new Date() }).getWorksheet("検収記録")!
    expect(String(ws.getCell(1, 1).value)).toContain("検収完了")
    const header = (ws.getRow(2).values as unknown[]).slice(1)
    expect(header.slice(-2)).toEqual(["立会者 署名", "確認者 署名"])
    expect(ws.getCell(3, 5).value).toBe("合格")
    expect(ws.getCell(3, 6).value).toBe("山田様")
    expect(ws.getCell(3, 9).value).toBeNull()
    expect(ws.pageSetup.orientation).toBe("landscape")
  })

  it("marks overdue punch items and late stages; budget totals on the summary", () => {
    const wb = buildMilestoneWorkbook(board(), "en", { projectName: "A", created: new Date() })
    const punch = wb.getWorksheet("Punch list")!
    expect(punch.getCell(2, 7).value).toBe("Open (Overdue)")
    const summary = wb.getWorksheet("Summary")!
    expect(summary.getCell(3, 2).value).toBe("Not started (Late)")
    const values = summary.getSheetValues().flat().filter((v) => typeof v === "number")
    expect(values).toEqual(expect.arrayContaining([100, 120, 20]))
  })

  it("no trend sheet without metrics", () => {
    const wb = buildMilestoneWorkbook(board({ metrics: [] }), "id", { projectName: "A", created: new Date() })
    expect(wb.worksheets).toHaveLength(4)
  })
})
