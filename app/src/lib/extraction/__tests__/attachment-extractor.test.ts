import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const runExtraction = vi.fn()
vi.mock("@/lib/extraction/runner", () => ({ runExtraction: (...a: unknown[]) => runExtraction(...a) }))

import { extractAttachment } from "@/lib/attachment-extractor"
import { MAX_CHARS, MAX_EXTRACT_BYTES, detectFormat } from "../formats"

const PROJECT = "p1"
let root = ""

async function put(name: string, content: string) {
  await writeFile(path.join(root, "private", "uploads", PROJECT, name), content)
}

describe("extractAttachment", () => {
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "kanflow-att-"))
    await mkdir(path.join(root, "private", "uploads", PROJECT), { recursive: true })
    vi.spyOn(process, "cwd").mockReturnValue(root)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  beforeEach(() => runExtraction.mockReset())

  it("rejects path traversal", async () => {
    const r = await extractAttachment({ projectId: PROJECT, fileName: "../../x", mimeType: "text/plain", originalName: "x.txt" })
    expect(r).toEqual({ ok: false, error: "invalid path" })
  })

  it("reads csv directly without a worker", async () => {
    await put("a.csv", "a,b\r\n1,2\r\n")
    const r = await extractAttachment({ projectId: PROJECT, fileName: "a.csv", mimeType: "text/csv", originalName: "a.csv" })
    expect(r).toEqual({ ok: true, text: "a,b\n1,2", truncated: false, format: "text" })
    expect(runExtraction).not.toHaveBeenCalled()
  })

  it("truncates long text files", async () => {
    await put("big.txt", "x".repeat(MAX_CHARS * 5))
    const r = await extractAttachment({ projectId: PROJECT, fileName: "big.txt", mimeType: "text/plain", originalName: "big.txt" })
    expect(r.ok && r.truncated).toBe(true)
    expect(r.ok && r.text.length).toBeLessThan(MAX_CHARS + 50)
  })

  it("returns a clear error for legacy .xls instead of crashing", async () => {
    await put("old.xls", "binary")
    const r = await extractAttachment({ projectId: PROJECT, fileName: "old.xls", mimeType: "application/vnd.ms-excel", originalName: "old.xls" })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/unsupported legacy format \(\.xls\)/)
    expect(runExtraction).not.toHaveBeenCalled()
  })

  it("refuses to analyze files above the size cap", async () => {
    const file = path.join(root, "private", "uploads", PROJECT, "huge.pdf")
    const h = await open(file, "w")
    await h.truncate(MAX_EXTRACT_BYTES + 1)
    await h.close()
    const r = await extractAttachment({ projectId: PROJECT, fileName: "huge.pdf", mimeType: "application/pdf", originalName: "huge.pdf" })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/too large to analyze/)
    expect(runExtraction).not.toHaveBeenCalled()
  })

  it("delegates binary formats to the worker and truncates the result", async () => {
    await put("s.xlsx", "zip")
    runExtraction.mockResolvedValue({ ok: true, value: { text: "# Sheet: A\n1,2", clipped: false } })
    const r = await extractAttachment({
      projectId: PROJECT,
      fileName: "s.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      originalName: "s.xlsx",
    })
    expect(r).toEqual({ ok: true, text: "# Sheet: A\n1,2", truncated: false, format: "xlsx" })
    expect(runExtraction).toHaveBeenCalledWith({
      format: "xlsx",
      filePath: path.join(root, "private", "uploads", PROJECT, "s.xlsx"),
    })
  })

  it("marks worker-clipped output as truncated and surfaces worker errors", async () => {
    await put("d.docx", "zip")
    const args = { projectId: PROJECT, fileName: "d.docx", mimeType: "", originalName: "d.docx" }
    runExtraction.mockResolvedValueOnce({ ok: true, value: { text: "short", clipped: true } })
    const clipped = await extractAttachment(args)
    expect(clipped.ok && clipped.truncated).toBe(true)

    runExtraction.mockResolvedValueOnce({ ok: false, error: "timed out after 60s" })
    await expect(extractAttachment(args)).resolves.toEqual({ ok: false, error: "extraction failed: timed out after 60s" })
  })

  it("reports missing files as extraction failures", async () => {
    const r = await extractAttachment({ projectId: PROJECT, fileName: "nope.pdf", mimeType: "application/pdf", originalName: "nope.pdf" })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/^extraction failed:/)
  })
})

describe("detectFormat", () => {
  it.each([
    ["application/pdf", "a.pdf", "pdf"],
    ["", "a.docx", "docx"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "a.bin", "xlsx"],
    ["application/vnd.ms-excel", "a.xls", "xls"],
    ["", "a.ppt", "ppt"],
    ["application/msword", "a.doc", "doc"],
    ["", "a.csv", "text"],
    ["image/png", "a.png", null],
  ])("%s %s -> %s", (mime, name, expected) => {
    expect(detectFormat(mime, name)).toBe(expected)
  })
})
