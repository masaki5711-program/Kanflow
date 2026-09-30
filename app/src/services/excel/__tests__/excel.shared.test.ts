import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import {
  EXCEL_TEXT_MAX,
  addTableSheet,
  contentDisposition,
  excelCellText,
  excelDate,
  excelFileName,
  loadWorkbook,
  parseExcelLang,
  safeSheetName,
  workbookBuffer,
  type ExcelColumn,
} from "../excel.shared"

describe("excel.shared helpers", () => {
  it("builds '<kind>-<project>-<date>.xlsx' with unsafe characters replaced", () => {
    expect(excelFileName("backlog", "My/Proj: 1", new Date("2026-09-30T20:00:00Z"))).toBe("backlog-My_Proj_1-2026-10-01.xlsx")
    expect(excelFileName("icebox", "  ", new Date("2026-09-30T00:00:00Z"))).toBe("icebox-project-2026-09-30.xlsx")
  })

  it("sends an ASCII fallback and the UTF-8 name in Content-Disposition", () => {
    const header = contentDisposition("backlog-案件-2026-09-30.xlsx")
    expect(header).toContain('filename="backlog-__-2026-09-30.xlsx"')
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("backlog-案件-2026-09-30.xlsx")}`)
  })

  it("parses ?lang= and falls back to the given default", () => {
    expect(parseExcelLang("en", "ja")).toBe("en")
    expect(parseExcelLang("xx", "id")).toBe("id")
    expect(parseExcelLang(null, "ja")).toBe("ja")
  })

  it("shifts dates to Tokyo wall time (Excel dates have no zone) and keeps null", () => {
    expect(excelDate(new Date("2026-09-30T15:30:00Z"))?.toISOString()).toBe("2026-10-01T00:30:00.000Z")
    expect(excelDate(null)).toBeNull()
  })

  it("cuts text to the Excel cell limit", () => {
    expect(excelCellText("x".repeat(EXCEL_TEXT_MAX + 10))).toHaveLength(EXCEL_TEXT_MAX)
    expect(excelCellText(null)).toBeNull()
    expect(excelCellText("")).toBeNull()
  })

  it("makes sheet names Excel-safe (31 chars, no []:*?/\\)", () => {
    expect(safeSheetName("a/b:c*d?e[f]g\\h")).toBe("a_b_c_d_e_f_g_h")
    expect(safeSheetName("x".repeat(40))).toHaveLength(31)
    expect(safeSheetName("")).toBe("Sheet")
  })
})

describe("addTableSheet", () => {
  interface Row {
    id: number
    name: string
    at: Date | null
  }
  const columns: ExcelColumn<Row>[] = [
    { key: "id", header: "ID", width: 8, value: (r) => r.id },
    { key: "name", header: "Name", width: 30, value: (r) => r.name },
    { key: "at", header: "At", width: 18, type: "datetime", value: (r) => excelDate(r.at) },
  ]

  it("writes a bold frozen header with autofilter, widths and real dates", async () => {
    const wb = new ExcelJS.Workbook()
    addTableSheet(wb, "Items", columns, [
      { id: 1, name: "a", at: new Date("2026-09-30T00:00:00Z") },
      { id: 2, name: "b", at: null },
    ])
    const back = await loadWorkbook(await workbookBuffer(wb))
    const ws = back.getWorksheet("Items")!
    expect(ws.getRow(1).values).toEqual([undefined, "ID", "Name", "At"])
    expect(ws.getRow(1).font?.bold).toBe(true)
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 })
    expect(ws.autoFilter).toBeTruthy()
    expect(ws.getColumn(2).width).toBe(30)
    const at = ws.getRow(2).getCell(3)
    expect(at.value).toBeInstanceOf(Date)
    expect((at.value as Date).toISOString()).toBe("2026-09-30T09:00:00.000Z")
    expect(at.numFmt).toBe("yyyy-mm-dd hh:mm")
    expect(ws.getRow(3).getCell(3).value).toBeNull()
  })
})
