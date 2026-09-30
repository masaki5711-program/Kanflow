import os from "os"
import path from "path"
import fsSync from "fs"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: vi.fn().mockResolvedValue(null) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}))

const helpers = await import("@/lib/api-helpers")
const {
  saveUploadedFile,
  copyTemplateFile,
  serveStoredFile,
  resolveServeHeaders,
  deleteUploadedFile,
  safeFilePath,
  safeExtension,
  requireAuth,
  requireAdmin,
  MAX_UPLOAD_SIZE,
} = helpers

let tmpRoot: string
const PROJECT = "proj1"

beforeAll(() => {
  tmpRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), "kanflow-api-helpers-"))
  vi.spyOn(process, "cwd").mockReturnValue(tmpRoot)
})

afterAll(() => {
  vi.restoreAllMocks()
  fsSync.rmSync(tmpRoot, { recursive: true, force: true })
})

function uploadDir() {
  return path.join(tmpRoot, "private", "uploads", PROJECT)
}

function writeStored(name: string, content: string | Buffer) {
  fsSync.mkdirSync(uploadDir(), { recursive: true })
  fsSync.writeFileSync(path.join(uploadDir(), name), content)
}

describe("safeFilePath / safeExtension", () => {
  it("rejects traversal outside the uploads root", () => {
    expect(safeFilePath(PROJECT, "../../../etc/passwd")).toBeNull()
    expect(safeFilePath("..", "..")).toBeNull()
  })

  it("resolves a plain name inside the project dir", () => {
    expect(safeFilePath(PROJECT, "a.txt")).toBe(path.join(uploadDir(), "a.txt"))
  })

  it("keeps only alphanumeric extensions", () => {
    expect(safeExtension(".png")).toBe(".png")
    expect(safeExtension(".p/ng")).toBe("")
    expect(safeExtension(".html;.js")).toBe("")
    expect(safeExtension("")).toBe("")
  })
})

describe("saveUploadedFile", () => {
  it("rejects a missing file", async () => {
    const res = await saveUploadedFile(PROJECT, undefined as unknown as File)
    expect(res).toEqual({ ok: false, error: expect.any(String), status: 400, code: "FILE_REQUIRED" })
  })

  it("rejects an empty file", async () => {
    const res = await saveUploadedFile(PROJECT, new File([], "a.txt", { type: "text/plain" }))
    expect(res).toMatchObject({ ok: false, status: 400, code: "FILE_EMPTY" })
  })

  it("rejects an oversize file with 413", async () => {
    const big = { size: MAX_UPLOAD_SIZE + 1, type: "text/plain", name: "big.txt" } as File
    const res = await saveUploadedFile(PROJECT, big)
    expect(res).toMatchObject({ ok: false, status: 413, code: "PAYLOAD_TOO_LARGE" })
  })

  it("rejects a disallowed MIME with 415", async () => {
    const f = new File(["MZ"], "evil.exe", { type: "application/x-msdownload" })
    const res = await saveUploadedFile(PROJECT, f)
    expect(res).toMatchObject({ ok: false, status: 415, code: "UNSUPPORTED_MEDIA" })
  })

  it("stores the file under a random name with a sanitized extension", async () => {
    const f = new File(["hello"], "note.txt", { type: "text/plain" })
    const res = await saveUploadedFile(PROJECT, f)
    if (!res.ok) throw new Error("expected ok")
    expect(res.fileName).toMatch(/^\d+_[0-9a-f]{32}\.txt$/)
    expect(res).toMatchObject({ originalName: "note.txt", fileSize: 5, mimeType: "text/plain" })
    expect(fsSync.readFileSync(path.join(uploadDir(), res.fileName), "utf8")).toBe("hello")
  })

  it("defaults MIME to octet-stream and name to 'upload'", async () => {
    const f = new File(["x"], "", { type: "" })
    const res = await saveUploadedFile(PROJECT, f)
    if (!res.ok) throw new Error("expected ok")
    expect(res.mimeType).toBe("application/octet-stream")
    expect(res.originalName).toBe("upload")
    expect(res.fileName).toMatch(/^\d+_[0-9a-f]{32}$/)
  })

  it("rejects when the project id escapes the uploads root", async () => {
    const f = new File(["x"], "a.txt", { type: "text/plain" })
    const res = await saveUploadedFile("../..", f)
    expect(res).toMatchObject({ ok: false, status: 400, code: "INVALID_PATH" })
  })

  it("stores the MIME type derived from the extension, not the client's", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
    const f = new File([png], "shot.png", { type: "application/octet-stream" })
    const res = await saveUploadedFile(PROJECT, f)
    expect(res).toMatchObject({ ok: true, mimeType: "image/png", fileSize: png.byteLength })
  })

  it("rejects content that does not match the extension with FILE_TYPE_MISMATCH and writes nothing", async () => {
    const before = fsSync.existsSync(uploadDir()) ? fsSync.readdirSync(uploadDir()).length : 0
    const f = new File(["<html><script>alert(1)</script>"], "photo.png", { type: "image/png" })
    const res = await saveUploadedFile(PROJECT, f)
    expect(res).toMatchObject({ ok: false, status: 415, code: "FILE_TYPE_MISMATCH" })
    const after = fsSync.existsSync(uploadDir()) ? fsSync.readdirSync(uploadDir()).length : 0
    expect(after).toBe(before)
  })

  it("rejects executables even when the client claims an allowed type", async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])
    const blocked = await saveUploadedFile(PROJECT, new File([exe], "setup.exe", { type: "application/octet-stream" }))
    expect(blocked).toMatchObject({ ok: false, status: 415, code: "UNSUPPORTED_MEDIA" })
    const renamed = await saveUploadedFile(PROJECT, new File([exe], "tool.bin", { type: "application/octet-stream" }))
    expect(renamed).toMatchObject({ ok: false, status: 415, code: "UNSUPPORTED_MEDIA" })
  })

  it("counts the bytes actually streamed instead of trusting the declared size", async () => {
    const chunks = ["hello ", "world"]
    const liar = {
      name: "note.txt",
      type: "text/plain",
      size: 1,
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(c) {
            for (const x of chunks) c.enqueue(new TextEncoder().encode(x))
            c.close()
          },
        }),
    } as unknown as File
    const res = await saveUploadedFile(PROJECT, liar)
    if (!res.ok) throw new Error("expected ok")
    expect(res.fileSize).toBe(11)
    expect(fsSync.readFileSync(path.join(uploadDir(), res.fileName), "utf8")).toBe("hello world")
  })
})

describe("copyTemplateFile", () => {
  it("rejects a template path that escapes the templates dir", async () => {
    const res = await copyTemplateFile(PROJECT, "../../secret", "x.xlsx", "application/x")
    expect(res).toEqual({ ok: false, error: expect.any(String) })
  })

  it("reports a missing template", async () => {
    const res = await copyTemplateFile(PROJECT, "missing.xlsx", "x.xlsx", "application/x")
    expect(res).toMatchObject({ ok: false })
  })

  it("copies an existing template into the project dir", async () => {
    const tplDir = path.join(tmpRoot, "private", "templates")
    fsSync.mkdirSync(tplDir, { recursive: true })
    fsSync.writeFileSync(path.join(tplDir, "sheet.xlsx"), "TEMPLATE")
    const res = await copyTemplateFile(PROJECT, "sheet.xlsx", "Goal Sheet.xlsx", "application/vnd.ms-excel")
    if (!res.ok) throw new Error("expected ok")
    expect(res).toMatchObject({ originalName: "Goal Sheet.xlsx", fileSize: 8, mimeType: "application/vnd.ms-excel" })
    expect(res.fileName.endsWith(".xlsx")).toBe(true)
    expect(fsSync.readFileSync(path.join(uploadDir(), res.fileName), "utf8")).toBe("TEMPLATE")
  })

  it("rejects when the project id escapes the uploads root", async () => {
    const tplDir = path.join(tmpRoot, "private", "templates")
    fsSync.mkdirSync(tplDir, { recursive: true })
    fsSync.writeFileSync(path.join(tplDir, "t.txt"), "T")
    const res = await copyTemplateFile("../..", "t.txt", "t.txt", "text/plain")
    expect(res).toMatchObject({ ok: false })
  })
})

describe("serveStoredFile", () => {
  const req = (headers: Record<string, string> = {}) => new Request("http://x/f", { headers })

  it("returns 400 for a traversal file name", async () => {
    const res = await serveStoredFile(PROJECT, "../../x", "text/plain", "x", req(), false)
    expect(res.status).toBe(400)
  })

  it("returns 404 when the file is missing", async () => {
    const res = await serveStoredFile(PROJECT, "nope.txt", "text/plain", "nope.txt", req(), false)
    expect(res.status).toBe(404)
  })

  it("serves an image inline with nosniff", async () => {
    writeStored("img.png", "PNGDATA")
    const res = await serveStoredFile(PROJECT, "img.png", "image/png", "画像.png", req(), false)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; filename="/)
    expect(res.headers.get("Content-Disposition")).toContain(encodeURIComponent("画像.png"))
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(res.headers.get("Content-Length")).toBe("7")
    expect(await res.text()).toBe("PNGDATA")
  })

  it("forces download when requested", async () => {
    writeStored("img2.png", "P")
    const res = await serveStoredFile(PROJECT, "img2.png", "image/png", "a.png", req(), true)
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/)
  })

  it.each([
    "text/html",
    "image/svg+xml",
    "application/xml",
    "text/xml",
    "text/xml; charset=utf-8",
    "application/xhtml+xml",
    "application/atom+xml",
    "text/javascript",
  ])(
    "serves active content %s as an octet-stream attachment",
    async (mime) => {
      writeStored("active.bin", "<script>alert(1)</script>")
      const res = await serveStoredFile(PROJECT, "active.bin", mime, "a", req(), false)
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream")
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/)
    }
  )

  it.each([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ])("serves Office document %s with its own MIME as an attachment", async (mime) => {
    writeStored("office.bin", "PK")
    const res = await serveStoredFile(PROJECT, "office.bin", mime, "doc", req(), false)
    expect(res.headers.get("Content-Type")).toBe(mime)
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/)
  })

  it("resolveServeHeaders keeps Office types but still downgrades real XML", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    expect(resolveServeHeaders(docx, false)).toEqual({ contentType: docx, disposition: "attachment" })
    expect(resolveServeHeaders("application/rss+xml", false)).toEqual({
      contentType: "application/octet-stream",
      disposition: "attachment",
    })
  })

  it("answers 404 FILE_MISSING for a stored file that is gone", async () => {
    const res = await serveStoredFile(PROJECT, "gone.bin", "text/plain", "g", req(), false)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "File missing", code: "FILE_MISSING" })
  })

  it("serves a byte range with 206", async () => {
    writeStored("v.mp4", "0123456789")
    const res = await serveStoredFile(PROJECT, "v.mp4", "video/mp4", "v.mp4", req({ range: "bytes=2-5" }), false)
    expect(res.status).toBe(206)
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10")
    expect(res.headers.get("Content-Length")).toBe("4")
    expect(await res.text()).toBe("2345")
  })

  it("serves an open-ended range to the end", async () => {
    writeStored("v.mp4", "0123456789")
    const res = await serveStoredFile(PROJECT, "v.mp4", "video/mp4", "v", req({ range: "bytes=7-" }), false)
    expect(res.status).toBe(206)
    expect(await res.text()).toBe("789")
  })

  it("serves a suffix range", async () => {
    writeStored("v.mp4", "0123456789")
    const res = await serveStoredFile(PROJECT, "v.mp4", "video/mp4", "v", req({ range: "bytes=-3" }), false)
    expect(res.status).toBe(206)
    expect(res.headers.get("Content-Range")).toBe("bytes 7-9/10")
    expect(await res.text()).toBe("789")
  })

  it("clamps an end beyond the file size", async () => {
    writeStored("v.mp4", "0123456789")
    const res = await serveStoredFile(PROJECT, "v.mp4", "video/mp4", "v", req({ range: "bytes=8-100" }), false)
    expect(res.headers.get("Content-Range")).toBe("bytes 8-9/10")
  })

  it("returns 416 for an unsatisfiable range", async () => {
    writeStored("v.mp4", "0123456789")
    const res = await serveStoredFile(PROJECT, "v.mp4", "video/mp4", "v", req({ range: "bytes=20-30" }), false)
    expect(res.status).toBe(416)
    expect(res.headers.get("Content-Range")).toBe("bytes */10")
  })

  it("returns 416 when start > end", async () => {
    writeStored("v.mp4", "0123456789")
    const res = await serveStoredFile(PROJECT, "v.mp4", "video/mp4", "v", req({ range: "bytes=5-2" }), false)
    expect(res.status).toBe(416)
  })

  it("ignores a malformed range header and serves the whole file", async () => {
    writeStored("v.mp4", "0123456789")
    const res = await serveStoredFile(PROJECT, "v.mp4", "video/mp4", "v", req({ range: "bytes=a-b" }), false)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("0123456789")
  })

  it("returns 404 when the path is a directory (read fails after stat)", async () => {
    fsSync.mkdirSync(path.join(uploadDir(), "adir"), { recursive: true })
    const res = await serveStoredFile(PROJECT, "adir", "text/plain", "adir", req(), false)
    expect(res.status).toBe(404)
  })
})

describe("deleteUploadedFile", () => {
  it("removes a stored file", async () => {
    writeStored("del.txt", "x")
    await deleteUploadedFile(PROJECT, "del.txt")
    expect(fsSync.existsSync(path.join(uploadDir(), "del.txt"))).toBe(false)
  })

  it("ignores a missing file", async () => {
    await expect(deleteUploadedFile(PROJECT, "missing.txt")).resolves.toBeUndefined()
  })

  it("does nothing for a traversal name", async () => {
    const outside = path.join(tmpRoot, "keep.txt")
    fsSync.writeFileSync(outside, "keep")
    await deleteUploadedFile(PROJECT, "../../../keep.txt")
    expect(fsSync.existsSync(outside)).toBe(true)
  })
})

describe("requireAuth / requireAdmin", () => {
  beforeEach(() => authMock.mockReset())

  it("requireAuth returns 401 without a session", async () => {
    authMock.mockResolvedValue(null)
    const res = await requireAuth()
    expect("error" in res && res.error?.status).toBe(401)
    if ("error" in res) expect(await res.error?.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" })
  })

  it("requireAuth returns the session", async () => {
    const session = { user: { id: "u1", role: "member" } }
    authMock.mockResolvedValue(session)
    expect(await requireAuth()).toEqual({ session })
  })

  it("requireAdmin returns 401 without a session", async () => {
    authMock.mockResolvedValue({ user: {} })
    const res = await requireAdmin()
    expect("error" in res && res.error?.status).toBe(401)
  })

  it("requireAdmin returns 403 for non-admins", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "section_manager" } })
    const res = await requireAdmin()
    expect("error" in res && res.error?.status).toBe(403)
    if ("error" in res) expect((await res.error?.json()).code).toBe("ADMIN_REQUIRED")
  })

  it("requireAdmin passes admins", async () => {
    const session = { user: { id: "u1", role: "admin" } }
    authMock.mockResolvedValue(session)
    expect(await requireAdmin()).toEqual({ session })
  })
})

describe("serveStoredFile charset (P-13)", () => {
  const req = (headers: Record<string, string> = {}) => new Request("http://x/f", { headers })

  it("adds charset=utf-8 to a UTF-8 text file", async () => {
    writeStored("ja.txt", "日本語のメモ")
    const res = await serveStoredFile(PROJECT, "ja.txt", "text/plain", "ja.txt", req(), false)
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
  })

  it("adds charset=shift_jis to a Shift_JIS CSV, also for range requests", async () => {
    writeStored("sjis.csv", Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x2c, 0x31]))
    const full = await serveStoredFile(PROJECT, "sjis.csv", "text/csv", "s.csv", req(), false)
    expect(full.headers.get("Content-Type")).toBe("text/csv; charset=shift_jis")
    const part = await serveStoredFile(PROJECT, "sjis.csv", "text/csv", "s.csv", req({ range: "bytes=0-1" }), false)
    expect(part.status).toBe(206)
    expect(part.headers.get("Content-Type")).toBe("text/csv; charset=shift_jis")
  })

  it("leaves unknown encodings and non-text types without a charset", async () => {
    writeStored("bin.txt", Buffer.from([0x80, 0x41]))
    const res = await serveStoredFile(PROJECT, "bin.txt", "text/plain", "b.txt", req(), false)
    expect(res.headers.get("Content-Type")).toBe("text/plain")
    writeStored("p.png", "PNG")
    const img = await serveStoredFile(PROJECT, "p.png", "image/png", "p.png", req(), false)
    expect(img.headers.get("Content-Type")).toBe("image/png")
  })
})
