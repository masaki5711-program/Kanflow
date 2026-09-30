import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"

const db = vi.hoisted(() => ({ current: null as unknown }))

vi.mock("@/services/_shared/db", () => ({
  get defaultDb() {
    return db.current
  },
  withTransaction: vi.fn(),
}))
vi.mock("@/services/_shared/translations", () => ({ getI18nFor: vi.fn(async () => new Map()) }))

const { exportSprints, toSprintExportRow } = await import("../sprints.export")
const { exportIcebox } = await import("../icebox.export")
const { loadWorkbook } = await import("../excel.shared")

const load = (buffer: Buffer) => loadWorkbook(buffer)

function table(ws: ExcelJS.Worksheet): Array<Record<string, unknown>> {
  const headers = (ws.getRow(1).values as unknown[]).slice(1).map(String)
  const out: Array<Record<string, unknown>> = []
  for (let r = 2; r <= ws.rowCount; r++) {
    out.push(Object.fromEntries(headers.map((h, i) => [h, ws.getRow(r).getCell(i + 1).value])))
  }
  return out
}

const task = (over: Record<string, unknown> = {}) => ({
  taskName: "Build",
  status: "todo",
  assignee: "legacy",
  estimatedHours: 2,
  actualHours: null,
  completedAt: null,
  assignees: [],
  pbItem: { displayId: 3, userStory: "Story", initiative: null },
  ...over,
})

const sprint = (over: Record<string, unknown> = {}) => ({
  sprintName: "S1",
  status: "active",
  startDate: new Date("2026-09-01T00:00:00Z"),
  endDate: new Date("2026-09-14T00:00:00Z"),
  sprintGoal: "Ship",
  capacity: 20,
  actualScore: 8,
  items: [task(), task({ taskName: "", status: "done" }), task({ taskName: "Test", status: "done", assignees: [{ user: { name: "Ana" } }, { user: { name: "Budi" } }], completedAt: new Date("2026-09-05T01:00:00Z") })],
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("toSprintExportRow", () => {
  it("drops placeholder rows and prefers normalized assignees", () => {
    const row = toSprintExportRow(sprint() as never)
    expect(row.tasks.map((t) => [t.taskName, t.assignee])).toEqual([["Build", "legacy"], ["Test", "Ana, Budi"]])
  })
})

describe("exportSprints", () => {
  it("writes a sprints sheet and a tasks sheet in the viewer language", async () => {
    const fake = fakeDb({ "project.findFirst": { name: "P", projectType: "software" }, "sprint.findMany": [sprint()] })
    db.current = fake.client
    const out = await exportSprints("proj", undefined, "en", new Date("2026-09-30T00:00:00Z"))
    expect(out.fileName).toBe("sprints-P-2026-09-30.xlsx")
    expect(fake.fn("sprint.findMany").mock.calls[0][0].where).toEqual({ projectId: "proj" })
    expect(fake.fn("sprint.findMany").mock.calls[0][0].select.items.where).toEqual({ pbItem: { deletedAt: null } })

    const wb = await load(out.buffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Sprints", "Tasks"])
    const [s] = table(wb.getWorksheet("Sprints")!)
    expect(s).toMatchObject({ "Sprint name": "S1", Status: "Active", "Sprint Goal": "Ship", Capacity: 20, "Completed points": 8, Tasks: 2, "Tasks done": 1 })
    expect((s["Start date"] as Date).toISOString()).toBe("2026-09-01T09:00:00.000Z")
    const tasks = table(wb.getWorksheet("Tasks")!)
    expect(tasks).toHaveLength(2)
    expect(tasks[1]).toMatchObject({ Sprint: "S1", ID: 3, PBI: "Story", Task: "Test", Assignee: "Ana, Budi", Status: "Done" })
    expect(wb.getWorksheet("Tasks")!.getRow(1).font?.bold).toBe(true)
  })

  it("narrows to one sprint and 404s for a sprint of another project", async () => {
    const fake = fakeDb({ "project.findFirst": { name: "P", projectType: "software" }, "sprint.findMany": [sprint({ sprintName: "Alpha" })] })
    db.current = fake.client
    const out = await exportSprints("proj", "s9", "ja", new Date("2026-09-30T00:00:00Z"))
    expect(fake.fn("sprint.findMany").mock.calls[0][0].where).toEqual({ projectId: "proj", id: "s9" })
    expect(out.fileName).toBe("sprint-P_Alpha-2026-09-30.xlsx")
    expect((await load(out.buffer)).worksheets.map((w) => w.name)).toEqual(["スプリント", "タスク"])

    db.current = fakeDb({ "project.findFirst": { name: "P", projectType: "software" }, "sprint.findMany": [] }).client
    await expect(exportSprints("proj", "other", "ja")).rejects.toMatchObject({ status: 404, code: "SPRINT_NOT_FOUND" })
  })
})

describe("exportIcebox", () => {
  it("exports live requests grouped by status with the PBIs created from them", async () => {
    const base = {
      background: null, author: "Ana", assignedPo: "Po", pbEpic: null, rejectionReason: null, freezeReason: null,
      createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-02T00:00:00Z"),
    }
    const fake = fakeDb({
      "project.findFirst": { name: "P", projectType: "general" },
      "iceboxItem.findMany": [
        { ...base, displayId: 1, request: "Frozen one", status: "frozen", backlogItems: [] },
        { ...base, displayId: 2, request: "New one", status: "unreviewed", backlogItems: [{ displayId: 4 }, { displayId: 9 }] },
      ],
    })
    db.current = fake.client
    const out = await exportIcebox("proj", "id", new Date("2026-09-30T00:00:00Z"))
    expect(out.fileName).toBe("icebox-P-2026-09-30.xlsx")
    expect(fake.fn("iceboxItem.findMany").mock.calls[0][0].where).toEqual({ projectId: "proj", deletedAt: null })
    const ws = (await load(out.buffer)).getWorksheet("IceBox")!
    const rows = table(ws)
    expect(rows.map((r) => r.ID)).toEqual([2, 1])
    expect(rows[0]).toMatchObject({ Status: "Belum Ditinjau PO", "PBI yang dibuat": "#4, #9", "Diajukan oleh": "Ana" })
  })
})
