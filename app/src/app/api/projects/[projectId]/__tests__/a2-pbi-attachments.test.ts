import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, BASE, ctx, formReq, getReq } from "./a2-helpers"

/** PBI 参考資料 attachments: real service/repository/api-helpers; Prisma + auth mocked; temp upload root. */
const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  sectionFindFirst: vi.fn(),
  pbiFindFirst: vi.fn(),
  attCreate: vi.fn(),
  attFindFirst: vi.fn(),
  attFindMany: vi.fn(),
  attDelete: vi.fn(),
  attCount: vi.fn(),
  activityCreate: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => m.queryRaw(...a),
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => m.sectionFindFirst(...a) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
    productBacklogItem: { findFirst: (...a: unknown[]) => m.pbiFindFirst(...a) },
    pbiAttachment: {
      create: (...a: unknown[]) => m.attCreate(...a),
      findFirst: (...a: unknown[]) => m.attFindFirst(...a),
      findMany: (...a: unknown[]) => m.attFindMany(...a),
      delete: (...a: unknown[]) => m.attDelete(...a),
      count: (...a: unknown[]) => m.attCount(...a),
    },
    activityLog: { create: (...a: unknown[]) => m.activityCreate(...a) },
  },
}))
vi.mock("@/services/_shared/activity", () => ({ logActivity: vi.fn(async () => undefined) }))

const list = await import("../backlog/[itemId]/attachments/route")
const one = await import("../backlog/[itemId]/attachments/[attachmentId]/route")
const { logActivity } = await import("@/services/_shared/activity")

const PI = ctx({ projectId: "p1", itemId: "b1" })
const PIA = ctx({ projectId: "p1", itemId: "b1", attachmentId: "a1" })
const URL_ONE = `${BASE}/backlog/b1/attachments/a1`
const MB = 1024 * 1024

let tmpRoot: string
beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kanflow-a2-pbi-att-"))
})
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

function fileForm(content: string, name: string, type: string) {
  const fd = new FormData()
  fd.set("file", new File([content], name, { type }))
  return fd
}

/** A request whose form carries a file declaring `size` bytes (nothing that large is allocated). */
function sizedFileReq(size: number): Request {
  const file = new File(["x"], "huge.png", { type: "image/png" })
  Object.defineProperty(file, "size", { value: size })
  return { formData: async () => ({ get: () => file }) } as unknown as Request
}

async function storeFile(fileName: string, content: string) {
  const dir = path.join(tmpRoot, "private", "uploads", "p1")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, fileName), content)
}

describe("PBI attachment routes", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    vi.mocked(logActivity).mockClear()
    m.sectionFindFirst.mockResolvedValue(null)
    m.attCount.mockResolvedValue(0)
    m.queryRaw.mockResolvedValue([{ total: "0" }])
    vi.spyOn(process, "cwd").mockReturnValue(tmpRoot)
    m.attCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("GET list", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      expect((await list.GET(getReq(), PI)).status).toBe(401)
    })

    it("any member may read; lists the live PBI's attachments", async () => {
      asRole(m, "dev")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      m.attFindMany.mockResolvedValue([{ id: "a1", originalName: "spec.pdf" }])
      const res = await list.GET(getReq(), PI)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([{ id: "a1", originalName: "spec.pdf" }])
      expect(m.attFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { backlogItemId: "b1" }, orderBy: { createdAt: "asc" } }))
    })

    it("404 PBI_NOT_FOUND for a trashed / foreign PBI", async () => {
      asRole(m, "dev")
      m.pbiFindFirst.mockResolvedValue(null)
      const res = await list.GET(getReq(), PI)
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: "PBI_NOT_FOUND" })
    })
  })

  describe("POST upload", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      expect((await list.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)).status).toBe(401)
    })

    it("404 for non-member (project existence not leaked)", async () => {
      asRole(m, "outsider")
      expect((await list.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)).status).toBe(404)
      expect(m.pbiFindFirst).not.toHaveBeenCalled()
    })

    it("403 for a developer: only PBI writers (PO / SM) may attach", async () => {
      asRole(m, "dev")
      expect((await list.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)).status).toBe(403)
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("stores the file, links it to the live PBI and logs the change (201)", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      const res = await list.POST(formReq(fileForm("hello", "memo.txt", "text/plain")), PI)
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ originalName: "memo.txt", mimeType: "text/plain", fileSize: 5 })
      expect(m.pbiFindFirst).toHaveBeenCalledWith({ where: { id: "b1", projectId: "p1", deletedAt: null }, select: { id: true } })
      expect(m.attCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ backlogItemId: "b1" }) }))
      expect(logActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ entityType: "pbi", entityId: "b1", action: "update", diff: { changes: { attachment: { from: null, to: "memo.txt" } } } }),
      )
      const stored = await fs.readdir(path.join(tmpRoot, "private", "uploads", "p1"))
      expect(stored.some((f) => f.endsWith(".txt"))).toBe(true)
    })

    it("SM may attach too (backlog.write)", async () => {
      asRole(m, "sm")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      expect((await list.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)).status).toBe(201)
    })

    it("413 PAYLOAD_TOO_LARGE for a file over 200 MB (nothing stored)", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      const res = await list.POST(sizedFileReq(200 * MB + 1), PI)
      expect(res.status).toBe(413)
      expect(await res.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("413 STORAGE_QUOTA_EXCEEDED when the project quota would be passed", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      m.queryRaw.mockResolvedValue([{ total: String(5120 * MB) }])
      const res = await list.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)
      expect(res.status).toBe(413)
      expect(await res.json()).toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("400 PBI_TOO_MANY_ATTACHMENTS at the per-PBI limit", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      m.attCount.mockResolvedValue(20)
      const res = await list.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: "PBI_TOO_MANY_ATTACHMENTS" })
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("404 when the PBI is not a live PBI of this project", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue(null)
      expect((await list.POST(formReq(fileForm("x", "a.txt", "text/plain")), PI)).status).toBe(404)
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("415 for a disallowed MIME type", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      expect((await list.POST(formReq(fileForm("x", "a.sh", "application/x-sh")), PI)).status).toBe(415)
      expect(m.attCreate).not.toHaveBeenCalled()
    })

    it("415 FILE_TYPE_MISMATCH when a .png is not a PNG", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      const res = await list.POST(formReq(fileForm("x", "a.png", "image/png")), PI)
      expect(res.status).toBe(415)
      expect(await res.json()).toMatchObject({ code: "FILE_TYPE_MISMATCH" })
    })

    it("400 without a file", async () => {
      asRole(m, "po")
      m.pbiFindFirst.mockResolvedValue({ id: "b1" })
      expect((await list.POST(formReq(new FormData()), PI)).status).toBe(400)
    })
  })

  describe("GET one", () => {
    it("scopes the lookup through the live PBI of the project", async () => {
      asRole(m, "dev")
      m.attFindFirst.mockResolvedValue(null)
      expect((await one.GET(getReq(URL_ONE), PIA)).status).toBe(404)
      expect(m.attFindFirst).toHaveBeenCalledWith({
        where: { id: "a1", backlogItemId: "b1", backlogItem: { projectId: "p1", deletedAt: null } },
      })
    })

    it("serves an image inline to any member", async () => {
      asRole(m, "dev")
      await storeFile("i.jpg", "JPEG")
      m.attFindFirst.mockResolvedValue({ fileName: "i.jpg", mimeType: "image/jpeg", originalName: "i.jpg" })
      const res = await one.GET(getReq(URL_ONE), PIA)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-disposition")).toMatch(/^inline;/)
      expect(res.headers.get("content-type")).toBe("image/jpeg")
    })

    it("?download forces an attachment disposition", async () => {
      asRole(m, "dev")
      await storeFile("d.pdf", "%PDF")
      m.attFindFirst.mockResolvedValue({ fileName: "d.pdf", mimeType: "application/pdf", originalName: "d.pdf" })
      const res = await one.GET(getReq(`${URL_ONE}?download`), PIA)
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
    })
  })

  describe("DELETE", () => {
    it("403 for a developer", async () => {
      asRole(m, "dev")
      expect((await one.DELETE(getReq(), PIA)).status).toBe(403)
      expect(m.attDelete).not.toHaveBeenCalled()
    })

    it("deletes the row and the stored file, and logs the removal", async () => {
      asRole(m, "po")
      await storeFile("gone.txt", "x")
      m.attFindFirst.mockResolvedValue({ fileName: "gone.txt", originalName: "gone.txt" })
      m.attDelete.mockResolvedValue({})
      const res = await one.DELETE(getReq(), PIA)
      expect(res.status).toBe(200)
      expect(m.attDelete).toHaveBeenCalledWith({ where: { id: "a1" } })
      expect(logActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ diff: { changes: { attachment: { from: "gone.txt", to: null } } } }),
      )
      await expect(fs.stat(path.join(tmpRoot, "private", "uploads", "p1", "gone.txt"))).rejects.toThrow()
    })

    it("404 when the attachment is not on this PBI", async () => {
      asRole(m, "po")
      m.attFindFirst.mockResolvedValue(null)
      expect((await one.DELETE(getReq(), PIA)).status).toBe(404)
      expect(m.attDelete).not.toHaveBeenCalled()
    })
  })
})
