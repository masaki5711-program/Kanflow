import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/api-helpers", () => ({ saveUploadedFile: vi.fn(), deleteUploadedFile: vi.fn(async () => undefined) }))
vi.mock("../icebox.repository")
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))

const repo = await import("../icebox.repository")
const tr = await import("@/services/_shared/translations")
const files = await import("@/lib/api-helpers")
const { ACTOR, TX, DEFAULT_DB, prismaError, touchedTranslationFields } = await import("@/services/__tests__/support")
const { withTransaction } = await import("@/services/_shared/db")
const svc = await import("../icebox.service")
const { assertStorageQuota } = await import("@/services/attachments/storage-quota")
const { StatusError } = await import("@/services/_shared/errors")

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

  it("retries the create transaction when the displayId collides (P2002)", async () => {
    vi.mocked(repo.nextIceboxDisplayId).mockResolvedValueOnce(12).mockResolvedValueOnce(13)
    vi.mocked(repo.insertIceboxItem).mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce({ id: "n" } as never)
    await expect(svc.createIceboxItem("p1", { request: "R" }, ACTOR)).resolves.toEqual({ id: "n" })
    expect(withTransaction).toHaveBeenCalledTimes(2)
    expect(repo.insertIceboxItem).toHaveBeenLastCalledWith(TX, expect.objectContaining({ displayId: 13 }))
  })

  it("surfaces a 409 when the displayId keeps colliding", async () => {
    vi.mocked(repo.nextIceboxDisplayId).mockResolvedValue(12)
    vi.mocked(repo.insertIceboxItem)
      .mockRejectedValueOnce(prismaError("P2002"))
      .mockRejectedValueOnce(prismaError("P2002"))
      .mockRejectedValueOnce(prismaError("P2002"))
    await expect(svc.createIceboxItem("p1", { request: "R" }, ACTOR)).rejects.toMatchObject({ status: 409 })
  })

  it("updates and enqueues the changed fields", async () => {
    vi.mocked(repo.updateIceboxItem).mockResolvedValue({ id: "i" } as never)
    const out = await svc.updateIceboxItem("p1", "i", { poReviewMemo: "m" }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "icebox_item", "i", { poReviewMemo: "m" })
    expect(out).toEqual({ id: "i", i18n: {} })
  })

  // delete (trash) / restore / purge: see icebox.trash.test.ts

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

  it("upload enforces the project storage quota before writing the file", async () => {
    vi.mocked(repo.findIceboxItemId).mockResolvedValue({ id: "i" })
    vi.mocked(assertStorageQuota).mockRejectedValueOnce(new StatusError(413, "quota", {}, "STORAGE_QUOTA_EXCEEDED"))
    await expect(svc.uploadIceboxAttachment("p1", "i", fakeFile)).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" })
    expect(assertStorageQuota).toHaveBeenCalledWith("p1", fakeFile.size)
    expect(files.saveUploadedFile).not.toHaveBeenCalled()
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

describe("A3-02: partial updates keep translations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("a status-only update (text keys undefined) touches no FieldTranslation row", async () => {
    vi.mocked(repo.updateIceboxItem).mockResolvedValue({ id: "i", displayId: 1 } as never)
    await svc.updateIceboxItem("p1", "i", { status: "accepted", request: undefined } as never, ACTOR)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual([])
  })
})
