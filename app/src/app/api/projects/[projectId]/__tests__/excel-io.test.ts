import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/excel/backlog.export", () => ({ exportBacklog: vi.fn() }))
vi.mock("@/services/excel/sprints.export", () => ({ exportSprints: vi.fn() }))
vi.mock("@/services/excel/icebox.export", () => ({ exportIcebox: vi.fn() }))
vi.mock("@/services/excel/backlog.import-template", () => ({ importTemplate: vi.fn() }))
vi.mock("@/services/excel/backlog.import.service", () => ({ importBacklog: vi.fn() }))
vi.mock("@/services/excel/excel.lang", () => ({ resolveExcelLang: vi.fn(async (r: Request) => new URL(r.url).searchParams.get("lang") ?? "ja") }))

const backlogExport = await import("@/services/excel/backlog.export")
const sprintsExport = await import("@/services/excel/sprints.export")
const iceboxExport = await import("@/services/excel/icebox.export")
const template = await import("@/services/excel/backlog.import-template")
const importSvc = await import("@/services/excel/backlog.import.service")
const backlogRoute = await import("@/app/api/projects/[projectId]/backlog/export/route")
const sprintsRoute = await import("@/app/api/projects/[projectId]/sprints/export/route")
const iceboxRoute = await import("@/app/api/projects/[projectId]/icebox/export/route")
const templateRoute = await import("@/app/api/projects/[projectId]/backlog/import/template/route")
const importRoute = await import("@/app/api/projects/[projectId]/backlog/import/route")
const { IMPORT_MAX_BYTES } = await import("@/services/excel/backlog.import")

const FILE = { buffer: Buffer.from("xlsx-bytes"), fileName: "backlog-案件-2026-09-30.xlsx" }
const BASE = `http://localhost/api/projects/${PROJECT_ID}`

async function xlsxBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet("B").addRow(["User Story"])
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

function upload(query: string, file: Blob | null, name = "b.xlsx", headers: Record<string, string> = {}): Request {
  const form = new FormData()
  if (file) form.set("file", file, name)
  return new Request(`${BASE}/backlog/import${query}`, { method: "POST", body: form, headers })
}

beforeEach(() => {
  vi.mocked(backlogExport.exportBacklog).mockReset().mockResolvedValue(FILE)
  vi.mocked(sprintsExport.exportSprints).mockReset().mockResolvedValue(FILE)
  vi.mocked(iceboxExport.exportIcebox).mockReset().mockResolvedValue(FILE)
  vi.mocked(template.importTemplate).mockReset().mockResolvedValue(FILE)
  vi.mocked(importSvc.importBacklog).mockReset().mockResolvedValue({ dryRun: true, summary: { total: 0, create: 0, update: 0, skip: 0, error: 0 }, rows: [] })
})

describe("GET exports", () => {
  it("streams an xlsx download to any member, in the requested language", async () => {
    asRole("dev")
    const res = await backlogRoute.GET(new Request(`${BASE}/backlog/export?lang=id`), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent(FILE.fileName)}`)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("xlsx-bytes")
    expect(backlogExport.exportBacklog).toHaveBeenCalledWith(PROJECT_ID, "id")
  })

  it("passes ?sprintId= through and exports IceBox for section managers too", async () => {
    asRole("dev")
    expect((await sprintsRoute.GET(new Request(`${BASE}/sprints/export?sprintId=s1`), ctx())).status).toBe(200)
    expect(sprintsExport.exportSprints).toHaveBeenCalledWith(PROJECT_ID, "s1", "ja")
    await sprintsRoute.GET(new Request(`${BASE}/sprints/export`), ctx())
    expect(sprintsExport.exportSprints).toHaveBeenLastCalledWith(PROJECT_ID, undefined, "ja")

    asRole(null, "admin")
    expect((await iceboxRoute.GET(new Request(`${BASE}/icebox/export`), ctx())).status).toBe(200)
  })

  it("401 / 404 for signed-out users and outsiders; service errors map to status", async () => {
    signedOut()
    expect((await backlogRoute.GET(new Request(`${BASE}/backlog/export`), ctx())).status).toBe(401)
    asRole(null)
    expect((await iceboxRoute.GET(new Request(`${BASE}/icebox/export`), ctx())).status).toBe(404)
    expect(iceboxExport.exportIcebox).not.toHaveBeenCalled()

    asRole("po")
    const { NotFoundError } = await import("@/services/_shared/errors")
    vi.mocked(sprintsExport.exportSprints).mockRejectedValue(new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND"))
    expect(await read(await sprintsRoute.GET(new Request(`${BASE}/sprints/export?sprintId=x`), ctx()))).toMatchObject({ status: 404, body: { code: "SPRINT_NOT_FOUND" } })
  })
})

describe("backlog import", () => {
  it("template and import need backlog.write (PO / SM), not dev", async () => {
    asRole("dev")
    expect((await templateRoute.GET(new Request(`${BASE}/backlog/import/template`), ctx())).status).toBe(403)
    expect((await importRoute.POST(upload("?dryRun=1", new Blob([await xlsxBytes()])), ctx())).status).toBe(403)
    expect(importSvc.importBacklog).not.toHaveBeenCalled()

    asRole("sm")
    expect((await templateRoute.GET(new Request(`${BASE}/backlog/import/template`), ctx())).status).toBe(200)
  })

  it("dry run passes the checked bytes and the actor to the service", async () => {
    asRole("po")
    const bytes = await xlsxBytes()
    const res = await importRoute.POST(upload("?dryRun=1", new Blob([bytes])), ctx())
    expect(res.status).toBe(200)
    const [projectId, buffer, actor, opts] = vi.mocked(importSvc.importBacklog).mock.calls[0]
    expect([projectId, Buffer.compare(buffer as Buffer, Buffer.from(bytes)), actor, opts]).toEqual([PROJECT_ID, 0, ACTOR, { dryRun: true }])

    await importRoute.POST(upload("", new Blob([bytes])), ctx())
    expect(vi.mocked(importSvc.importBacklog).mock.calls[1][3]).toEqual({ dryRun: false })
  })

  it("rejects missing, empty, oversized, wrongly named and disguised files", async () => {
    asRole("po")
    const cases: Array<[Request, number, string]> = [
      [upload("?dryRun=1", null), 400, "FILE_REQUIRED"],
      [new Request(`${BASE}/backlog/import`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), 400, "FILE_REQUIRED"],
      [upload("?dryRun=1", new Blob([])), 400, "FILE_EMPTY"],
      [upload("?dryRun=1", new Blob([new Uint8Array(IMPORT_MAX_BYTES + 1)])), 413, "PAYLOAD_TOO_LARGE"],
      [upload("?dryRun=1", new Blob([await xlsxBytes()]), "b.csv"), 415, "UNSUPPORTED_MEDIA"],
      [upload("?dryRun=1", new Blob(["MZ this is not a zip"]), "evil.xlsx"), 415, "FILE_TYPE_MISMATCH"],
      [upload("?dryRun=1", new Blob(["x"]), "b.xlsx", { "content-length": String(IMPORT_MAX_BYTES * 2) }), 413, "PAYLOAD_TOO_LARGE"],
    ]
    for (const [request, status, code] of cases) {
      expect(await read(await importRoute.POST(request, ctx()))).toMatchObject({ status, body: { code } })
    }
    expect(importSvc.importBacklog).not.toHaveBeenCalled()
  })

  it("returns the preview with a 400 when the commit finds row errors", async () => {
    asRole("po")
    const { ValidationError } = await import("@/services/_shared/errors")
    vi.mocked(importSvc.importBacklog).mockRejectedValue(new ValidationError("rows", { reason: "ROW_ERRORS", rows: [{ rowNumber: 2 }] }, "VALIDATION"))
    expect(await read(await importRoute.POST(upload("", new Blob([await xlsxBytes()])), ctx()))).toMatchObject({
      status: 400,
      body: { code: "VALIDATION", reason: "ROW_ERRORS", rows: [{ rowNumber: 2 }] },
    })
  })
})
