import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/extraction/runner", () => ({ runExtraction: vi.fn() }))

const { fileText, looksBinary } = await import("../repo-index-content")
const { runExtraction } = await import("@/lib/extraction/runner")

describe("fileText", () => {
  it("decodes UTF-8 text and redacts secrets", async () => {
    expect(await fileText("a.md", "text", Buffer.from("# 仕様\nDB_PASSWORD=hunter2hunter2"))).toEqual({ ok: true, text: "# 仕様\nDB_PASSWORD=[REDACTED]" })
  })

  it("refuses binary content disguised as text, and empty files", async () => {
    expect(looksBinary(Buffer.from([0x50, 0x4b, 0x00, 0x03]))).toBe(true)
    expect(await fileText("a.txt", "text", Buffer.from([0x41, 0x00, 0x42]))).toEqual({ ok: false, reason: "binary" })
    expect(await fileText("a.txt", "text", Buffer.from("  \n"))).toEqual({ ok: false, reason: "empty" })
  })

  it("extracts Office / PDF files through the sandboxed worker via a temp file that is removed", async () => {
    vi.mocked(runExtraction).mockResolvedValue({ ok: true, value: { text: "Docx body token: glpat-AbCdEfGhIjKlMnOpQrSt12", clipped: false } })
    const result = await fileText("documents/spec.docx", "office", Buffer.from("PK..."))
    expect(result).toEqual({ ok: true, text: "Docx body token: [REDACTED]" })
    const job = vi.mocked(runExtraction).mock.calls[0][0]
    expect(job.format).toBe("docx")
    const fs = await import("node:fs")
    expect(fs.existsSync(job.filePath)).toBe(false)
  })

  it("reports an extraction failure", async () => {
    vi.mocked(runExtraction).mockResolvedValue({ ok: false, error: "corrupt" })
    expect(await fileText("x.pdf", "office", Buffer.from("%PDF"))).toEqual({ ok: false, reason: "extraction" })
  })
})
