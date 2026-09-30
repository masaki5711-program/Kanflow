import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { ZIP_MAX_ENTRY_BYTES, inspectZip } from "../zip-guard"

/** Minimal stored zip: one central-directory entry with the given declared sizes. */
function fakeZip(entries: Array<{ compressed: number; uncompressed: number }>): Buffer {
  const name = Buffer.from("x.xml")
  const central = entries.map(({ compressed, uncompressed }) => {
    const h = Buffer.alloc(46)
    h.writeUInt32LE(0x02014b50, 0)
    h.writeUInt32LE(compressed, 20)
    h.writeUInt32LE(uncompressed, 24)
    h.writeUInt16LE(name.length, 28)
    return Buffer.concat([h, name])
  })
  const dir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(dir.length, 12)
  eocd.writeUInt32LE(0, 16)
  return Buffer.concat([dir, eocd])
}

describe("inspectZip", () => {
  it("accepts a real xlsx workbook", async () => {
    // Arrange
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet("s").addRow(["a", "b"])
    const buf = Buffer.from(await wb.xlsx.writeBuffer())

    // Act
    const result = inspectZip(buf)

    // Assert
    expect(result.ok).toBe(true)
  })

  it("rejects an entry whose declared size exceeds the per-entry cap", () => {
    expect(inspectZip(fakeZip([{ compressed: 10_000_000, uncompressed: ZIP_MAX_ENTRY_BYTES + 1 }]))).toEqual({ ok: false, reason: "entry_too_large" })
  })

  it("rejects a suspicious compression ratio", () => {
    expect(inspectZip(fakeZip([{ compressed: 10_000, uncompressed: 40 * 1024 * 1024 }]))).toEqual({ ok: false, reason: "ratio" })
  })

  it("rejects when the total declared size is too large", () => {
    const parts = Array.from({ length: 5 }, () => ({ compressed: 1_000_000, uncompressed: 30 * 1024 * 1024 }))
    expect(inspectZip(fakeZip(parts))).toEqual({ ok: false, reason: "total_too_large" })
  })

  it("rejects zip64 markers and non-zip data", () => {
    expect(inspectZip(fakeZip([{ compressed: 0xffffffff, uncompressed: 0xffffffff }]))).toEqual({ ok: false, reason: "zip64" })
    expect(inspectZip(Buffer.from("not a zip at all, definitely not"))).toEqual({ ok: false, reason: "not_zip" })
  })
})
