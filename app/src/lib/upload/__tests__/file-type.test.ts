import { describe, expect, it } from "vitest"
import { HEAD_BYTES, looksLikeText, verifyFileType } from "../file-type"

function bytes(...parts: Array<string | number[]>): Uint8Array {
  const out: number[] = []
  for (const p of parts) {
    if (typeof p === "string") for (const ch of p) out.push(ch.charCodeAt(0))
    else out.push(...p)
  }
  return Uint8Array.from(out)
}

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR")
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], "JFIF", [0])
const GIF = bytes("GIF89a", [1, 0, 1, 0])
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ")
const PDF = bytes("%PDF-1.7\n", [0xe2, 0xe3, 0xcf, 0xd3])
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0x06, 0], "[Content_Types].xml")
const OLE = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])
const MP4 = bytes([0, 0, 0, 0x20], "ftypisom", [0, 0, 2, 0])
const MOV_FTYP = bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 0, 0])
const MOV_LEGACY = bytes([0, 0, 0, 0x08], "wide", [0, 0, 0, 0])
const WEBM = bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f])
const WAV = bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt ")
const AVI = bytes("RIFF", [0x24, 0, 0, 0], "AVI LIST")
const MP3_ID3 = bytes("ID3", [4, 0, 0])
const MP3_FRAME = bytes([0xff, 0xfb, 0x90, 0x44])
const EXE = bytes("MZ", [0x90, 0, 3, 0, 0, 0, 4, 0])
const ELF = bytes([0x7f], "ELF", [2, 1, 1, 0])
const TEXT = bytes("hello, world\nline 2\r\n")
const SJIS_CSV = bytes("a,b\r\n", [0x82, 0xa0, 0x82, 0xa2], ",1\r\n")
const UTF16 = bytes([0xff, 0xfe], "h", [0], "i", [0])

describe("verifyFileType", () => {
  it.each([
    ["photo.png", PNG, "image/png"],
    ["photo.JPG", JPEG, "image/jpeg"],
    ["photo.jpeg", JPEG, "image/jpeg"],
    ["anim.gif", GIF, "image/gif"],
    ["img.webp", WEBP, "image/webp"],
    ["spec.pdf", PDF, "application/pdf"],
    ["doc.docx", ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["sheet.xlsx", ZIP, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["deck.pptx", ZIP, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["bundle.zip", ZIP, "application/zip"],
    ["old.doc", OLE, "application/msword"],
    ["old.xls", OLE, "application/vnd.ms-excel"],
    ["old.ppt", OLE, "application/vnd.ms-powerpoint"],
    ["clip.mp4", MP4, "video/mp4"],
    ["clip.mov", MOV_FTYP, "video/quicktime"],
    ["legacy.mov", MOV_LEGACY, "video/quicktime"],
    ["clip.webm", WEBM, "video/webm"],
    ["voice.wav", WAV, "audio/wav"],
    ["movie.avi", AVI, "video/x-msvideo"],
    ["song.mp3", MP3_ID3, "audio/mpeg"],
    ["song2.mp3", MP3_FRAME, "audio/mpeg"],
    ["note.txt", TEXT, "text/plain"],
    ["data.csv", SJIS_CSV, "text/csv"],
    ["readme.md", TEXT, "text/markdown"],
    ["wide.txt", UTF16, "text/plain"],
  ])("accepts %s with matching content as %s", (name, head, mime) => {
    expect(verifyFileType(name as string, head as Uint8Array)).toEqual({ ok: true, mimeType: mime })
  })

  it.each([
    ["fake.png", JPEG],
    ["fake.pdf", TEXT],
    ["fake.docx", OLE],
    ["fake.doc", ZIP],
    ["fake.jpg", EXE],
    ["fake.txt", PNG],
    ["fake.csv", EXE],
    ["fake.mp4", WEBM],
  ])("rejects %s whose content does not match the extension", (name, head) => {
    expect(verifyFileType(name as string, head as Uint8Array)).toEqual({ ok: false, reason: "mismatch" })
  })

  it.each(["setup.exe", "run.bat", "x.cmd", "a.ps1", "b.vbs", "c.msi", "d.scr", "e.hta", "f.dll"])(
    "rejects the executable extension %s regardless of content",
    (name) => {
      expect(verifyFileType(name, TEXT)).toEqual({ ok: false, reason: "blocked_extension" })
    }
  )

  it("accepts unknown extensions as an opaque download", () => {
    expect(verifyFileType("drawing.dwg", bytes("AC1032", [0, 0]))).toEqual({ ok: true, mimeType: "application/octet-stream" })
    expect(verifyFileType("upload", TEXT)).toEqual({ ok: true, mimeType: "application/octet-stream" })
  })

  it.each([["renamed.dwg", EXE], ["noext", ELF]])("rejects executable content under an unknown extension (%s)", (name, head) => {
    expect(verifyFileType(name as string, head as Uint8Array)).toEqual({ ok: false, reason: "executable" })
  })

  it("accepts a legacy .xls that is really an HTML/text export", () => {
    expect(verifyFileType("export.xls", bytes("<html><body><table>"))).toEqual({
      ok: true,
      mimeType: "application/vnd.ms-excel",
    })
  })

  it("inspects at most HEAD_BYTES", () => {
    expect(HEAD_BYTES).toBeGreaterThanOrEqual(4096)
  })
})

describe("looksLikeText", () => {
  it("accepts ASCII / multibyte text with tabs and newlines", () => {
    expect(looksLikeText(TEXT)).toBe(true)
    expect(looksLikeText(SJIS_CSV)).toBe(true)
    expect(looksLikeText(bytes("a\tb\fc\x1b[0m"))).toBe(true)
  })

  it("accepts UTF-16 with a BOM", () => {
    expect(looksLikeText(UTF16)).toBe(true)
    expect(looksLikeText(bytes([0xfe, 0xff], [0], "h"))).toBe(true)
  })

  it("rejects NUL bytes and control-character noise", () => {
    expect(looksLikeText(PNG)).toBe(false)
    expect(looksLikeText(bytes("abc", [1, 2, 3, 4, 5], "def"))).toBe(false)
  })

  it("rejects empty input", () => {
    expect(looksLikeText(new Uint8Array())).toBe(false)
  })
})
