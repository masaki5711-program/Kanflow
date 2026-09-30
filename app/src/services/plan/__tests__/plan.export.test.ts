import ExcelJS from "exceljs"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("../plan.service", () => ({ listPlan: vi.fn() }))
vi.mock("../plan.repository")

const svc = await import("../plan.service")
const repo = await import("../plan.repository")
const exp = await import("../plan.export")
type Dto = import("../plan.dto").PlanItemDto

const dto = (id: string, parentId: string | null, sortOrder: number, over: Partial<Dto> = {}): Dto => ({
  id,
  projectId: "p1",
  parentId,
  name: id.toUpperCase(),
  description: null,
  notes: null,
  plannedStart: "2026-10-01",
  plannedEnd: "2026-10-10",
  actualStart: null,
  actualEnd: null,
  baselineStart: null,
  baselineEnd: null,
  baselineVarianceDays: null,
  progressPct: 0,
  progressMode: "manual",
  status: "not_started",
  scheduleState: "not_started",
  isMilestone: false,
  color: null,
  sortOrder,
  version: 0,
  owner: null,
  hasChildren: false,
  linked: null,
  i18n: {},
  ...over,
})

describe("plan.export", () => {
  it("orderPlanTree walks siblings by sortOrder with WBS numbers; orphans become roots", () => {
    const rows = exp.orderPlanTree([dto("b", null, 2), dto("a", null, 1), dto("a2", "a", 2), dto("a1", "a", 1), dto("o", "gone", 3)])
    expect(rows.map((r) => [r.item.id, r.wbs, r.depth])).toEqual([
      ["a", "1", 0],
      ["a1", "1.1", 1],
      ["a2", "1.2", 1],
      ["b", "2", 0],
      ["o", "3", 0],
    ])
  })

  it("buildPlanWorkbook writes localized headers, labels and linked counts", async () => {
    const items = [
      dto("a", null, 1, { hasChildren: true, owner: { id: "u", name: "Alice" }, baselineEnd: "2026-10-08", baselineVarianceDays: 2 }),
      dto("a1", "a", 1, {
        status: "in_progress",
        scheduleState: "at_risk",
        progressMode: "linked",
        progressPct: 40,
        linked: { pbiCount: 5, pbiDone: 2, pointsTotal: 10, pointsDone: 4, sprints: [] },
      }),
    ]
    const wb = exp.buildPlanWorkbook(items, "en")
    const ws = wb.getWorksheet("Master plan") as ExcelJS.Worksheet
    expect(ws.getRow(1).getCell(1).value).toBe("WBS")
    expect(ws.getRow(1).getCell(2).value).toBe("Item")
    const child = ws.getRow(3)
    expect(child.getCell("wbs").value).toBe("1.1")
    expect(child.getCell("name").alignment?.indent).toBe(1)
    expect(child.getCell("status").value).toBe("In progress")
    expect(child.getCell("schedule").value).toBe("At risk")
    const held = exp.buildPlanWorkbook([dto("h", null, 1, { status: "on_hold", scheduleState: "on_hold" })], "ja")
    expect((held.getWorksheet("全体計画") as ExcelJS.Worksheet).getRow(2).getCell("schedule").value).toBe("保留")
    expect(child.getCell("mode").value).toBe("Linked PBIs")
    expect(child.getCell("pbis").value).toBe("2/5")
    expect(child.getCell("points").value).toBe("4/10")
    expect(ws.getRow(2).getCell("owner").value).toBe("Alice")
    expect(ws.getRow(2).getCell("varianceDays").value).toBe(2)
    const ja = exp.buildPlanWorkbook(items, "ja").getWorksheet("全体計画") as ExcelJS.Worksheet
    expect(ja.getRow(3).getCell("status").value).toBe("進行中")
    // round-trips as a real xlsx
    const buf = await wb.xlsx.writeBuffer()
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buf)
    expect(back.getWorksheet("Master plan")?.rowCount).toBe(3)
  })

  it("file name and Content-Disposition are safe", () => {
    expect(exp.exportFileName('A/B: "x" 計画', "2026-10-05")).toBe("plan-A_B___x__計画-2026-10-05.xlsx")
    expect(exp.exportFileName("", "2026-10-05")).toBe("plan-project-2026-10-05.xlsx")
    const cd = exp.contentDisposition("plan-計画-2026-10-05.xlsx")
    expect(cd).toBe(`attachment; filename="plan-__-2026-10-05.xlsx"; filename*=UTF-8''${encodeURIComponent("plan-計画-2026-10-05.xlsx")}`)
  })

  it("exportPlan builds the buffer and names the file after the project (Tokyo date)", async () => {
    vi.mocked(svc.listPlan).mockResolvedValue({ items: [dto("a", null, 1)], dependencies: [], today: "2026-10-06" })
    vi.mocked(repo.findProjectName).mockResolvedValue("Kanflow")
    const out = await exp.exportPlan("p1", "ja", new Date("2026-10-05T15:30:00Z"))
    expect(out.fileName).toBe("plan-Kanflow-2026-10-06.xlsx")
    expect(out.buffer.subarray(0, 2).toString()).toBe("PK")
  })
})
