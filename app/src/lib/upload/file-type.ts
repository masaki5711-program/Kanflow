/**
 * Upload type verification by magic bytes. The browser-sent MIME type is
 * client input; the stored type is derived from the file extension, and the
 * first HEAD_BYTES of the content must match what that extension promises.
 *
 *  - known extension     → content must match one of its signatures
 *  - executable extension → always rejected
 *  - unknown extension   → accepted as application/octet-stream (always a
 *                          download) unless the content is an executable
 */

/** Bytes read from the start of an upload for signature checks. */
export const HEAD_BYTES = 8192

type Kind =
  | "pdf" | "png" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "ico"
  | "isobmff" | "quicktime" | "ebml" | "asf" | "avi" | "wav" | "mpegAudio" | "ogg" | "flac"
  | "zip" | "ole" | "rtf" | "text"

export type FileTypeVerdict =
  | { ok: true; mimeType: string }
  | { ok: false; reason: "blocked_extension" | "executable" | "mismatch" }

function startsWith(head: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (head.length < offset + sig.length) return false
  return sig.every((b, i) => head[offset + i] === b)
}

function ascii(s: string): number[] {
  return Array.from(s, (ch) => ch.charCodeAt(0))
}

function riffOf(head: Uint8Array, form: string): boolean {
  return startsWith(head, ascii("RIFF")) && startsWith(head, ascii(form), 8)
}

/** ISO base media (mp4 / mov / m4a / 3gp / heic / avif): "ftyp" box at offset 4. */
function isIsoBmff(head: Uint8Array): boolean {
  return startsWith(head, ascii("ftyp"), 4)
}

/** Pre-ftyp QuickTime files start directly with a top-level atom. */
const QUICKTIME_ATOMS = ["moov", "mdat", "wide", "free", "skip", "pnot"].map(ascii)

/** Control bytes other than \t \n \v \f \r and ESC. */
function isSuspiciousControl(b: number): boolean {
  return b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b) || b === 0x7f
}

/** Max share of control bytes in text (1%): tolerates a stray byte, not binary data. */
const MAX_CONTROL_RATIO = 0.01

/**
 * Heuristic: UTF-16 with a BOM, or no NUL byte and (almost) no control bytes.
 * Multibyte encodings (UTF-8, Shift_JIS) pass because only bytes < 0x20 count.
 */
export function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return false
  if (startsWith(head, [0xff, 0xfe]) || startsWith(head, [0xfe, 0xff])) return true
  let suspicious = 0
  for (const b of head) {
    if (b === 0) return false
    if (isSuspiciousControl(b)) suspicious++
  }
  return suspicious <= head.length * MAX_CONTROL_RATIO
}

const MATCHERS: Readonly<Record<Kind, (head: Uint8Array) => boolean>> = {
  // Some writers put a few junk bytes before the header; readers accept it within 1 KiB.
  pdf: (h) => new TextDecoder("latin1").decode(h.subarray(0, 1024)).includes("%PDF-"),
  png: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  gif: (h) => startsWith(h, ascii("GIF87a")) || startsWith(h, ascii("GIF89a")),
  webp: (h) => riffOf(h, "WEBP"),
  bmp: (h) => startsWith(h, ascii("BM")) && h.length >= 14,
  tiff: (h) => startsWith(h, [0x49, 0x49, 0x2a, 0x00]) || startsWith(h, [0x4d, 0x4d, 0x00, 0x2a]),
  ico: (h) => startsWith(h, [0x00, 0x00, 0x01, 0x00]),
  isobmff: isIsoBmff,
  quicktime: (h) => isIsoBmff(h) || QUICKTIME_ATOMS.some((atom) => startsWith(h, atom, 4)),
  ebml: (h) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]),
  asf: (h) => startsWith(h, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]),
  avi: (h) => riffOf(h, "AVI "),
  wav: (h) => riffOf(h, "WAVE"),
  // ID3 tag, or an MPEG / ADTS frame sync (11 set bits).
  mpegAudio: (h) => startsWith(h, ascii("ID3")) || (h.length >= 2 && h[0] === 0xff && (h[1] & 0xe0) === 0xe0),
  ogg: (h) => startsWith(h, ascii("OggS")),
  flac: (h) => startsWith(h, ascii("fLaC")),
  // Local file header, or an empty archive's end-of-central-directory record.
  zip: (h) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]) || startsWith(h, [0x50, 0x4b, 0x05, 0x06]),
  ole: (h) => startsWith(h, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  rtf: (h) => startsWith(h, ascii("{\\rtf")),
  text: looksLikeText,
}

interface ExtensionRule {
  kinds: readonly Kind[]
  mime: string
}

const OOXML = "application/vnd.openxmlformats-officedocument"
const TEXT_KINDS: readonly Kind[] = ["text"]

/** Extension (lower case, no dot) → accepted signatures and the MIME type stored. */
const EXTENSION_RULES: Readonly<Record<string, ExtensionRule>> = {
  // Images
  png: { kinds: ["png"], mime: "image/png" },
  jpg: { kinds: ["jpeg"], mime: "image/jpeg" },
  jpeg: { kinds: ["jpeg"], mime: "image/jpeg" },
  jfif: { kinds: ["jpeg"], mime: "image/jpeg" },
  gif: { kinds: ["gif"], mime: "image/gif" },
  webp: { kinds: ["webp"], mime: "image/webp" },
  bmp: { kinds: ["bmp"], mime: "image/bmp" },
  tif: { kinds: ["tiff"], mime: "image/tiff" },
  tiff: { kinds: ["tiff"], mime: "image/tiff" },
  ico: { kinds: ["ico"], mime: "image/x-icon" },
  heic: { kinds: ["isobmff"], mime: "image/heic" },
  heif: { kinds: ["isobmff"], mime: "image/heif" },
  avif: { kinds: ["isobmff"], mime: "image/avif" },
  svg: { kinds: TEXT_KINDS, mime: "image/svg+xml" },
  // Video / audio
  mp4: { kinds: ["isobmff"], mime: "video/mp4" },
  m4v: { kinds: ["isobmff"], mime: "video/mp4" },
  mov: { kinds: ["quicktime"], mime: "video/quicktime" },
  "3gp": { kinds: ["isobmff"], mime: "video/3gpp" },
  webm: { kinds: ["ebml"], mime: "video/webm" },
  mkv: { kinds: ["ebml"], mime: "video/x-matroska" },
  avi: { kinds: ["avi"], mime: "video/x-msvideo" },
  wmv: { kinds: ["asf"], mime: "video/x-ms-wmv" },
  wma: { kinds: ["asf"], mime: "audio/x-ms-wma" },
  mp3: { kinds: ["mpegAudio"], mime: "audio/mpeg" },
  aac: { kinds: ["mpegAudio"], mime: "audio/aac" },
  m4a: { kinds: ["isobmff"], mime: "audio/mp4" },
  wav: { kinds: ["wav"], mime: "audio/wav" },
  ogg: { kinds: ["ogg"], mime: "audio/ogg" },
  oga: { kinds: ["ogg"], mime: "audio/ogg" },
  opus: { kinds: ["ogg"], mime: "audio/ogg" },
  flac: { kinds: ["flac"], mime: "audio/flac" },
  // Documents
  pdf: { kinds: ["pdf"], mime: "application/pdf" },
  docx: { kinds: ["zip"], mime: `${OOXML}.wordprocessingml.document` },
  docm: { kinds: ["zip"], mime: "application/vnd.ms-word.document.macroEnabled.12" },
  dotx: { kinds: ["zip"], mime: `${OOXML}.wordprocessingml.template` },
  xlsx: { kinds: ["zip"], mime: `${OOXML}.spreadsheetml.sheet` },
  xlsm: { kinds: ["zip"], mime: "application/vnd.ms-excel.sheet.macroEnabled.12" },
  xltx: { kinds: ["zip"], mime: `${OOXML}.spreadsheetml.template` },
  pptx: { kinds: ["zip"], mime: `${OOXML}.presentationml.presentation` },
  pptm: { kinds: ["zip"], mime: "application/vnd.ms-powerpoint.presentation.macroEnabled.12" },
  ppsx: { kinds: ["zip"], mime: `${OOXML}.presentationml.slideshow` },
  potx: { kinds: ["zip"], mime: `${OOXML}.presentationml.template` },
  vsdx: { kinds: ["zip"], mime: "application/vnd.ms-visio.drawing" },
  odt: { kinds: ["zip"], mime: "application/vnd.oasis.opendocument.text" },
  ods: { kinds: ["zip"], mime: "application/vnd.oasis.opendocument.spreadsheet" },
  odp: { kinds: ["zip"], mime: "application/vnd.oasis.opendocument.presentation" },
  zip: { kinds: ["zip"], mime: "application/zip" },
  doc: { kinds: ["ole", "rtf"], mime: "application/msword" },
  dot: { kinds: ["ole"], mime: "application/msword" },
  // Legacy "Excel" exports from web systems are often HTML / CSV renamed to .xls.
  xls: { kinds: ["ole", "text"], mime: "application/vnd.ms-excel" },
  xlt: { kinds: ["ole"], mime: "application/vnd.ms-excel" },
  ppt: { kinds: ["ole"], mime: "application/vnd.ms-powerpoint" },
  pps: { kinds: ["ole"], mime: "application/vnd.ms-powerpoint" },
  pot: { kinds: ["ole"], mime: "application/vnd.ms-powerpoint" },
  msg: { kinds: ["ole"], mime: "application/vnd.ms-outlook" },
  vsd: { kinds: ["ole"], mime: "application/vnd.visio" },
  mpp: { kinds: ["ole"], mime: "application/vnd.ms-project" },
  rtf: { kinds: ["rtf"], mime: "application/rtf" },
  // Text
  txt: { kinds: TEXT_KINDS, mime: "text/plain" },
  log: { kinds: TEXT_KINDS, mime: "text/plain" },
  csv: { kinds: TEXT_KINDS, mime: "text/csv" },
  tsv: { kinds: TEXT_KINDS, mime: "text/tab-separated-values" },
  md: { kinds: TEXT_KINDS, mime: "text/markdown" },
  markdown: { kinds: TEXT_KINDS, mime: "text/markdown" },
  json: { kinds: TEXT_KINDS, mime: "application/json" },
  xml: { kinds: TEXT_KINDS, mime: "application/xml" },
  yaml: { kinds: TEXT_KINDS, mime: "text/yaml" },
  yml: { kinds: TEXT_KINDS, mime: "text/yaml" },
  html: { kinds: TEXT_KINDS, mime: "text/html" },
  htm: { kinds: TEXT_KINDS, mime: "text/html" },
}

/** Never stored: Windows executables / script hosts a user could double-click. */
const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "dll", "com", "scr", "pif", "cpl", "msi", "msp", "bat", "cmd",
  "ps1", "psm1", "vbs", "vbe", "jse", "wsf", "wsh", "hta", "lnk", "reg",
])

/** PE ("MZ"), ELF, Mach-O (32/64-bit, both byte orders). */
function isExecutable(head: Uint8Array): boolean {
  if (startsWith(head, ascii("MZ")) && !looksLikeText(head)) return true
  return [
    [0x7f, 0x45, 0x4c, 0x46],
    [0xfe, 0xed, 0xfa, 0xce],
    [0xfe, 0xed, 0xfa, 0xcf],
    [0xce, 0xfa, 0xed, 0xfe],
    [0xcf, 0xfa, 0xed, 0xfe],
  ].some((sig) => startsWith(head, sig))
}

/** Lower-case extension without the dot ("" when none). */
export function extensionOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ""
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ""
}

/** Decide whether `head` (the first HEAD_BYTES of the file) fits `fileName`'s extension. */
export function verifyFileType(fileName: string, head: Uint8Array): FileTypeVerdict {
  const ext = extensionOf(fileName)
  if (BLOCKED_EXTENSIONS.has(ext)) return { ok: false, reason: "blocked_extension" }

  const rule = Object.prototype.hasOwnProperty.call(EXTENSION_RULES, ext) ? EXTENSION_RULES[ext] : undefined
  if (!rule) {
    return isExecutable(head) ? { ok: false, reason: "executable" } : { ok: true, mimeType: "application/octet-stream" }
  }
  const sample = head.subarray(0, HEAD_BYTES)
  return rule.kinds.some((kind) => MATCHERS[kind](sample))
    ? { ok: true, mimeType: rule.mime }
    : { ok: false, reason: "mismatch" }
}
