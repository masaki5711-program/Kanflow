import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"

const db = vi.hoisted(() => ({ current: null as unknown }))
const i18n = vi.hoisted(() => ({ getI18nFor: vi.fn() }))

vi.mock("@/services/_shared/db", () => ({
  get defaultDb() {
    return db.current
  },
  withTransaction: vi.fn(),
}))
vi.mock("@/services/_shared/translations", () => ({ getI18nFor: i18n.getI18nFor }))

const { buildBacklogWorkbook, exportBacklog, hasBilingualText } = await import("../backlog.export")
const { loadWorkbook } = await import("../excel.shared")
type Row = import("../backlog.export").BacklogExportRow

const row = (over: Partial<Row>): Row => ({
  id: "p1",
  displayId: 1,
  initiative: null,
  epic: null,
  userStory: "story",
  acceptanceCriteria: null,
  referenceDoc: null,
  workloadScore: 3,
  status: "ready",
  assignedPo: null,
  poNote: null,
  notReadyReason: null,
  goal: null,
  planItem: null,
  sprints: [],
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-02T03:00:00Z"),
  i18n: {},
  ...over,
})

async function reload(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  return loadWorkbook(await wb.xlsx.writeBuffer())
}

function headerRow(ws: ExcelJS.Worksheet): string[] {
  return (ws.getRow(1).values as unknown[]).slice(1).map(String)
}

describe("buildBacklogWorkbook", () => {
  it("names the sheet and headers in the viewer language with project-type wording", async () => {
    const wb = await reload(buildBacklogWorkbook([row({})], { lang: "ja", projectType: "process_improvement", bilingual: false }))
    const ws = wb.getWorksheet("バックログ")!
    expect(headerRow(ws)).toEqual([
      "ID", "改善テーマ", "改善施策", "改善項目", "改善受入条件", "ステータス", "改善負荷", "プロダクトゴール",
      expect.any(String), "PO メモ", "未準備の理由", "参考資料", "全体計画の項目", "スプリント", "作成日時", "更新日時",
    ])
    expect(ws.getRow(1).font?.bold).toBe(true)
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1, xSplit: 1 })
    expect(ws.autoFilter).toBeTruthy()
  })

  it("writes values: status label, points number, goal / plan / sprints, real Tokyo dates", async () => {
    const wb = await reload(
      buildBacklogWorkbook(
        [row({ displayId: 7, goal: "G1", planItem: "Design", sprints: ["S1", "S2"], status: "completed" })],
        { lang: "en", projectType: "software", bilingual: false }
      )
    )
    const ws = wb.getWorksheet("Backlog")!
    const byHeader = Object.fromEntries(headerRow(ws).map((h, i) => [h, ws.getRow(2).getCell(i + 1).value]))
    expect(byHeader).toMatchObject({ ID: 7, Status: "Completed", "Product goal": "G1", "Master plan item": "Design", Sprint: "S1, S2" })
    expect((byHeader.Updated as Date).toISOString()).toBe("2026-09-02T12:00:00.000Z")
  })

  it("orders rows Ready → Not ready → Completed, keeping sortOrder inside a group", async () => {
    const rows = [row({ displayId: 1, status: "completed" }), row({ displayId: 2, status: "not_ready" }), row({ displayId: 3, status: "ready" }), row({ displayId: 4, status: "ready" })]
    const ws = (await reload(buildBacklogWorkbook(rows, { lang: "en", projectType: "software", bilingual: false }))).getWorksheet("Backlog")!
    expect([2, 3, 4, 5].map((r) => ws.getRow(r).getCell(1).value)).toEqual([3, 4, 2, 1])
  })

  it("adds Japanese / Indonesian columns next to each translated field when bilingual", async () => {
    const tr = { ja: "話", id: "cerita", source: "ja" as const, status: "done" as const }
    const wb = await reload(buildBacklogWorkbook([row({ i18n: { userStory: tr } })], { lang: "ja", projectType: "software", bilingual: true }))
    const ws = wb.getWorksheet("バックログ")!
    const headers = headerRow(ws)
    const at = headers.indexOf("ユーザーストーリー")
    expect(headers.slice(at, at + 3)).toEqual(["ユーザーストーリー", "ユーザーストーリー（日本語）", "ユーザーストーリー（インドネシア語）"])
    expect([at + 2, at + 3].map((c) => ws.getRow(2).getCell(c).value)).toEqual(["話", "cerita"])
  })
})

describe("hasBilingualText", () => {
  it("is true only when some field has both sides filled", () => {
    const pending = { ja: "話", id: null, source: "ja" as const, status: "pending" as const }
    const done = { ja: "話", id: "cerita", source: "ja" as const, status: "done" as const }
    expect(hasBilingualText(new Map([["a", { userStory: pending }]]))).toBe(false)
    expect(hasBilingualText(new Map([["a", { userStory: pending }], ["b", { epic: done }]]))).toBe(true)
    expect(hasBilingualText(new Map())).toBe(false)
  })
})

describe("exportBacklog", () => {
  beforeEach(() => vi.clearAllMocks())

  it("loads live PBIs + translations and names the file after the project and Tokyo date", async () => {
    const fake = fakeDb({
      "project.findFirst": { name: "案件 A", projectType: "software" },
      "productBacklogItem.findMany": [
        {
          ...row({ id: "x1", displayId: 5 }),
          productGoal: { title: "Goal" },
          planItem: { name: "Trashed", deletedAt: new Date() },
          sprintItems: [
            { sprint: { id: "s2", sprintName: "Late", startDate: new Date("2026-09-10") } },
            { sprint: { id: "s1", sprintName: "Early", startDate: new Date("2026-09-01") } },
            { sprint: { id: "s1", sprintName: "Early", startDate: new Date("2026-09-01") } },
          ],
        },
      ],
    })
    db.current = fake.client
    i18n.getI18nFor.mockResolvedValue(new Map())

    const out = await exportBacklog("proj", "en", new Date("2026-09-30T16:00:00Z"))

    expect(out.fileName).toBe("backlog-案件_A-2026-10-01.xlsx")
    expect(fake.fn("productBacklogItem.findMany").mock.calls[0][0].where).toEqual({ projectId: "proj", deletedAt: null })
    expect(i18n.getI18nFor).toHaveBeenCalledWith("backlog_item", ["x1"])
    const wb = await loadWorkbook(out.buffer)
    const ws = wb.getWorksheet("Backlog")!
    const byHeader = Object.fromEntries(headerRow(ws).map((h, i) => [h, ws.getRow(2).getCell(i + 1).value]))
    expect(byHeader).toMatchObject({ ID: 5, "Product goal": "Goal", Sprint: "Early, Late" })
    expect(byHeader["Master plan item"] ?? null).toBeNull()
  })

  it("404s for a missing / trashed project", async () => {
    db.current = fakeDb({ "project.findFirst": null, "productBacklogItem.findMany": [] }).client
    await expect(exportBacklog("gone", "ja")).rejects.toMatchObject({ status: 404 })
  })
})
