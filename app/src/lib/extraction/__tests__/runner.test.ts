import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import ExcelJS from "exceljs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { parseWorkerMessage, runExtraction } from "../runner"

describe("parseWorkerMessage", () => {
  it("accepts a well-formed success message", () => {
    expect(parseWorkerMessage({ ok: true, text: "x", clipped: true })).toEqual({
      ok: true,
      value: { text: "x", clipped: true },
    })
  })

  it("passes through worker errors", () => {
    expect(parseWorkerMessage({ ok: false, error: "bad zip" })).toEqual({ ok: false, error: "bad zip" })
  })

  it("rejects malformed messages", () => {
    expect(parseWorkerMessage(null)).toEqual({ ok: false, error: "malformed worker response" })
    expect(parseWorkerMessage({ ok: true, text: 5 })).toEqual({ ok: false, error: "malformed worker response" })
  })
})

// Real round trip: spawns workers/extract-worker.cjs (resolved from cwd = app root).
describe("runExtraction (real worker)", () => {
  let dir = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "kanflow-extract-"))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("extracts every sheet of an xlsx as CSV text", async () => {
    const wb = new ExcelJS.Workbook()
    const goals = wb.addWorksheet("Goals")
    goals.addRow(["Goal", "Owner", "Points"])
    goals.addRow(["Ship v1, fast", "山田", 8])
    goals.addRow(["Quote \"test\"", { richText: [{ text: "rich" }, { text: "Text" }] }, { formula: "1+1", result: 2 }])
    const notes = wb.addWorksheet("Notes")
    notes.addRow(["hello"])
    const file = path.join(dir, "sample.xlsx")
    await wb.xlsx.writeFile(file)

    const out = await runExtraction({ format: "xlsx", filePath: file })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.clipped).toBe(false)
    expect(out.value.text).toBe(
      [
        "# Sheet: Goals",
        "Goal,Owner,Points",
        '"Ship v1, fast",山田,8',
        '"Quote ""test""",richText,2',
        "",
        "# Sheet: Notes",
        "hello",
      ].join("\n"),
    )
  }, 30_000)

  it("returns a failure (not a crash) for a corrupt file", async () => {
    const file = path.join(dir, "broken.xlsx")
    await writeFile(file, "this is not a zip")
    const out = await runExtraction({ format: "xlsx", filePath: file })
    expect(out.ok).toBe(false)
  }, 30_000)
})
