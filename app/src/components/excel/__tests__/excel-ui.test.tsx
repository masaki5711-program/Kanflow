import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { jsonResponse, renderWithProviders, stubLayout } from "@/components/__tests__/helpers"

const { BacklogImportDialog, rowErrorText, uploadErrorText } = await import("../backlog-import-dialog")
const { BacklogExcelActions } = await import("../backlog-excel-actions")
const { ExcelExportButton, exportHref } = await import("../excel-export-button")
const { ApiError } = await import("@/hooks/api-client")

stubLayout()

const t = getTranslations("en")
const pt = getProjectTypeLabels("software", "en")

const PREVIEW_OK = {
  dryRun: true,
  summary: { total: 2, create: 1, update: 1, skip: 0, error: 0 },
  rows: [
    { rowNumber: 2, action: "create", displayId: null, label: "New story", fields: ["userStory", "productGoalId"], errors: [] },
    { rowNumber: 3, action: "update", displayId: 12, label: "Old", fields: ["workloadScore"], errors: [] },
  ],
}
const PREVIEW_BAD = {
  dryRun: true,
  summary: { total: 1, create: 0, update: 0, skip: 0, error: 1 },
  rows: [{ rowNumber: 4, action: "update", displayId: 99, label: "x", fields: [], errors: [{ code: "PBI_NOT_FOUND", field: "displayId", value: "99" }] }],
}

type Call = { url: string; method?: string; file?: FormDataEntryValue | null }
let calls: Call[] = []
let respond: (c: Call) => Response

beforeEach(() => {
  calls = []
  respond = () => jsonResponse(PREVIEW_OK)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method, file: init?.body instanceof FormData ? init.body.get("file") : null }
      calls.push(call)
      return respond(call)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const xlsx = () => new File(["PK\u0003\u0004"], "backlog.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })

async function chooseAndCheck() {
  const dialog = screen.getByRole("dialog", { name: t.excelImportTitle })
  await userEvent.upload(within(dialog).getByLabelText(t.excelImportChooseFile), xlsx())
  await userEvent.click(within(dialog).getByRole("button", { name: t.excelImportCheck }))
  return dialog
}

describe("ExcelExportButton", () => {
  it("is a download link carrying the UI language and extra params", () => {
    renderWithProviders(<ExcelExportButton href="/api/projects/p1/sprints/export" params={{ sprintId: "s1", empty: undefined }} />, "id")
    const link = screen.getByRole("link", { name: getTranslations("id").excelExport })
    expect(link).toHaveAttribute("href", "/api/projects/p1/sprints/export?lang=id&sprintId=s1")
    expect(link).toHaveAttribute("download")
    expect(exportHref("/x", "ja")).toBe("/x?lang=ja")
  })
})

describe("BacklogExcelActions", () => {
  it("shows import only to editors and opens the dialog", async () => {
    const { unmount } = renderWithProviders(<BacklogExcelActions projectId="p1" canImport={false} onImported={vi.fn()} />)
    expect(screen.getByRole("link", { name: t.excelExport })).toHaveAttribute("href", "/api/projects/p1/backlog/export?lang=en")
    expect(screen.queryByRole("button", { name: t.excelImport })).toBeNull()
    unmount()

    renderWithProviders(<BacklogExcelActions projectId="p1" canImport onImported={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: t.excelImport }))
    expect(screen.getByRole("dialog", { name: t.excelImportTitle })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.excelImportTemplate })).toHaveAttribute("href", "/api/projects/p1/backlog/import/template?lang=en")
  })

  it("exports with the page's filters and says so in the tooltip (F-09)", () => {
    renderWithProviders(<BacklogExcelActions projectId="p1" canImport={false} onImported={vi.fn()} filters={{ status: "ready", q: "login" }} />)
    const link = screen.getByRole("link", { name: t.excelExport })
    expect(link).toHaveAttribute("href", "/api/projects/p1/backlog/export?lang=en&status=ready&q=login")
    expect(link).toHaveAttribute("title", t.backlogExportFilteredHint)
  })
})

describe("BacklogImportDialog", () => {
  it("previews with a dry run, then imports the same file and reports the result", async () => {
    const onImported = vi.fn()
    const onClose = vi.fn()
    renderWithProviders(<BacklogImportDialog projectId="p1" onClose={onClose} onImported={onImported} />)
    const dialog = await chooseAndCheck()

    expect(calls[0]).toMatchObject({ url: "/api/projects/p1/backlog/import?dryRun=1", method: "POST" })
    expect((calls[0].file as File).name).toBe("backlog.xlsx")
    expect(await within(dialog).findByText("1 to add · 1 to update · 0 unchanged · 0 errors")).toBeInTheDocument()
    expect(within(dialog).getByText(`${pt.backlogUserStory}, ${t.excelColGoal}`)).toBeInTheDocument()
    expect(within(dialog).getByText("#12")).toBeInTheDocument()

    respond = () => jsonResponse({ ...PREVIEW_OK, dryRun: false, created: 1, updated: 1 })
    await userEvent.click(within(dialog).getByRole("button", { name: t.excelImportRun }))
    await waitFor(() => expect(onImported).toHaveBeenCalled())
    expect(calls[1]).toMatchObject({ url: "/api/projects/p1/backlog/import", method: "POST" })
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByText("Added 1 and updated 1 items")).toBeInTheDocument()
  })

  it("shows row errors and blocks the import", async () => {
    respond = () => jsonResponse(PREVIEW_BAD)
    renderWithProviders(<BacklogImportDialog projectId="p1" onClose={vi.fn()} onImported={vi.fn()} />)
    const dialog = await chooseAndCheck()
    expect(await within(dialog).findByText("No PBI with ID 99 (deleted or in another project)")).toBeInTheDocument()
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.excelImportHasErrors)
    expect(within(dialog).getByRole("button", { name: t.excelImportRun })).toBeDisabled()

    await userEvent.click(within(dialog).getByRole("button", { name: t.excelImportBack }))
    expect(within(dialog).getByRole("button", { name: t.excelImportCheck })).toBeInTheDocument()
  })

  it("shows the refused preview when the commit finds new errors", async () => {
    renderWithProviders(<BacklogImportDialog projectId="p1" onClose={vi.fn()} onImported={vi.fn()} />)
    const dialog = await chooseAndCheck()
    respond = () => jsonResponse({ error: "rows", code: "VALIDATION", reason: "ROW_ERRORS", ...PREVIEW_BAD }, 400)
    await userEvent.click(await within(dialog).findByRole("button", { name: t.excelImportRun }))
    expect(await within(dialog).findByText("No PBI with ID 99 (deleted or in another project)")).toBeInTheDocument()
  })

  it("explains file-level rejections", async () => {
    respond = () => jsonResponse({ error: "x", code: "VALIDATION", reason: "TOO_MANY_ROWS", maxRows: 500 }, 400)
    renderWithProviders(<BacklogImportDialog projectId="p1" onClose={vi.fn()} onImported={vi.fn()} />)
    const dialog = await chooseAndCheck()
    expect(await within(dialog).findByText("The file has more than 500 rows. Split it and import each part")).toBeInTheDocument()
  })

  it("refuses an oversized file before uploading", async () => {
    renderWithProviders(<BacklogImportDialog projectId="p1" onClose={vi.fn()} onImported={vi.fn()} />)
    const dialog = screen.getByRole("dialog", { name: t.excelImportTitle })
    const big = new File(["x"], "big.xlsx")
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 })
    await userEvent.upload(within(dialog).getByLabelText(t.excelImportChooseFile), big)
    expect(within(dialog).getByRole("button", { name: t.excelImportCheck })).toBeDisabled()
    expect(calls).toEqual([])
  })
})

describe("message helpers", () => {
  it("localizes row errors with the workbook's column names", () => {
    expect(rowErrorText({ code: "TOO_LONG", field: "initiative" }, t, pt)).toBe(`"${pt.backlogInitiative}" is too long`)
    expect(rowErrorText({ code: "INVALID_STATUS", field: "status", value: "doing" }, t, pt)).toContain('"doing"')
    // The points error names the column as the workbook header does (project-type wording, F-13).
    expect(rowErrorText({ code: "INVALID_POINTS", field: "workloadScore", value: "-1" }, t, pt)).toBe(`${pt.backlogWorkloadScore} "-1" must be a whole number of 0 or more`)
  })

  it("maps upload reasons and falls back to the API message", () => {
    expect(uploadErrorText(new ApiError("x", 400, { reason: "UNREADABLE" }), t)).toBe(t.excelImportErrUnreadable)
    expect(uploadErrorText(new ApiError("x", 400, { reason: "NO_HEADER" }), t)).toBe(t.excelImportErrNoHeader)
    expect(uploadErrorText(new ApiError("Server said no", 500, {}), t)).toBe("Server said no")
  })
})
