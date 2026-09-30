/**
 * Zip-bomb guard for uploaded .xlsx files. exceljs inflates every part of a
 * workbook into memory before we can count rows, so a small upload with a huge
 * compression ratio could exhaust the process. This reads only the zip central
 * directory (no inflation) and rejects archives whose declared sizes are too
 * large. Zip64 archives are rejected outright: a legitimate import is far
 * below the 4 GB / 65535-entry limits that would require it.
 */

export const ZIP_MAX_ENTRIES = 2000
export const ZIP_MAX_ENTRY_BYTES = 50 * 1024 * 1024
export const ZIP_MAX_TOTAL_BYTES = 100 * 1024 * 1024
/** Ratio check only applies to entries larger than this (tiny XML parts compress well). */
const RATIO_MIN_BYTES = 1024 * 1024
export const ZIP_MAX_RATIO = 200

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const EOCD_MIN_SIZE = 22
const MAX_COMMENT = 0xffff
const ZIP64_MARKER_32 = 0xffffffff
const ZIP64_MARKER_16 = 0xffff

export type ZipCheck = { ok: true; entries: number; totalBytes: number } | { ok: false; reason: string }

function findEocd(buf: Buffer): number {
  const stop = Math.max(0, buf.length - EOCD_MIN_SIZE - MAX_COMMENT)
  for (let i = buf.length - EOCD_MIN_SIZE; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i
  }
  return -1
}

function checkEntry(compressed: number, uncompressed: number): string | null {
  if (compressed === ZIP64_MARKER_32 || uncompressed === ZIP64_MARKER_32) return "zip64"
  if (uncompressed > ZIP_MAX_ENTRY_BYTES) return "entry_too_large"
  if (uncompressed > RATIO_MIN_BYTES && uncompressed / Math.max(compressed, 1) > ZIP_MAX_RATIO) return "ratio"
  return null
}

/** Pure: inspect the central directory of a zip buffer against the limits above. */
export function inspectZip(buf: Buffer): ZipCheck {
  if (buf.length < EOCD_MIN_SIZE) return { ok: false, reason: "not_zip" }
  const eocd = findEocd(buf)
  if (eocd < 0) return { ok: false, reason: "not_zip" }
  const entries = buf.readUInt16LE(eocd + 10)
  const dirOffset = buf.readUInt32LE(eocd + 16)
  if (entries === ZIP64_MARKER_16 || dirOffset === ZIP64_MARKER_32) return { ok: false, reason: "zip64" }
  if (entries > ZIP_MAX_ENTRIES) return { ok: false, reason: "too_many_entries" }

  let offset = dirOffset
  let totalBytes = 0
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) return { ok: false, reason: "corrupt" }
    const compressed = buf.readUInt32LE(offset + 20)
    const uncompressed = buf.readUInt32LE(offset + 24)
    const problem = checkEntry(compressed, uncompressed)
    if (problem) return { ok: false, reason: problem }
    totalBytes += uncompressed
    if (totalBytes > ZIP_MAX_TOTAL_BYTES) return { ok: false, reason: "total_too_large" }
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    offset += 46 + nameLen + extraLen + commentLen
  }
  return { ok: true, entries, totalBytes }
}
