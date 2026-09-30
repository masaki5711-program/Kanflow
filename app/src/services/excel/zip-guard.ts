import { inflateRawSync } from "node:zlib"

/**
 * Zip-bomb guard for uploaded .xlsx files. exceljs inflates every part of a
 * workbook into memory before we can count rows, so a small upload with a huge
 * compression ratio could exhaust the process. Two passes, both before exceljs:
 *
 * 1. `inspectZip` reads only the central directory (no inflation) and rejects
 *    archives whose DECLARED sizes are too large. Zip64 archives are rejected
 *    outright: a legitimate import is far below the 4 GB / 65535-entry limits.
 * 2. `verifyZipInflation` does not trust those declarations: it inflates every
 *    entry with a hard output cap of its declared size (never above the
 *    per-entry / remaining-total limits), so an entry that inflates to more
 *    than it claims is stopped after `declared + 1` bytes and rejected. The
 *    raw deflate stream is inflated from the local header up to the central
 *    directory — zlib stops at the stream end — so neither the (possibly
 *    zero, data-descriptor) local sizes nor the central compressed size are
 *    trusted either.
 */

export const ZIP_MAX_ENTRIES = 2000
export const ZIP_MAX_ENTRY_BYTES = 50 * 1024 * 1024
export const ZIP_MAX_TOTAL_BYTES = 100 * 1024 * 1024
/** Ratio check only applies to entries larger than this (tiny XML parts compress well). */
const RATIO_MIN_BYTES = 1024 * 1024
export const ZIP_MAX_RATIO = 200

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const LOCAL_HEADER_SIZE = 30
const METHOD_STORED = 0
const METHOD_DEFLATE = 8
const FLAG_ENCRYPTED = 0x1
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

interface CentralEntry {
  flags: number
  method: number
  compressed: number
  uncompressed: number
  localOffset: number
}

type Directory = { ok: true; entries: CentralEntry[]; dirOffset: number } | { ok: false; reason: string }

/** Pure: the central-directory entries (structure only; limits are checked by the callers). */
function readDirectory(buf: Buffer): Directory {
  if (buf.length < EOCD_MIN_SIZE) return { ok: false, reason: "not_zip" }
  const eocd = findEocd(buf)
  if (eocd < 0) return { ok: false, reason: "not_zip" }
  const count = buf.readUInt16LE(eocd + 10)
  const dirOffset = buf.readUInt32LE(eocd + 16)
  if (count === ZIP64_MARKER_16 || dirOffset === ZIP64_MARKER_32) return { ok: false, reason: "zip64" }
  if (count > ZIP_MAX_ENTRIES) return { ok: false, reason: "too_many_entries" }
  const entries: CentralEntry[] = []
  let offset = dirOffset
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) return { ok: false, reason: "corrupt" }
    entries.push({
      flags: buf.readUInt16LE(offset + 8),
      method: buf.readUInt16LE(offset + 10),
      compressed: buf.readUInt32LE(offset + 20),
      uncompressed: buf.readUInt32LE(offset + 24),
      localOffset: buf.readUInt32LE(offset + 42),
    })
    offset += 46 + buf.readUInt16LE(offset + 28) + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32)
  }
  return { ok: true, entries, dirOffset }
}

/** Actual inflated size of one entry, capped at `cap` bytes; a string reason when it is not acceptable. */
function inflatedSize(buf: Buffer, entry: CentralEntry, dirOffset: number, cap: number): number | string {
  if (entry.flags & FLAG_ENCRYPTED) return "encrypted"
  const at = entry.localOffset
  if (at + LOCAL_HEADER_SIZE > dirOffset || buf.readUInt32LE(at) !== LOCAL_SIGNATURE) return "corrupt"
  const dataStart = at + LOCAL_HEADER_SIZE + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28)
  if (dataStart > dirOffset) return "corrupt"
  if (entry.method === METHOD_STORED) {
    if (dataStart + entry.compressed > dirOffset) return "corrupt"
    return entry.compressed
  }
  if (entry.method !== METHOD_DEFLATE) return "unsupported_method"
  try {
    // maxOutputLength >= 1: an empty entry must still inflate to 0 bytes.
    return inflateRawSync(buf.subarray(dataStart, dirOffset), { maxOutputLength: Math.max(cap, 1) }).length
  } catch (err) {
    return (err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? "size_mismatch" : "corrupt"
  }
}

/**
 * Inflate every entry with a hard byte cap (see the header comment). Rejects
 * entries whose real size differs from the declared one, and stops as soon
 * as the per-entry or total limit would be passed.
 */
export function verifyZipInflation(buf: Buffer): ZipCheck {
  const dir = readDirectory(buf)
  if (!dir.ok) return dir
  let totalBytes = 0
  for (const entry of dir.entries) {
    const declared = Math.min(entry.uncompressed, ZIP_MAX_ENTRY_BYTES)
    const cap = Math.min(declared, ZIP_MAX_TOTAL_BYTES - totalBytes)
    if (cap < entry.uncompressed) return { ok: false, reason: entry.uncompressed > ZIP_MAX_ENTRY_BYTES ? "entry_too_large" : "total_too_large" }
    const size = inflatedSize(buf, entry, dir.dirOffset, cap)
    if (typeof size === "string") return { ok: false, reason: size }
    if (size !== entry.uncompressed) return { ok: false, reason: "size_mismatch" }
    totalBytes += size
  }
  return { ok: true, entries: dir.entries.length, totalBytes }
}

/** Pure: inspect the central directory of a zip buffer against the limits above (declared sizes). */
export function inspectZip(buf: Buffer): ZipCheck {
  const dir = readDirectory(buf)
  if (!dir.ok) return dir
  let totalBytes = 0
  for (const entry of dir.entries) {
    const problem = checkEntry(entry.compressed, entry.uncompressed)
    if (problem) return { ok: false, reason: problem }
    totalBytes += entry.uncompressed
    if (totalBytes > ZIP_MAX_TOTAL_BYTES) return { ok: false, reason: "total_too_large" }
  }
  return { ok: true, entries: dir.entries.length, totalBytes }
}

/** Both passes: declared sizes first (cheap), then the capped inflation. */
export function checkZip(buf: Buffer): ZipCheck {
  const declared = inspectZip(buf)
  return declared.ok ? verifyZipInflation(buf) : declared
}
