import ExcelJS from "exceljs"
import { describe, expect, it, vi } from "vitest"

// The template module can load the project (DB); these tests only use its pure builder.
vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { BACKLOG_FIELDS, backlogHeader, backlogHeaderMap, normalizeHeader } from "../backlog.columns"
import {
  IMPORT_MAX_ROWS,
  USER_STORY_MAX,
  changedFields,
  goalIndex,
  parseImportDisplayId,
  planImport,
  readImportSheet,
  referencedDisplayIds,
  summarize,
  type ExistingPbi,
  type ImportContext,
  type ParsedRow,
} from "../backlog.import"
import { buildImportTemplate } from "../backlog.import-template"
import { workbookBuffer } from "../excel.shared"

async function xlsx(sheets: Record<string, unknown[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name)
    for (const r of rows) ws.addRow(r)
  }
  return workbookBuffer(wb)
}

const existing = (over: Partial<ExistingPbi> = {}): ExistingPbi => ({
  id: "pbi-12",
  displayId: 12,
  initiative: null,
  epic: "Epic",
  userStory: "Old story",
  acceptanceCriteria: null,
  referenceDoc: null,
  workloadScore: 3,
  status: "not_ready",
  assignedPo: null,
  poNote: null,
  notReadyReason: null,
  productGoalId: null,
  ...over,
})

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  existing: new Map([[12, existing()]]),
  goals: goalIndex([{ id: "g1", title: "Grow  Sales" }]),
  ...over,
})

const row = (rowNumber: number, cells: ParsedRow["cells"]): ParsedRow => ({ rowNumber, cells })

describe("readImportSheet", () => {
  it("maps headers of any language / project type, ignores unknown columns and blank rows", async () => {
    const buf = await xlsx({
      Notes: [["just text"]],
      Data: [
        ["ID", "改善項目", "Status", "Sprint", "ユーザーストーリー（日本語）", "工数"],
        [12, "Story A", "Ready", "S1", "無視", 5],
        [null, null, null, null, null, null],
        ["", { richText: [{ text: "Rich " }, { text: "story" }] }, "未準備", "", "", ""],
      ],
    })
    const sheet = await readImportSheet(buf)
    expect(sheet.columns).toEqual(["displayId", "userStory", "status", "workloadScore"])
    expect(sheet.rows).toEqual([
      { rowNumber: 2, cells: { displayId: "12", userStory: "Story A", status: "Ready", workloadScore: "5" } },
      { rowNumber: 4, cells: { userStory: "Rich story", status: "未準備" } },
    ])
  })

  it("rejects an unreadable file, a sheet without known headers, and too many rows", async () => {
    await expect(readImportSheet(Buffer.from("PK\u0003\u0004 not really"))).rejects.toMatchObject({ status: 400, extra: { reason: "UNREADABLE" } })
    await expect(readImportSheet(await xlsx({ A: [["foo", "bar"], [1, 2]] }))).rejects.toMatchObject({ extra: { reason: "NO_HEADER" } })
    const many = [["userStory"], ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => [`s${i}`])]
    await expect(readImportSheet(await xlsx({ A: many }))).rejects.toMatchObject({ extra: { reason: "TOO_MANY_ROWS", maxRows: IMPORT_MAX_ROWS } })
    const exact = [["userStory"], ...Array.from({ length: IMPORT_MAX_ROWS }, (_, i) => [`s${i}`])]
    expect((await readImportSheet(await xlsx({ A: exact }))).rows).toHaveLength(IMPORT_MAX_ROWS)
  })

  it("reads the downloaded template back: the example row is a create", async () => {
    const sheet = await readImportSheet(await workbookBuffer(buildImportTemplate("en", "general")), "general")
    expect(sheet.columns).toContain("userStory")
    expect(sheet.rows).toHaveLength(1)
    const [planned] = planImport(sheet.rows, ctx())
    expect(planned).toMatchObject({ action: "create", errors: [] })
    expect(planned.create).toMatchObject({ status: "not_ready", workloadScore: 3 })
  })
})

describe("header table", () => {
  it("maps every localized header of the project's type (any language) back to its own field", () => {
    for (const lang of ["ja", "en", "id"] as const) {
      for (const type of ["software", "process_improvement", "general"] as const) {
        const map = backlogHeaderMap(type)
        const t = getTranslations(lang)
        const pt = getProjectTypeLabels(type, lang)
        for (const field of BACKLOG_FIELDS) {
          expect([lang, type, map.get(normalizeHeader(backlogHeader(field, t, pt)))]).toEqual([lang, type, field])
        }
      }
    }
    // "Initiative" is the epic of a general project but the initiative of a software one
    expect(backlogHeaderMap("general").get("initiative")).toBe("epic")
    expect(backlogHeaderMap("software").get("initiative")).toBe("initiative")
    expect(backlogHeaderMap().get(normalizeHeader("User Story"))).toBe("userStory")
    expect(backlogHeaderMap().get(normalizeHeader("ポイント"))).toBe("workloadScore")
  })
})

describe("planImport", () => {
  it("creates rows without an ID, with defaults left to the service", () => {
    const [p] = planImport([row(2, { userStory: "New", workloadScore: "2", status: "completed", goal: "grow sales" })], ctx())
    expect(p).toMatchObject({ action: "create", displayId: null, label: "New", errors: [] })
    expect(p.create).toEqual({ userStory: "New", workloadScore: 2, status: "completed", productGoalId: "g1" })
  })

  it("labels a preview row by its initiative first, like the backlog list (F-13)", () => {
    const [p] = planImport([row(2, { initiative: "Login", userStory: "As a user" })], ctx())
    expect(p).toMatchObject({ action: "create", label: "Login" })
  })

  it("updates only filled, changed fields of an existing PBI; unchanged rows are skipped", () => {
    const [upd, skip] = planImport(
      [row(2, { displayId: "#12", userStory: "New story", epic: "Epic", workloadScore: "3" }), row(3, { displayId: "PBI-12", epic: "Epic" })],
      ctx({ existing: new Map([[12, existing()]]) })
    )
    expect(upd.errors).toEqual([{ code: "DUPLICATE_ID", field: "displayId", value: "12" }])
    expect(skip.errors).toHaveLength(1)

    const [only] = planImport([row(2, { displayId: "12", userStory: "New story", epic: "Epic", workloadScore: "3" })], ctx())
    expect(only).toMatchObject({ action: "update", displayId: 12, fields: ["userStory"], errors: [] })
    expect(only.update).toEqual({ id: "pbi-12", data: { userStory: "New story" } })

    const [same] = planImport([row(2, { displayId: "12", epic: "Epic" })], ctx())
    expect(same).toMatchObject({ action: "skip", fields: [], errors: [] })
  })

  it("reports row errors with codes", () => {
    const planned = planImport(
      [
        row(2, { displayId: "abc" }),
        row(3, { displayId: "99", userStory: "x" }),
        row(4, { userStory: "x", status: "doing" }),
        row(5, { userStory: "x", workloadScore: "-1" }),
        row(6, { userStory: "x", workloadScore: "1.5" }),
        row(7, { userStory: "x", goal: "Unknown" }),
        row(8, { epic: "only epic" }),
        row(9, { userStory: "x", initiative: "i".repeat(501) }),
        row(10, { userStory: "s".repeat(USER_STORY_MAX + 1) }),
      ],
      ctx()
    )
    expect(planned.map((p) => p.errors.map((e) => e.code))).toEqual([
      ["INVALID_ID"],
      ["PBI_NOT_FOUND"],
      ["INVALID_STATUS"],
      ["INVALID_POINTS"],
      ["INVALID_POINTS"],
      ["GOAL_NOT_FOUND"],
      ["EMPTY_STORY"],
      ["TOO_LONG"],
      ["TOO_LONG"],
    ])
    expect(planned[7].errors[0]).toMatchObject({ field: "initiative" })
    expect(planned.every((p) => !p.create && !p.update)).toBe(true)
    expect(summarize(planned)).toEqual({ total: 9, create: 0, update: 0, skip: 0, error: 9 })
  })

  it("accepts status labels in every language and raw keys", () => {
    const statuses = ["着手可能", "Not Ready", "selesai", "READY", "not_ready"]
    const planned = planImport(statuses.map((s, i) => row(i + 2, { userStory: "x", status: s })), ctx())
    expect(planned.map((p) => p.create?.status)).toEqual(["ready", "not_ready", "completed", "ready", "not_ready"])
  })

  it("summarizes valid rows by action", () => {
    const planned = planImport([row(2, { userStory: "a" }), row(3, { displayId: "12", userStory: "b" }), row(4, { displayId: "12x" })], ctx())
    expect(summarize(planned)).toEqual({ total: 3, create: 1, update: 1, skip: 0, error: 1 })
  })
})

describe("helpers", () => {
  it("parses display ids", () => {
    expect(["12", "#12", "PBI-12", "pbi 12", "１２", "12.0"].map(parseImportDisplayId)).toEqual([12, 12, 12, 12, 12, 12])
    expect(["0", "x", "12a", "-3"].map(parseImportDisplayId)).toEqual([null, null, null, null])
  })

  it("collects referenced display ids once", () => {
    expect(referencedDisplayIds([row(2, { displayId: "3" }), row(3, { displayId: "#3" }), row(4, {}), row(5, { displayId: "bad" })])).toEqual([3])
  })

  it("diffs against the existing PBI (null and missing are equal)", () => {
    expect(changedFields(existing(), { epic: "Epic", poNote: "n", status: "not_ready" })).toEqual({ poNote: "n" })
  })
})
