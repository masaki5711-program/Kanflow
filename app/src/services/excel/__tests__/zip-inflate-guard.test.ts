import { deflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { ZIP_MAX_ENTRY_BYTES, checkZip, inspectZip, verifyZipInflation } from "../zip-guard"

/**
 * Crafted archives for the capped-inflate pass (S-3): the central directory
 * may declare any sizes; the local headers may carry zeros (data descriptor).
 */
interface EntrySpec {
  name?: string
  data: Buffer
  method?: 0 | 8 | 12
  /** Declared uncompressed size in the central directory (default: the real size). */
  declaredSize?: number
  /** Declared compressed size in the central directory (default: the real one). */
  declaredCompressed?: number
  /** Zero sizes in the local header + bit 3 (as streaming writers do). */
  dataDescriptor?: boolean
  flags?: number
  /** Break the local header signature. */
  badLocal?: boolean
}

function buildZip(specs: EntrySpec[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  specs.forEach((spec, i) => {
    const name = Buffer.from(spec.name ?? `part${i}.xml`)
    const method = spec.method ?? 8
    const body = method === 8 ? deflateRawSync(spec.data) : spec.data
    const flags = (spec.flags ?? 0) | (spec.dataDescriptor ? 0x8 : 0)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(spec.badLocal ? 0x12345678 : 0x04034b50, 0)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(spec.dataDescriptor ? 0 : body.length, 18)
    local.writeUInt32LE(spec.dataDescriptor ? 0 : spec.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(spec.declaredCompressed ?? body.length, 20)
    central.writeUInt32LE(spec.declaredSize ?? spec.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    const localPart = Buffer.concat([local, name, body])
    locals.push(localPart)
    centrals.push(Buffer.concat([central, name]))
    offset += localPart.length
  })
  const dir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(specs.length, 8)
  eocd.writeUInt16LE(specs.length, 10)
  eocd.writeUInt32LE(dir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, eocd])
}

const xml = (n: number) => Buffer.from(`<a>${"x".repeat(n)}</a>`)

describe("verifyZipInflation (capped inflate, sizes not trusted)", () => {
  it("accepts a real exceljs workbook", async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet("s").addRow(["a", "b"])
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    expect(checkZip(buf)).toMatchObject({ ok: true })
  })

  it("accepts honest deflated and stored entries, also with data descriptors", () => {
    const zip = buildZip([{ data: xml(5000) }, { data: xml(10), method: 0 }, { data: xml(300), dataDescriptor: true }])
    expect(verifyZipInflation(zip)).toEqual({ ok: true, entries: 3, totalBytes: 5007 + 17 + 307 })
  })

  it("rejects a bomb whose central directory lies about its size — without inflating it fully", () => {
    // 16 MB of zeros declared as 1000 bytes: passes the declared-size check…
    const zip = buildZip([{ data: Buffer.alloc(16 * 1024 * 1024), declaredSize: 1000 }])
    expect(inspectZip(zip)).toMatchObject({ ok: true })
    // …but the inflate stops after 1000 bytes.
    const t0 = Date.now()
    expect(verifyZipInflation(zip)).toEqual({ ok: false, reason: "size_mismatch" })
    expect(checkZip(zip)).toEqual({ ok: false, reason: "size_mismatch" })
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it("rejects an entry that inflates to less than declared", () => {
    expect(verifyZipInflation(buildZip([{ data: xml(100), declaredSize: 5000 }]))).toEqual({ ok: false, reason: "size_mismatch" })
  })

  it("does not trust the declared compressed size either (inflates up to the directory)", () => {
    expect(verifyZipInflation(buildZip([{ data: xml(4000), declaredCompressed: 3 }]))).toMatchObject({ ok: true })
    // A lying stored entry that points past the directory is corrupt.
    expect(verifyZipInflation(buildZip([{ data: xml(10), method: 0, declaredCompressed: 99_999 }]))).toEqual({
      ok: false,
      reason: "corrupt",
    })
  })

  it("stops before inflating an entry above the per-entry limit", () => {
    const zip = buildZip([{ data: xml(10), declaredSize: ZIP_MAX_ENTRY_BYTES + 1 }])
    expect(verifyZipInflation(zip)).toEqual({ ok: false, reason: "entry_too_large" })
  })

  it("rejects encrypted entries, unknown methods and broken local headers", () => {
    expect(verifyZipInflation(buildZip([{ data: xml(10), flags: 0x1 }]))).toEqual({ ok: false, reason: "encrypted" })
    expect(verifyZipInflation(buildZip([{ data: xml(10), method: 12 }]))).toEqual({ ok: false, reason: "unsupported_method" })
    expect(verifyZipInflation(buildZip([{ data: xml(10), badLocal: true }]))).toEqual({ ok: false, reason: "corrupt" })
    expect(verifyZipInflation(Buffer.from("definitely not a zip archive!!"))).toEqual({ ok: false, reason: "not_zip" })
  })

  it("rejects a truncated deflate stream as corrupt", () => {
    const zip = buildZip([{ data: xml(4000) }])
    // Garble the start of the compressed body (the directory stays intact).
    const broken = Buffer.from(zip)
    broken.fill(0xff, 30 + "part0.xml".length, 30 + "part0.xml".length + 8)
    expect(verifyZipInflation(broken)).toEqual({ ok: false, reason: "corrupt" })
  })
})

describe("readUploadedXlsx uses the capped inflate", () => {
  it("answers 413 for a workbook whose declared sizes lie", async () => {
    const { readUploadedXlsx } = await import("../excel.upload")
    const zip = buildZip([{ name: "[Content_Types].xml", data: Buffer.alloc(2 * 1024 * 1024), declaredSize: 900 }])
    const file = new File([new Uint8Array(zip)], "bomb.xlsx")
    await expect(readUploadedXlsx(file)).rejects.toMatchObject({ status: 413, extra: { reason: "size_mismatch" } })
  }, 20_000)
})
