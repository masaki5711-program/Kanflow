import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, BASE, ctx, formReq, getReq, jsonReq } from "./a2-helpers"

/**
 * Attachment routes run end-to-end through the real service, repository and
 * api-helpers (upload MIME checks, serve headers). Only Prisma and auth are
 * mocked; files go to a throw-away temp dir via a spied `process.cwd()`.
 */
const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  folderFindFirst: vi.fn(),
  attCreate: vi.fn(),
  attFindFirst: vi.fn(),
  attUpdate: vi.fn(),
  attDelete: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
    attachmentFolder: { findFirst: (...a: unknown[]) => m.folderFindFirst(...a) },
    $queryRaw: (...a: unknown[]) => m.queryRaw(...a),
    projectAttachment: {
      create: (...a: unknown[]) => m.attCreate(...a),
      findFirst: (...a: unknown[]) => m.attFindFirst(...a),
      update: (...a: unknown[]) => m.attUpdate(...a),
      delete: (...a: unknown[]) => m.attDelete(...a),
    },
  },
}))

const upload = await import("../attachments/route")
const links = await import("../attachments/links/route")
const one = await import("../attachments/[attachmentId]/route")
const editor = await import("../attachments/[attachmentId]/editor-config/route")
const { verifyWopiToken, getWopiSigningKey } = await import("@/lib/wopi-token")

const P = ctx({ projectId: "p1" })
const PA = ctx({ projectId: "p1", attachmentId: "a1" })

let tmpRoot: string

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kanflow-a2-att-"))
})
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

/** PNG signature + 4 bytes: 12 bytes that pass the magic-byte check for .png. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

function fileForm(content: string | Uint8Array<ArrayBuffer>, name: string, type: string, extra: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set("file", new File([content], name, { type }))
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  return fd
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    projectId: "p1",
    folderId: null,
    fileName: "stored.bin",
    originalName: "report.pdf",
    fileSize: 5,
    mimeType: "application/pdf",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

async function storeFile(fileName: string, content: string) {
  const dir = path.join(tmpRoot, "private", "uploads", "p1")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, fileName), content)
}

describe("attachment routes", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    vi.spyOn(process, "cwd").mockReturnValue(tmpRoot)
    m.queryRaw.mockResolvedValue([{ total: "0" }])
    m.attCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "new",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      ...data,
    }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe("POST /attachments (upload)", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      const res = await upload.POST(formReq(fileForm("x", "a.png", "image/png")), P)
      expect(res.status).toBe(401)
    })

    it("404 for non-member, nothing written", async () => {
      asRole(m, "outsider")
      const res = await upload.POST(formReq(fileForm("x", "a.png", "image/png")), P)
      expect(res.status).toBe(404)
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("stores an allowed file and returns the DTO (201)", async () => {
      asRole(m, "dev")
      const res = await upload.POST(formReq(fileForm(PNG, "pic.png", "image/png")), P)
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toMatchObject({ originalName: "pic.png", mimeType: "image/png", fileSize: 12, folderId: null })
      expect(body.fileName).toMatch(/^\d+_[0-9a-f]{32}\.png$/)
      const onDisk = await fs.readFile(path.join(tmpRoot, "private", "uploads", "p1", body.fileName))
      expect(new Uint8Array(onDisk)).toEqual(PNG)
      expect(m.attCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ projectId: "p1", uploadedBy: "Taro", folderId: null }),
      })
    })

    it("415 for a disallowed MIME type (e.g. executable)", async () => {
      asRole(m, "dev")
      const res = await upload.POST(formReq(fileForm("MZ", "evil.exe", "application/x-msdownload")), P)
      expect(res.status).toBe(415)
      expect(await res.json()).toEqual({ error: "許可されていないファイル形式です", code: "UNSUPPORTED_MEDIA" })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("415 for application/javascript", async () => {
      asRole(m, "dev")
      const res = await upload.POST(formReq(fileForm("alert(1)", "x.js", "application/javascript")), P)
      expect(res.status).toBe(415)
    })

    it("415 FILE_TYPE_MISMATCH when the content does not match the extension", async () => {
      asRole(m, "dev")
      const res = await upload.POST(formReq(fileForm("<svg onload=alert(1)>", "pic.png", "image/png")), P)
      expect(res.status).toBe(415)
      expect(await res.json()).toMatchObject({ code: "FILE_TYPE_MISMATCH" })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("413 STORAGE_QUOTA_EXCEEDED when the project is full, nothing written", async () => {
      asRole(m, "dev")
      m.queryRaw.mockResolvedValueOnce([{ total: String(1024 ** 4) }])
      const res = await upload.POST(formReq(fileForm(PNG, "pic.png", "image/png")), P)
      expect(res.status).toBe(413)
      expect(await res.json()).toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("400 for an empty file", async () => {
      asRole(m, "dev")
      const res = await upload.POST(formReq(fileForm("", "empty.txt", "text/plain")), P)
      expect(res.status).toBe(400)
    })

    it("400 when no file field is present", async () => {
      asRole(m, "dev")
      const res = await upload.POST(formReq(new FormData()), P)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "ファイルがありません", code: "FILE_REQUIRED" })
    })

    it("strips unsafe extensions from the stored name", async () => {
      asRole(m, "dev")
      const res = await upload.POST(formReq(fileForm("a", "weird.p$p", "text/plain")), P)
      expect(res.status).toBe(201)
      expect((await res.json()).fileName).toMatch(/^\d+_[0-9a-f]{32}$/)
    })

    it("checks the target folder is in the same project", async () => {
      asRole(m, "dev")
      m.folderFindFirst.mockResolvedValue(null)
      const res = await upload.POST(formReq(fileForm("x", "a.png", "image/png", { folderId: "f-other" })), P)
      expect(res.status).toBe(404)
      expect(m.folderFindFirst).toHaveBeenCalledWith({ where: { id: "f-other", projectId: "p1" }, select: { id: true } })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("uploads into an existing folder", async () => {
      asRole(m, "dev")
      m.folderFindFirst.mockResolvedValue({ id: "f1" })
      const res = await upload.POST(formReq(fileForm(PNG, "a.png", "image/png", { folderId: "f1" })), P)
      expect(res.status).toBe(201)
      expect((await res.json()).folderId).toBe("f1")
    })

    it("500 when the request body is not multipart", async () => {
      asRole(m, "dev")
      const res = await upload.POST(jsonReq("POST", { a: 1 }), P)
      expect([400, 500]).toContain(res.status)
    })
  })

  describe("GET /attachments/[attachmentId] (serve)", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      expect((await one.GET(getReq(`${BASE}/attachments/a1`), PA)).status).toBe(401)
    })

    it("404 for non-member without touching the DB row", async () => {
      asRole(m, "outsider")
      expect((await one.GET(getReq(`${BASE}/attachments/a1`), PA)).status).toBe(404)
      expect(m.attFindFirst).not.toHaveBeenCalled()
    })

    it("looks up the attachment scoped to the project", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(null)
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.status).toBe(404)
      expect(m.attFindFirst).toHaveBeenCalledWith({ where: { id: "a1", projectId: "p1" } })
    })

    it("serves an image inline", async () => {
      asRole(m, "dev")
      await storeFile("img.png", "PNGDATA")
      m.attFindFirst.mockResolvedValue(row({ fileName: "img.png", originalName: "cat.png", mimeType: "image/png" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("image/png")
      expect(res.headers.get("content-disposition")).toMatch(/^inline;/)
      expect(res.headers.get("x-content-type-options")).toBe("nosniff")
      expect(await res.text()).toBe("PNGDATA")
    })

    it("forces download for an image when ?download is present", async () => {
      asRole(m, "dev")
      await storeFile("img.png", "PNGDATA")
      m.attFindFirst.mockResolvedValue(row({ fileName: "img.png", mimeType: "image/png" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1?download=1`), PA)
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
    })

    it.each([
      ["text/html", "page.html"],
      ["text/html; charset=utf-8", "page.htm"],
      ["image/svg+xml", "logo.svg"],
      ["application/xml", "data.xml"],
      ["", "noname"],
    ])("serves active content %j as an octet-stream download", async (mime, name) => {
      asRole(m, "dev")
      await storeFile("active.bin", "<script>alert(1)</script>")
      m.attFindFirst.mockResolvedValue(row({ fileName: "active.bin", originalName: name, mimeType: mime }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/octet-stream")
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
    })

    it("serves a non-inline-safe type (zip) as attachment keeping its type", async () => {
      asRole(m, "dev")
      await storeFile("z.zip", "PK")
      m.attFindFirst.mockResolvedValue(row({ fileName: "z.zip", originalName: "資料.zip", mimeType: "application/zip" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.headers.get("content-type")).toBe("application/zip")
      expect(res.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent("資料.zip")}`)
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
    })

    it("serves OOXML (docx) as a download with its own MIME ('openxmlformats' is not an XML document type)", async () => {
      asRole(m, "dev")
      await storeFile("d.docx", "DOC")
      const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      m.attFindFirst.mockResolvedValue(row({ fileName: "d.docx", originalName: "仕様.docx", mimeType: docx }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.headers.get("content-type")).toBe(docx)
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
    })

    it("supports Range requests (206)", async () => {
      asRole(m, "dev")
      await storeFile("v.mp4", "0123456789")
      m.attFindFirst.mockResolvedValue(row({ fileName: "v.mp4", mimeType: "video/mp4" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`, { range: "bytes=2-5" }), PA)
      expect(res.status).toBe(206)
      expect(res.headers.get("content-range")).toBe("bytes 2-5/10")
      expect(await res.text()).toBe("2345")
    })

    it("416 for an unsatisfiable range", async () => {
      asRole(m, "dev")
      await storeFile("v.mp4", "0123456789")
      m.attFindFirst.mockResolvedValue(row({ fileName: "v.mp4", mimeType: "video/mp4" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`, { range: "bytes=50-60" }), PA)
      expect(res.status).toBe(416)
    })

    it("404 when the stored file is missing on disk", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ fileName: "gone.pdf" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "File missing", code: "FILE_MISSING" })
    })

    it("400 when the stored fileName would escape the uploads dir", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ fileName: "../../../etc/passwd" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.status).toBe(400)
    })

    it("redirects (302) a link entry to its URL instead of serving a file", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "text/x-uri", linkUrl: "https://gitlab.example.com/group/repo", fileName: "" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.status).toBe(302)
      expect(res.headers.get("location")).toBe("https://gitlab.example.com/group/repo")
    })

    it("404 for a link entry whose stored URL is no longer valid", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "text/x-uri", linkUrl: "javascript:alert(1)", fileName: "" }))
      const res = await one.GET(getReq(`${BASE}/attachments/a1`), PA)
      expect(res.status).toBe(404)
    })
  })

  describe("PATCH/DELETE /attachments/[attachmentId]", () => {
    it("PATCH moves into a folder of the same project", async () => {
      asRole(m, "dev")
      m.folderFindFirst.mockResolvedValue({ id: "f1" })
      m.attUpdate.mockResolvedValue({ id: "a1", folderId: "f1" })
      const res = await one.PATCH(jsonReq("PATCH", { folderId: "f1", sortOrder: 3 }), PA)
      expect(res.status).toBe(200)
      expect(m.attUpdate).toHaveBeenCalledWith({ where: { id: "a1", projectId: "p1" }, data: { folderId: "f1", sortOrder: 3 } })
    })

    it("PATCH 404 when the folder belongs to another project", async () => {
      asRole(m, "dev")
      m.folderFindFirst.mockResolvedValue(null)
      expect((await one.PATCH(jsonReq("PATCH", { folderId: "fX" }), PA)).status).toBe(404)
      expect(m.attUpdate).not.toHaveBeenCalled()
    })

    it("PATCH 400 on non-integer sortOrder", async () => {
      asRole(m, "dev")
      expect((await one.PATCH(jsonReq("PATCH", { sortOrder: "1" }), PA)).status).toBe(400)
    })

    it("PATCH 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await one.PATCH(jsonReq("PATCH", { folderId: null }), PA)).status).toBe(404)
    })

    it("PATCH renames a link entry and updates its URL", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "text/x-uri", linkUrl: "https://a.com", fileName: "" }))
      m.attUpdate.mockResolvedValue(row({ mimeType: "text/x-uri", originalName: "New name", linkUrl: "https://b.com/", fileName: "" }))
      const res = await one.PATCH(jsonReq("PATCH", { name: "New name", url: "https://b.com" }), PA)
      expect(res.status).toBe(200)
      expect(m.attUpdate).toHaveBeenCalledWith({ where: { id: "a1", projectId: "p1" }, data: { originalName: "New name", linkUrl: "https://b.com/" } })
      expect((await res.json()).originalName).toBe("New name")
    })

    it("PATCH 400 LINK_ONLY_FIELD when renaming a plain file", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "application/pdf" }))
      const res = await one.PATCH(jsonReq("PATCH", { name: "New name" }), PA)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("LINK_ONLY_FIELD")
      expect(m.attUpdate).not.toHaveBeenCalled()
    })

    it("PATCH 400 LINK_URL_INVALID for a non-http(s) URL on a link entry", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "text/x-uri", linkUrl: "https://a.com", fileName: "" }))
      const res = await one.PATCH(jsonReq("PATCH", { url: "javascript:alert(1)" }), PA)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("LINK_URL_INVALID")
      expect(m.attUpdate).not.toHaveBeenCalled()
    })

    it("DELETE removes row and stored file", async () => {
      asRole(m, "dev")
      await storeFile("del.pdf", "x")
      m.attFindFirst.mockResolvedValue(row({ fileName: "del.pdf" }))
      m.attDelete.mockResolvedValue({})
      const res = await one.DELETE(getReq(), PA)
      expect(res.status).toBe(200)
      expect(m.attDelete).toHaveBeenCalledWith({ where: { id: "a1" } })
      await expect(fs.stat(path.join(tmpRoot, "private", "uploads", "p1", "del.pdf"))).rejects.toThrow()
    })

    it("DELETE removes a link entry's row without touching any stored file", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "text/x-uri", linkUrl: "https://a.com", fileName: "" }))
      m.attDelete.mockResolvedValue({})
      const res = await one.DELETE(getReq(), PA)
      expect(res.status).toBe(200)
      expect(m.attDelete).toHaveBeenCalledWith({ where: { id: "a1" } })
    })

    it("DELETE 404 when the attachment is not in the project", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(null)
      expect((await one.DELETE(getReq(), PA)).status).toBe(404)
      expect(m.attDelete).not.toHaveBeenCalled()
    })

    it("DELETE 401 without session", async () => {
      asRole(m, "none")
      expect((await one.DELETE(getReq(), PA)).status).toBe(401)
    })

    it("DELETE 500 on DB failure", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row())
      m.attDelete.mockRejectedValue(new Error("db"))
      expect((await one.DELETE(getReq(), PA)).status).toBe(500)
    })
  })

  describe("GET /attachments/[attachmentId]/editor-config", () => {
    const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    const discovery =
      '<wopi-discovery><action ext="xlsx" name="edit" urlsrc="https://internal:9980/browser/abc/cool.html?"/></wopi-discovery>'

    it("401 without session", async () => {
      asRole(m, "none")
      expect((await editor.GET(getReq(), PA)).status).toBe(401)
    })

    it("404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await editor.GET(getReq(), PA)).status).toBe(404)
      expect(m.attFindFirst).not.toHaveBeenCalled()
    })

    it("404 when the attachment is not in the project", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(null)
      expect((await editor.GET(getReq(), PA)).status).toBe(404)
    })

    it("400 not_editable for a non-office file", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "image/png", originalName: "a.png" }))
      const res = await editor.GET(getReq(), PA)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        code: "not_editable",
        downloadUrl: "/api/projects/p1/attachments/a1",
        originalName: "a.png",
      })
    })

    it("500 wopi_token_missing when no signing secret is configured", async () => {
      asRole(m, "dev")
      vi.stubEnv("WOPI_ACCESS_TOKEN", "")
      vi.stubEnv("AUTH_SECRET", "")
      vi.stubEnv("NEXTAUTH_SECRET", "")
      m.attFindFirst.mockResolvedValue(row({ mimeType: XLSX }))
      const res = await editor.GET(getReq(), PA)
      expect(res.status).toBe(500)
      expect((await res.json()).code).toBe("wopi_token_missing")
    })

    it("returns editor URL and a token scoped to this project + attachment", async () => {
      asRole(m, "dev")
      vi.stubEnv("WOPI_ACCESS_TOKEN", "test-secret")
      m.attFindFirst.mockResolvedValue(row({ mimeType: XLSX }))
      const fetchMock = vi.fn().mockResolvedValue(new Response(discovery, { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)
      const res = await editor.GET(getReq(), PA)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.editorUrl).toContain("/browser/abc/cool.html?WOPISrc=")
      expect(body.editorUrl).toContain(encodeURIComponent("/api/wopi/files/p1_a1"))
      expect(body.accessTokenTtl).toBeGreaterThan(Date.now())
      const claims = verifyWopiToken(body.accessToken, getWopiSigningKey()!)
      expect(claims).toMatchObject({ projectId: "p1", attachmentId: "a1", userId: "user-1", canWrite: true })
    })

    it("502 collabora_unreachable when discovery fetch fails", async () => {
      asRole(m, "dev")
      vi.stubEnv("WOPI_ACCESS_TOKEN", "test-secret")
      m.attFindFirst.mockResolvedValue(row({ mimeType: XLSX }))
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")))
      const res = await editor.GET(getReq(), PA)
      expect(res.status).toBe(502)
      expect((await res.json()).code).toBe("collabora_unreachable")
    })

    it("502 collabora_unreachable on non-OK discovery response", async () => {
      asRole(m, "dev")
      vi.stubEnv("WOPI_ACCESS_TOKEN", "test-secret")
      m.attFindFirst.mockResolvedValue(row({ mimeType: XLSX }))
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })))
      const res = await editor.GET(getReq(), PA)
      expect(res.status).toBe(502)
      expect((await res.json()).code).toBe("collabora_unreachable")
    })

    it("502 collabora_error when discovery has no edit action", async () => {
      asRole(m, "dev")
      vi.stubEnv("WOPI_ACCESS_TOKEN", "test-secret")
      m.attFindFirst.mockResolvedValue(row({ mimeType: XLSX }))
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<wopi-discovery/>", { status: 200 })))
      const res = await editor.GET(getReq(), PA)
      expect(res.status).toBe(502)
      expect((await res.json()).code).toBe("collabora_error")
    })

    it("falls back to any edit action when the extension has none", async () => {
      asRole(m, "dev")
      vi.stubEnv("WOPI_ACCESS_TOKEN", "test-secret")
      m.attFindFirst.mockResolvedValue(row({ mimeType: "application/msword" }))
      const xml = '<x><action name="edit" ext="odt" urlsrc="http://c/edit?"/></x>'
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml, { status: 200 })))
      const res = await editor.GET(getReq(), PA)
      expect(res.status).toBe(200)
      expect((await res.json()).editorUrl).toContain("/edit?WOPISrc=")
    })
  })
})
