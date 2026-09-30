import os from "os"
import path from "path"
import fsSync from "fs"
import { afterAll, describe, expect, it } from "vitest"
import { detectTextCharset, needsCharsetSniff, sniffFileCharset, withTextCharset } from "../text-charset"

const bytes = (...b: number[]) => Uint8Array.from(b)
const utf8 = (s: string) => new TextEncoder().encode(s)
// "日本語テスト" in Shift_JIS
const SJIS_JAPANESE = bytes(0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x83, 0x65, 0x83, 0x58, 0x83, 0x67)

describe("detectTextCharset", () => {
  it("detects UTF-8 Japanese text", () => {
    expect(detectTextCharset(utf8("進捗レポート\nlaporan"))).toBe("utf-8")
  })

  it("detects UTF-8 with a BOM", () => {
    expect(detectTextCharset(bytes(0xef, 0xbb, 0xbf, ...utf8("見出し,値")))).toBe("utf-8")
  })

  it("treats plain ASCII and empty files as UTF-8", () => {
    expect(detectTextCharset(utf8("id,name\n1,abc"))).toBe("utf-8")
    expect(detectTextCharset(new Uint8Array(0))).toBe("utf-8")
  })

  it("tolerates a UTF-8 sequence cut off at the end of the sample", () => {
    const full = utf8("あいう")
    expect(detectTextCharset(full.subarray(0, full.length - 1))).toBe("utf-8")
  })

  it("detects Shift_JIS Japanese text", () => {
    expect(detectTextCharset(bytes(...utf8("a,"), ...SJIS_JAPANESE, 0x0a))).toBe("shift_jis")
  })

  it("accepts half-width katakana and a lead byte cut off at the end", () => {
    expect(detectTextCharset(bytes(0xb1, 0xb2, 0x20, 0x93, 0xfa, 0x96))).toBe("shift_jis")
  })

  it("returns null for bytes that are neither UTF-8 nor Shift_JIS", () => {
    expect(detectTextCharset(bytes(0x80, 0x41))).toBeNull() // 0x80 is not a valid SJIS byte
    expect(detectTextCharset(bytes(0x93, 0x20))).toBeNull() // bad trail byte
    expect(detectTextCharset(bytes(0xef, 0xbb, 0xbf, 0xff))).toBeNull() // BOM + invalid UTF-8
  })
})

describe("withTextCharset / needsCharsetSniff", () => {
  it("appends the charset to text types", () => {
    expect(withTextCharset("text/plain", "utf-8")).toBe("text/plain; charset=utf-8")
    expect(withTextCharset("text/csv", "shift_jis")).toBe("text/csv; charset=shift_jis")
    expect(withTextCharset("text/markdown", "utf-8")).toBe("text/markdown; charset=utf-8")
  })

  it("keeps the type unchanged without a charset, for non-text types or when one is present", () => {
    expect(withTextCharset("text/plain", null)).toBe("text/plain")
    expect(withTextCharset("application/octet-stream", "utf-8")).toBe("application/octet-stream")
    expect(withTextCharset("text/plain; charset=iso-8859-1", "utf-8")).toBe("text/plain; charset=iso-8859-1")
  })

  it("only sniffs text types without a charset", () => {
    expect(needsCharsetSniff("text/plain")).toBe(true)
    expect(needsCharsetSniff("text/csv")).toBe(true)
    expect(needsCharsetSniff("text/plain; charset=utf-8")).toBe(false)
    expect(needsCharsetSniff("image/png")).toBe(false)
    expect(needsCharsetSniff("application/octet-stream")).toBe(false)
  })
})

describe("sniffFileCharset", () => {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "kanflow-charset-"))
  afterAll(() => fsSync.rmSync(dir, { recursive: true, force: true }))

  it("reads the head of a file", async () => {
    const file = path.join(dir, "sjis.txt")
    fsSync.writeFileSync(file, Buffer.from(SJIS_JAPANESE))
    expect(await sniffFileCharset(file)).toBe("shift_jis")
  })

  it("returns null when the file cannot be read", async () => {
    expect(await sniffFileCharset(path.join(dir, "missing.txt"))).toBeNull()
  })
})
