import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, BASE, ctx, formReq, getReq } from "./a2-helpers"

/** Icebox attachments: real service/repository/api-helpers; Prisma + auth mocked; temp upload root. */
const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  sectionFindFirst: vi.fn(),
  itemFindFirst: vi.fn(),
  attCreate: vi.fn(),
  attFindFirst: vi.fn(),
  attDelete: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ total: "0" }]),
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => m.sectionFindFirst(...a) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
    iceboxItem: { findFirst: (...a: unknown[]) => m.itemFindFirst(...a) },
    iceboxAttachment: {
      create: (...a: unknown[]) => m.attCreate(...a),
      findFirst: (...a: unknown[]) => m.attFindFirst(...a),
      delete: (...a: unknown[]) => m.attDelete(...a),
    },
  },
}))
vi.mock("@/services/_shared/translations", () => ({
  attachI18n: vi.fn(),
  attachI18nOne: vi.fn(),
  enqueueIn: vi.fn(),
  prepareText: vi.fn(),
  purgeIn: vi.fn(),
}))

const upload = await import("../icebox/[itemId]/attachments/route")
const one = await import("../icebox/[itemId]/attachments/[attachmentId]/route")

const PI = ctx({ projectId: "p1", itemId: "i1" })
const PIA = ctx({ projectId: "p1", itemId: "i1", attachmentId: "a1" })
const URL_ONE = `${BASE}/icebox/i1/attachments/a1`

let tmpRoot: string
beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kanflow-a2-ice-"))
})
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

function fileForm(content: string, name: string, type: string) {
  const fd = new FormData()
  fd.set("file", new File([content], name, { type }))
  return fd
}

async function storeFile(fileName: string, content: string) {
  const dir = path.join(tmpRoot, "private", "uploads", "p1")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, fileName), content)
}

describe("icebox attachment routes", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.sectionFindFirst.mockResolvedValue(null)
    vi.spyOn(process, "cwd").mockReturnValue(tmpRoot)
    m.attCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("POST upload", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      expect((await upload.POST(formReq(fileForm("x", "a.png", "image/png")), PI)).status).toBe(401)
    })

    it("404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await upload.POST(formReq(fileForm("x", "a.png", "image/png")), PI)).status).toBe(404)
      expect(m.itemFindFirst).not.toHaveBeenCalled()
    })

    it("section manager of the project may upload (icebox.write)", async () => {
      m.authMock.mockResolvedValue({ user: { id: "sm", role: "section_manager" } })
      m.memberFindFirst.mockResolvedValue(null)
      m.sectionFindFirst.mockResolvedValue({ sectionId: "s" })
      m.itemFindFirst.mockResolvedValue({ id: "i1" })
      expect((await upload.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)).status).toBe(201)
    })

    it("stores the file and links it to the item (201)", async () => {
      asRole(m, "dev")
      m.itemFindFirst.mockResolvedValue({ id: "i1" })
      const res = await upload.POST(formReq(fileForm("hello", "memo.txt", "text/plain")), PI)
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toMatchObject({ iceboxItemId: "i1", originalName: "memo.txt", mimeType: "text/plain", fileSize: 5 })
      expect(m.itemFindFirst).toHaveBeenCalledWith({ where: { id: "i1", projectId: "p1", deletedAt: null }, select: { id: true } })
    })

    it("404 when the icebox item is not in this project", async () => {
      asRole(m, "dev")
      m.itemFindFirst.mockResolvedValue(null)
      expect((await upload.POST(formReq(fileForm("x", "a.png", "image/png")), PI)).status).toBe(404)
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("415 for disallowed MIME", async () => {
      asRole(m, "dev")
      m.itemFindFirst.mockResolvedValue({ id: "i1" })
      const res = await upload.POST(formReq(fileForm("x", "a.sh", "application/x-sh")), PI)
      expect(res.status).toBe(415)
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("415 FILE_TYPE_MISMATCH when a .png is not a PNG", async () => {
      asRole(m, "dev")
      m.itemFindFirst.mockResolvedValue({ id: "i1" })
      const res = await upload.POST(formReq(fileForm("x", "a.png", "image/png")), PI)
      expect(res.status).toBe(415)
      expect(await res.json()).toMatchObject({ code: "FILE_TYPE_MISMATCH" })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("400 without a file", async () => {
      asRole(m, "dev")
      m.itemFindFirst.mockResolvedValue({ id: "i1" })
      expect((await upload.POST(formReq(new FormData()), PI)).status).toBe(400)
    })
  })

  describe("GET serve", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      expect((await one.GET(getReq(URL_ONE), PIA)).status).toBe(401)
    })

    it("scopes the lookup through the item's project", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(null)
      expect((await one.GET(getReq(URL_ONE), PIA)).status).toBe(404)
      expect(m.attFindFirst).toHaveBeenCalledWith({
        where: { id: "a1", iceboxItemId: "i1", iceboxItem: { projectId: "p1", deletedAt: null } },
      })
    })

    it("serves an image inline", async () => {
      asRole(m, "dev")
      await storeFile("i.jpg", "JPEG")
      m.attFindFirst.mockResolvedValue({ fileName: "i.jpg", mimeType: "image/jpeg", originalName: "i.jpg" })
      const res = await one.GET(getReq(URL_ONE), PIA)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-disposition")).toMatch(/^inline;/)
      expect(res.headers.get("content-type")).toBe("image/jpeg")
    })

    it("serves SVG as an octet-stream download (no stored XSS)", async () => {
      asRole(m, "dev")
      await storeFile("x.svg", "<svg onload=alert(1)>")
      m.attFindFirst.mockResolvedValue({ fileName: "x.svg", mimeType: "image/svg+xml", originalName: "x.svg" })
      const res = await one.GET(getReq(URL_ONE), PIA)
      expect(res.headers.get("content-type")).toBe("application/octet-stream")
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
    })

    it("?download forces attachment for a PDF", async () => {
      asRole(m, "dev")
      await storeFile("d.pdf", "%PDF")
      m.attFindFirst.mockResolvedValue({ fileName: "d.pdf", mimeType: "application/pdf", originalName: "d.pdf" })
      const inline = await one.GET(getReq(URL_ONE), PIA)
      expect(inline.headers.get("content-disposition")).toMatch(/^inline;/)
      const dl = await one.GET(getReq(`${URL_ONE}?download`), PIA)
      expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/)
    })
  })

  describe("DELETE", () => {
    it("404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await one.DELETE(getReq(), PIA)).status).toBe(404)
      expect(m.attDelete).not.toHaveBeenCalled()
    })

    it("deletes the row and the stored file", async () => {
      asRole(m, "dev")
      await storeFile("gone.txt", "x")
      m.attFindFirst.mockResolvedValue({ fileName: "gone.txt" })
      m.attDelete.mockResolvedValue({})
      const res = await one.DELETE(getReq(), PIA)
      expect(res.status).toBe(200)
      expect(m.attDelete).toHaveBeenCalledWith({ where: { id: "a1" } })
      await expect(fs.stat(path.join(tmpRoot, "private", "uploads", "p1", "gone.txt"))).rejects.toThrow()
    })

    it("404 when not found", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(null)
      expect((await one.DELETE(getReq(), PIA)).status).toBe(404)
    })

    it("500 on DB failure", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue({ fileName: "a" })
      m.attDelete.mockRejectedValue(new Error("db"))
      expect((await one.DELETE(getReq(), PIA)).status).toBe(500)
    })
  })
})
