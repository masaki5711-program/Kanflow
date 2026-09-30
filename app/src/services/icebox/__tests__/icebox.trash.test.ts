import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/_shared/soft-delete", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/_shared/soft-delete")>()),
  assertProjectLive: vi.fn(async () => undefined),
}))
vi.mock("@/lib/api-helpers", () => ({ saveUploadedFile: vi.fn(), deleteUploadedFile: vi.fn(async () => undefined) }))
vi.mock("../icebox.repository")
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))

const repo = await import("../icebox.repository")
const tr = await import("@/services/_shared/translations")
const files = await import("@/lib/api-helpers")
const activity = await import("@/services/_shared/activity")
const softDelete = await import("@/services/_shared/soft-delete")
const { ConflictError } = await import("@/services/_shared/errors")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../icebox.service")

describe("icebox trash", () => {
  beforeEach(() => vi.clearAllMocks())

  it("delete moves the item to the trash and keeps files and translations", async () => {
    vi.mocked(repo.softDeleteIceboxItem).mockResolvedValue(true)
    await svc.deleteIceboxItem("p1", "i", ACTOR)
    expect(repo.softDeleteIceboxItem).toHaveBeenCalledWith(TX, "p1", "i", ACTOR.userId, undefined)
    expect(repo.deleteIceboxItem).not.toHaveBeenCalled()
    expect(tr.purgeIn).not.toHaveBeenCalled()
    expect(files.deleteUploadedFile).not.toHaveBeenCalled()
    expect(activity.logActivity).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ entityType: "icebox", entityId: "i", action: "delete", actor: ACTOR })
    )
  })

  it("delete 404s for a missing / already trashed item", async () => {
    vi.mocked(repo.softDeleteIceboxItem).mockResolvedValue(false)
    await expect(svc.deleteIceboxItem("p1", "i", ACTOR)).rejects.toMatchObject({ status: 404, code: "ICEBOX_ITEM_NOT_FOUND" })
  })

  it("restore needs a trashed item and a live project", async () => {
    vi.mocked(repo.findTrashedIceboxItem).mockResolvedValue({ id: "i", projectId: "p1" })
    await svc.restoreIceboxItem("p1", "i", ACTOR)
    expect(softDelete.assertProjectLive).toHaveBeenCalledWith(TX, "p1")
    expect(repo.restoreIceboxItemRow).toHaveBeenCalledWith(TX, "p1", "i")
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ action: "restore", entityId: "i" }))
  })

  it("restore 404s when not in the trash and 409s when the project is trashed", async () => {
    vi.mocked(repo.findTrashedIceboxItem).mockResolvedValueOnce(null)
    await expect(svc.restoreIceboxItem("p1", "i", ACTOR)).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findTrashedIceboxItem).mockResolvedValueOnce({ id: "i", projectId: "p1" })
    vi.mocked(softDelete.assertProjectLive).mockRejectedValueOnce(new ConflictError("x", {}, "PROJECT_IN_TRASH"))
    await expect(svc.restoreIceboxItem("p1", "i", ACTOR)).rejects.toMatchObject({ code: "PROJECT_IN_TRASH" })
    expect(repo.restoreIceboxItemRow).not.toHaveBeenCalled()
  })

  it("purge hard-deletes a trashed item, purges translations in the tx and removes files after commit", async () => {
    vi.mocked(repo.findTrashedIceboxItem).mockResolvedValue({ id: "i", projectId: "p1" })
    vi.mocked(repo.findAttachmentFileNames).mockResolvedValue([{ fileName: "f1" }, { fileName: "f2" }])
    await svc.purgeIceboxItem("p1", "i", null)
    expect(repo.deleteIceboxItem).toHaveBeenCalledWith(TX, "p1", "i")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { icebox_item: ["i"] })
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "f1")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "f2")
  })

  it("purge does not touch files when the delete fails", async () => {
    vi.mocked(repo.findTrashedIceboxItem).mockResolvedValue({ id: "i", projectId: "p1" })
    vi.mocked(repo.findAttachmentFileNames).mockResolvedValue([{ fileName: "f1" }])
    vi.mocked(repo.deleteIceboxItem).mockRejectedValueOnce(new Error("x"))
    await expect(svc.purgeIceboxItem("p1", "i", null)).rejects.toThrow("x")
    expect(files.deleteUploadedFile).not.toHaveBeenCalled()
  })

  it("purge refuses an item that is not in the trash", async () => {
    vi.mocked(repo.findTrashedIceboxItem).mockResolvedValue(null)
    await expect(svc.purgeIceboxItem("p1", "i", ACTOR)).rejects.toMatchObject({ status: 404 })
    expect(repo.deleteIceboxItem).not.toHaveBeenCalled()
  })
})
