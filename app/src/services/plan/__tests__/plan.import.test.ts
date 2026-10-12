import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
}))
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const act = await import("@/services/_shared/activity")
const tr = await import("@/services/_shared/translations")
const db = await import("@/services/_shared/db")
const { ACTOR } = await import("@/services/__tests__/support")
const { planRow } = await import("./plan-fixtures")
const { importPlanRows, checkImportRows } = await import("../plan.import")

type Row = Parameters<typeof checkImportRows>[0][number]
const row = (over: Partial<Row> = {}): Row => ({ depth: 0, name: "Stage", plannedStart: null, plannedEnd: null, ownerId: null, ...over })
const MEMBERS = new Set(["u1"])

describe("checkImportRows", () => {
  it("accepts a valid outline", () => {
    const rows = [row({ plannedStart: "2026-11-01", plannedEnd: "2026-11-05", ownerId: "u1" }), row({ depth: 1 }), row({ depth: 2 }), row({ depth: 1 })]
    expect(checkImportRows(rows, MEMBERS).errors).toEqual([])
  })

  it("reports every problem with its 1-based row", () => {
    const rows = [
      row({ depth: 1 }),
      row({ name: "  " }),
      row({ plannedStart: "2026-11-01" }),
      row({ plannedStart: "2026-11-05", plannedEnd: "2026-11-01" }),
      row({ plannedStart: "2026-02-30", plannedEnd: "2026-03-01" }),
      row({ ownerId: "ghost" }),
      row({ depth: 6 }),
      row({ depth: 0 }),
      row({ depth: 2 }),
    ]
    expect(checkImportRows(rows, MEMBERS).errors).toEqual([
      { row: 1, code: "order" },
      { row: 2, code: "name" },
      { row: 3, code: "dates" },
      { row: 4, code: "dates" },
      { row: 5, code: "dates" },
      { row: 6, code: "owner" },
      { row: 7, code: "depth" },
      { row: 9, code: "order" },
    ])
  })

  it("a milestone whose start differs from its end is a dates error", () => {
    const { errors } = checkImportRows([row({ isMilestone: true, plannedStart: "2026-11-03", plannedEnd: "2026-11-04" })], MEMBERS)
    expect(errors).toEqual([{ row: 1, code: "dates" }])
  })

  it("a milestone is one day (the start, else the end) and needs no pair", () => {
    const { errors, checked } = checkImportRows([row({ isMilestone: true, plannedStart: "2026-11-03" }), row({ isMilestone: true, plannedEnd: "2026-11-04" })], MEMBERS)
    expect(errors).toEqual([])
    expect(checked[0].start).toEqual(checked[0].end)
    expect(checked[1].start).toEqual(new Date("2026-11-04T00:00:00.000Z"))
  })
})

describe("importPlanRows", () => {
  let n = 0
  beforeEach(() => {
    vi.clearAllMocks()
    n = 0
    vi.mocked(repo.isProjectMember).mockResolvedValue(true)
    vi.mocked(repo.findPlanItem).mockResolvedValue(planRow({ id: "par" }) as never)
    vi.mocked(repo.nextPlanSortOrder).mockResolvedValue(5)
    vi.mocked(repo.insertPlanItem).mockImplementation((async (_tx: unknown, data: Record<string, unknown>) => ({ ...data, id: `n${++n}` })) as never)
  })

  const outline = [row({ name: "A", ownerId: "u1" }), row({ depth: 1, name: "A1" }), row({ depth: 1, name: "A2" }), row({ name: "B" })]

  it("preview validates without writing", async () => {
    const out = await importPlanRows("p1", { apply: false, rows: outline }, ACTOR)
    expect(out).toEqual({ applied: false, count: 4, errors: [], createdIds: [] })
    expect(db.withTransaction).not.toHaveBeenCalled()
  })

  it("writes nothing when any row has an error", async () => {
    const out = await importPlanRows("p1", { apply: true, rows: [row({ name: "" })] }, ACTOR)
    expect(out).toMatchObject({ applied: false, errors: [{ row: 1, code: "name" }], createdIds: [] })
    expect(repo.insertPlanItem).not.toHaveBeenCalled()
  })

  it("reports a missing parent", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue(null as never)
    const out = await importPlanRows("p1", { apply: true, parentId: "gone", rows: outline }, ACTOR)
    expect(out.errors).toEqual([{ row: 1, code: "parent" }])
    expect(db.withTransaction).toHaveBeenCalledOnce()
    expect(repo.insertPlanItem).not.toHaveBeenCalled()
  })

  it("creates the tree in one transaction under the parent with running sort orders", async () => {
    const out = await importPlanRows("p1", { apply: true, parentId: "par", rows: outline }, ACTOR)
    expect(out).toMatchObject({ applied: true, count: 4, createdIds: ["n1", "n2", "n3", "n4"] })
    expect(db.withTransaction).toHaveBeenCalledOnce()
    const data = vi.mocked(repo.insertPlanItem).mock.calls.map((c) => c[1])
    expect(data.map((d) => [d.name, d.parentId, d.sortOrder])).toEqual([
      ["A", "par", 5],
      ["A1", "n1", 5],
      ["A2", "n1", 6],
      ["B", "par", 6],
    ])
    expect(tr.enqueueIn).toHaveBeenCalledTimes(4)
    expect(act.logActivity).toHaveBeenCalledOnce()
    expect(act.logCreate).toHaveBeenCalledTimes(2)
  })
})
