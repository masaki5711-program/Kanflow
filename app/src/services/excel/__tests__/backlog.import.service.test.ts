import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, TX, prismaError } from "@/services/__tests__/support"
import { fakeDb, type FakeDb } from "@/services/__tests__/fake-db"

const h = vi.hoisted(() => ({
  db: null as unknown,
  withTransaction: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  prepareText: vi.fn(),
  assertProjectLive: vi.fn(),
}))

vi.mock("@/services/_shared/db", () => ({
  get defaultDb() {
    return h.db
  },
  withTransaction: h.withTransaction,
}))
vi.mock("@/services/_shared/translations", () => ({ prepareText: h.prepareText }))
vi.mock("@/services/_shared/soft-delete", async (orig) => ({
  ...(await orig<typeof import("@/services/_shared/soft-delete")>()),
  assertProjectLive: h.assertProjectLive,
}))
vi.mock("@/services/backlog/backlog.service", () => ({
  insertBacklogItemIn: h.insert,
  updateBacklogItemIn: h.update,
  emptyLinksToNull: <T,>(d: T) => d,
}))

const { importBacklog } = await import("../backlog.import.service")
const { workbookBuffer } = await import("../excel.shared")

async function sheet(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Backlog")
  for (const r of rows) ws.addRow(r)
  return workbookBuffer(wb)
}

const PBI_12 = {
  id: "pbi-12", displayId: 12, initiative: null, epic: null, userStory: "Old", acceptanceCriteria: null, referenceDoc: null,
  workloadScore: 1, status: "not_ready", assignedPo: null, poNote: null, notReadyReason: null, productGoalId: null,
}

let fake: FakeDb

beforeEach(() => {
  vi.clearAllMocks()
  fake = fakeDb({
    "project.findFirst": { name: "P", projectType: "software" },
    "productBacklogItem.findMany": [PBI_12],
    "productGoal.findMany": [{ id: "g1", title: "Goal" }],
  })
  h.db = fake.client
  h.withTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(TX))
  h.prepareText.mockImplementation(async (d: unknown) => d)
  h.insert.mockResolvedValue({})
  h.update.mockResolvedValue({})
  h.assertProjectLive.mockResolvedValue(undefined)
})

describe("importBacklog dry run", () => {
  it("previews create / update / skip without writing", async () => {
    const buf = await sheet([["ID", "User Story", "Product goal"], ["", "New", "Goal"], [12, "Changed", ""], ["#12", "Old", ""]])
    const out = await importBacklog("proj", buf, ACTOR, { dryRun: true })
    expect(out.dryRun).toBe(true)
    expect(out.rows.map((r) => [r.rowNumber, r.action, r.errors.map((e) => e.code)])).toEqual([
      [2, "create", []],
      [3, "update", ["DUPLICATE_ID"]],
      [4, "update", ["DUPLICATE_ID"]],
    ])
    // only the referenced PBIs are loaded, live and inside the project
    expect(fake.fn("productBacklogItem.findMany").mock.calls[0][0].where).toEqual({ projectId: "proj", displayId: { in: [12] }, deletedAt: null })
    expect(fake.fn("productGoal.findMany").mock.calls[0][0].where).toEqual({ projectId: "proj" })
    expect(h.withTransaction).not.toHaveBeenCalled()
    expect(h.prepareText).not.toHaveBeenCalled()
    expect(out.rows[0]).not.toHaveProperty("create")
  })
})

describe("importBacklog commit", () => {
  it("refuses a file with row errors (400 with the preview) and writes nothing", async () => {
    const buf = await sheet([["ID", "User Story"], [99, "x"], ["", "ok"]])
    const err = await importBacklog("proj", buf, ACTOR, { dryRun: false }).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 400, code: "VALIDATION", extra: { reason: "ROW_ERRORS", summary: { error: 1, create: 1 } } })
    expect(h.withTransaction).not.toHaveBeenCalled()
  })

  it("writes creates and updates in one transaction through the service bodies", async () => {
    const buf = await sheet([["ID", "User Story", "Points", "Status"], ["", "New", 2, "Ready"], [12, "Changed", "", ""], ["", "Second", "", ""]])
    const out = await importBacklog("proj", buf, ACTOR, { dryRun: false })
    expect(out).toMatchObject({ dryRun: false, created: 2, updated: 1, summary: { create: 2, update: 1, error: 0 } })
    expect(h.withTransaction).toHaveBeenCalledTimes(1)
    expect(h.assertProjectLive).toHaveBeenCalledWith(TX, "proj")
    expect(h.insert.mock.calls).toEqual([
      [TX, "proj", { userStory: "New", workloadScore: 2, status: "ready" }, ACTOR],
      [TX, "proj", { userStory: "Second" }, ACTOR],
    ])
    expect(h.update).toHaveBeenCalledWith(TX, "proj", "pbi-12", { userStory: "Changed" }, ACTOR)
    expect(h.prepareText).toHaveBeenCalledTimes(3)
  })

  it("does not open a transaction when every row is unchanged", async () => {
    const out = await importBacklog("proj", await sheet([["ID", "User Story"], [12, "Old"]]), ACTOR, { dryRun: false })
    expect(out).toMatchObject({ created: 0, updated: 0, summary: { skip: 1 } })
    expect(h.withTransaction).not.toHaveBeenCalled()
  })

  it("retries the whole transaction on a displayId race, then maps it to 409", async () => {
    h.insert.mockRejectedValueOnce(prismaError("P2002"))
    await importBacklog("proj", await sheet([["User Story"], ["a"]]), ACTOR, { dryRun: false })
    expect(h.withTransaction).toHaveBeenCalledTimes(2)

    h.withTransaction.mockClear()
    h.insert.mockRejectedValue(prismaError("P2002"))
    await expect(importBacklog("proj", await sheet([["User Story"], ["a"]]), ACTOR, { dryRun: false })).rejects.toMatchObject({ status: 409 })
    expect(h.withTransaction).toHaveBeenCalledTimes(3)
  })
})
