import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/api-helpers", () => ({ saveUploadedFile: vi.fn(), deleteUploadedFile: vi.fn(async () => undefined) }))
vi.mock("../icebox.repository")

const repo = await import("../icebox.repository")
const tr = await import("@/services/_shared/translations")
const files = await import("@/lib/api-helpers")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const svc = await import("../icebox.service")

const fakeFile = new File(["x"], "a.txt", { type: "text/plain" })

describe("icebox.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("groups items by status", async () => {
    vi.mocked(repo.findIceboxItems).mockResolvedValue([
      { id: "1", status: "unreviewed" },
      { id: "2", status: "frozen" },
      { id: "3", status: "reviewed" },
    ] as never)
    const out = await svc.listIcebox("p1")
    expect(out.unreviewed.map((i) => i.id)).toEqual(["1"])
    expect(out.frozen.map((i) => i.id)).toEqual(["2"])
    expect(out.reviewed.map((i) => i.id)).toEqual(["3"])
    expect(out.completed).toEqual([])
  })

  it("creates with next display id, defaulting the author to the actor", async () => {
    vi.mocked(repo.nextIceboxDisplayId).mockResolvedValue(12)
    vi.mocked(repo.insertIceboxItem).mockResolvedValue({ id: "n" } as never)
    await svc.createIceboxItem("p1", { request: "R" }, ACTOR)
    expect(repo.insertIceboxItem).toHaveBeenCalledWith(TX, expect.objectContaining({
      displayId: 12,
      author: "Alice",
      status: "unreviewed",
    }))
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "icebox_item", "n", { id: "n" })
  })

  it("updates and enqueues the changed fields", async () => {
    vi.mocked(repo.updateIceboxItem).mockResolvedValue({ id: "i" } as never)
    const out = await svc.updateIceboxItem("p1", "i", { poReviewMemo: "m" }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "icebox_item", "i", { poReviewMemo: "m" })
    expect(out).toEqual({ id: "i", i18n: {} })
  })

  it("delete purges translations in the tx and removes files after commit", async () => {
    vi.mocked(repo.findAttachmentFileNames).mockResolvedValue([{ fileName: "f1" }, { fileName: "f2" }])
    await svc.deleteIceboxItem("p1", "i")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { icebox_item: ["i"] })
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "f1")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "f2")
  })

  it("does not touch files when the delete fails", async () => {
    vi.mocked(repo.findAttachmentFileNames).mockResolvedValue([{ fileName: "f1" }])
    vi.mocked(repo.deleteIceboxItem).mockRejectedValueOnce(new Error("x"))
    await expect(svc.deleteIceboxItem("p1", "i")).rejects.toThrow("x")
    expect(files.deleteUploadedFile).not.toHaveBeenCalled()
  })

  it("upload validates item, file and storage result", async () => {
    vi.mocked(repo.findIceboxItemId).mockResolvedValueOnce(null)
    await expect(svc.uploadIceboxAttachment("p1", "i", fakeFile)).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findIceboxItemId).mockResolvedValue({ id: "i" })
    await expect(svc.uploadIceboxAttachment("p1", "i", null)).rejects.toMatchObject({ status: 400 })
    vi.mocked(files.saveUploadedFile).mockResolvedValueOnce({ ok: false, error: "too big", status: 413, code: "PAYLOAD_TOO_LARGE" })
    await expect(svc.uploadIceboxAttachment("p1", "i", fakeFile)).rejects.toMatchObject({ status: 413 })
    vi.mocked(files.saveUploadedFile).mockResolvedValueOnce({
      ok: true, fileName: "s", originalName: "a.txt", fileSize: 1, mimeType: "text/plain",
    })
    vi.mocked(repo.insertIceboxAttachment).mockResolvedValueOnce({ id: "att" } as never)
    await expect(svc.uploadIceboxAttachment("p1", "i", fakeFile)).resolves.toEqual({ id: "att" })
  })

  it("attachment get / delete", async () => {
    vi.mocked(repo.findIceboxAttachment).mockResolvedValueOnce(null)
    await expect(svc.getIceboxAttachment("p1", "i", "a")).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findIceboxAttachment).mockResolvedValue({ id: "a", fileName: "f" } as never)
    await svc.deleteIceboxAttachment("p1", "i", "a")
    expect(repo.deleteIceboxAttachment).toHaveBeenCalledWith(DEFAULT_DB, "a")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "f")
  })
})
