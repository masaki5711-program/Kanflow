import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) } }))
vi.mock("@/lib/api-helpers", () => ({
  saveUploadedFile: vi.fn(),
  copyTemplateFile: vi.fn(),
  deleteUploadedFile: vi.fn(async () => undefined),
}))
vi.mock("../attachments.repository")
vi.mock("../storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))

const repo = await import("../attachments.repository")
const files = await import("@/lib/api-helpers")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const svc = await import("../attachments.service")
const { assertStorageQuota } = await import("../storage-quota")
const { StatusError } = await import("@/services/_shared/errors")

const row = { id: "a1", originalName: "o", fileName: "f", fileSize: 1, mimeType: "m", folderId: null, createdAt: new Date(0) }
const saved = { ok: true as const, fileName: "f", originalName: "o", fileSize: 1, mimeType: "m" }
const file = new File(["x"], "o")

describe("attachments.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("upload validates file and folder, returns the DTO", async () => {
    await expect(svc.uploadAttachment("p1", null, null, ACTOR)).rejects.toMatchObject({ status: 400 })
    vi.mocked(repo.findFolderInProject).mockResolvedValueOnce(null)
    await expect(svc.uploadAttachment("p1", file, "fx", ACTOR)).rejects.toThrow("フォルダがありません")
    vi.mocked(files.saveUploadedFile).mockResolvedValueOnce({ ok: false, error: "type", status: 415, code: "UNSUPPORTED_MEDIA" })
    await expect(svc.uploadAttachment("p1", file, null, ACTOR)).rejects.toMatchObject({ status: 415 })
    vi.mocked(files.saveUploadedFile).mockResolvedValueOnce(saved)
    vi.mocked(repo.insertAttachment).mockResolvedValueOnce(row as never)
    await expect(svc.uploadAttachment("p1", file, null, ACTOR)).resolves.toEqual({ ...row, createdAt: "1970-01-01T00:00:00.000Z" })
    expect(repo.insertAttachment).toHaveBeenCalledWith(DEFAULT_DB, expect.objectContaining({ uploadedBy: "Alice" }))
  })

  it("upload enforces the project storage quota before writing the file", async () => {
    vi.mocked(assertStorageQuota).mockRejectedValueOnce(new StatusError(413, "quota", {}, "STORAGE_QUOTA_EXCEEDED"))
    await expect(svc.uploadAttachment("p1", file, null, ACTOR)).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" })
    expect(assertStorageQuota).toHaveBeenCalledWith("p1", file.size)
    expect(files.saveUploadedFile).not.toHaveBeenCalled()
  })

  it("attachTemplate is best effort", async () => {
    vi.mocked(files.copyTemplateFile).mockResolvedValueOnce({ ok: false, error: "missing" })
    await expect(svc.attachTemplate("p1", { fileName: "t", displayName: "t", mimeType: "m" }, null)).resolves.toBe(false)
    vi.mocked(files.copyTemplateFile).mockResolvedValueOnce(saved)
    await expect(svc.attachTemplate("p1", { fileName: "t", displayName: "t", mimeType: "m" }, "A")).resolves.toBe(true)
    expect(repo.insertAttachment).toHaveBeenCalledWith(DEFAULT_DB, expect.objectContaining({ folderId: null, uploadedBy: "A" }))
  })

  it("get / move / delete", async () => {
    vi.mocked(repo.findAttachment).mockResolvedValueOnce(null)
    await expect(svc.getAttachment("p1", "a")).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findFolderInProject).mockResolvedValueOnce({ id: "f1" })
    await svc.moveAttachment("p1", "a1", { folderId: "f1" })
    expect(repo.updateAttachment).toHaveBeenCalledWith(DEFAULT_DB, "p1", "a1", { folderId: "f1" })
    await svc.moveAttachment("p1", "a1", { folderId: null, sortOrder: 2 })
    expect(repo.updateAttachment).toHaveBeenLastCalledWith(DEFAULT_DB, "p1", "a1", { folderId: null, sortOrder: 2 })
    vi.mocked(repo.findAttachment).mockResolvedValueOnce(row as never)
    await svc.deleteAttachment("p1", "a1")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "f")
  })

  it("creates folders under a parent of the same project", async () => {
    vi.mocked(repo.findFolderInProject).mockResolvedValueOnce(null)
    await expect(svc.createFolder("p1", { name: "n", parentId: "foreign" })).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.nextFolderSortOrder).mockResolvedValue(2)
    vi.mocked(repo.insertFolder).mockResolvedValue({ id: "f", name: "n", parentId: null, sortOrder: 2, attachments: [row] } as never)
    const out = await svc.createFolder("p1", { name: "n" })
    expect(repo.insertFolder).toHaveBeenCalledWith(TX, { projectId: "p1", name: "n", parentId: null, sortOrder: 2 })
    expect(out.attachments[0].createdAt).toBe("1970-01-01T00:00:00.000Z")
  })

  it("folder reparent rejects self, foreign parents and cycles", async () => {
    vi.mocked(repo.findFolderTree).mockResolvedValue([
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
    ])
    await expect(svc.updateFolder("p1", "a", { parentId: "a" })).rejects.toMatchObject({ status: 400 })
    await expect(svc.updateFolder("p1", "a", { parentId: "b" })).rejects.toThrow("循環参照")
    await expect(svc.updateFolder("p1", "a", { parentId: "zz" })).rejects.toMatchObject({ status: 404 })
    await svc.updateFolder("p1", "b", { parentId: null, name: "x" })
    expect(repo.updateFolder).toHaveBeenCalledWith(DEFAULT_DB, "p1", "b", { parentId: null, name: "x" })
  })

  it("folder delete moves attachments to root first, in one tx", async () => {
    await svc.deleteFolder("p1", "f1")
    expect(repo.detachFolderAttachments).toHaveBeenCalledWith(TX, "p1", "f1")
    expect(repo.deleteFolder).toHaveBeenCalledWith(TX, "p1", "f1")
  })
})
