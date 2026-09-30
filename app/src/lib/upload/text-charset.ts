/**
 * Charset detection for served text attachments (P-13).
 *
 * `.txt` / `.csv` / `.md` uploads are stored without an encoding, so the
 * browser used to guess (often wrong for Japanese). We sniff the first bytes:
 * valid UTF-8 (with or without BOM) → `utf-8`, a plausible Shift_JIS byte
 * stream → `shift_jis`, anything else → no charset (browser decides).
 */
import fs from "fs/promises"

export type TextCharset = "utf-8" | "shift_jis"

/** How many leading bytes are inspected. */
export const CHARSET_SAMPLE_BYTES = 64 * 1024

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && UTF8_BOM.every((b, i) => bytes[i] === b)
}

/** Valid UTF-8; a sequence cut off at the end of the sample is tolerated. */
function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true })
    return true
  } catch {
    return false
  }
}

const isSjisLead = (b: number) => (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)
const isSjisTrail = (b: number) => (b >= 0x40 && b <= 0x7e) || (b >= 0x80 && b <= 0xfc)
const isSjisSingle = (b: number) => b <= 0x7f || (b >= 0xa1 && b <= 0xdf)

/** Every byte fits the Shift_JIS structure and at least one non-ASCII character occurs. */
function looksLikeShiftJis(bytes: Uint8Array): boolean {
  let nonAscii = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b <= 0x7f) continue
    if (isSjisSingle(b)) {
      nonAscii++
      continue
    }
    if (!isSjisLead(b)) return false
    if (i + 1 >= bytes.length) break // lead byte cut off at the end of the sample
    if (!isSjisTrail(bytes[i + 1])) return false
    nonAscii++
    i++
  }
  return nonAscii > 0
}

/** Pure: charset of a text sample, or null when it cannot be told reliably. */
export function detectTextCharset(bytes: Uint8Array): TextCharset | null {
  if (hasUtf8Bom(bytes)) return isValidUtf8(bytes.subarray(3)) ? "utf-8" : null
  if (isValidUtf8(bytes)) return "utf-8"
  return looksLikeShiftJis(bytes) ? "shift_jis" : null
}

/** `text/*` types without an explicit charset get one; other types are returned unchanged. */
export function withTextCharset(contentType: string, charset: TextCharset | null): string {
  if (!charset) return contentType
  const [type = "", ...params] = contentType.split(";")
  if (!type.trim().toLowerCase().startsWith("text/")) return contentType
  if (params.some((p) => p.trim().toLowerCase().startsWith("charset="))) return contentType
  return `${contentType}; charset=${charset}`
}

/** True when a served Content-Type is a text type whose charset should be sniffed. */
export function needsCharsetSniff(contentType: string): boolean {
  const lower = contentType.toLowerCase()
  return lower.trim().startsWith("text/") && !lower.includes("charset=")
}

/** Read the head of a stored file and detect its charset (null on read errors). */
export async function sniffFileCharset(fullPath: string): Promise<TextCharset | null> {
  let fh: fs.FileHandle | null = null
  try {
    fh = await fs.open(fullPath, "r")
    const buf = Buffer.alloc(CHARSET_SAMPLE_BYTES)
    const { bytesRead } = await fh.read(buf, 0, CHARSET_SAMPLE_BYTES, 0)
    return detectTextCharset(buf.subarray(0, bytesRead))
  } catch {
    return null
  } finally {
    await fh?.close()
  }
}
