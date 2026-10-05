import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/lib/api-helpers", () => ({ saveUploadedFile: vi.fn(), deleteUploadedFile: vi.fn(async () => undefined) }))
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))
vi.mock("../improvements.repository")
vi.mock("../improvements.children.repository")

const repo = await import("../improvements.repository")
const children = await import("../improvements.children.repository")
const helpers = await import("@/lib/api-helpers")
const quota = await import("@/services/attachments/storage-quota")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const checks = await import("../improvements.checks")
const rollouts = await import("../improvements.rollouts")
const photos = await import("../improvements.photos")

const check = (over: Record<string, unknown>) => ({ id: "c", kind: "1m", dueDate: new Date(), checkedAt: null, result: null, note: null, checkedByName: null, notifiedAt: null, releaseItemId: "r1", ...over })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findItemState).mockResolvedValue({ id: "r1" } as never)
})

describe("scheduleAutoChecks", () => {
  it("creates the 1-month and 3-month checks the first time", async () => {
    vi.mocked(children.findChecks).mockResolvedValue([check({ kind: "custom" })] as never)
    const out = await checks.scheduleAutoChecks(TX as never, "r1", new Date("2026-01-31T00:00:00Z"))
    expect(out).toEqual({ created: 2, moved: 0 })
    expect(children.insertChecks).toHaveBeenCalledWith(TX, [
      { releaseItemId: "r1", kind: "1m", dueDate: new Date("2026-02-28T00:00:00Z") },
      { releaseItemId: "r1", kind: "3m", dueDate: new Date("2026-04-30T00:00:00Z") },
    ])
  })

  it("moves unchecked automatic checks (re-arming the reminder) and never moves recorded ones", async () => {
    vi.mocked(children.findChecks).mockResolvedValue([
      check({ id: "c1", kind: "1m", dueDate: new Date("2026-11-01T00:00:00Z") }),
      check({ id: "c3", kind: "3m", dueDate: new Date("2027-01-01T00:00:00Z"), checkedAt: new Date(), result: "sustained" }),
    ] as never)
    const out = await checks.scheduleAutoChecks(TX as never, "r1", new Date("2026-10-15T00:00:00Z"))
    expect(out).toEqual({ created: 0, moved: 1 })
    expect(children.updateCheck).toHaveBeenCalledTimes(1)
    expect(children.updateCheck).toHaveBeenCalledWith(TX, "c1", { dueDate: new Date("2026-11-15T00:00:00Z"), notifiedAt: null })
    expect(children.insertChecks).not.toHaveBeenCalled()
  })
})

describe("recordCheck", () => {
  it("stamps who and when for a result, clears them when the result is removed", async () => {
    vi.mocked(children.findCheck).mockResolvedValue(check({}) as never)
    await checks.recordCheck("p1", "r1", "c", { result: "sustained", note: "OK" }, ACTOR)
    expect(children.updateCheck).toHaveBeenCalledWith(TX, "c", expect.objectContaining({ result: "sustained", note: "OK", checkedById: "u1", checkedByName: "Alice", checkedAt: expect.any(Date) }))
    await checks.recordCheck("p1", "r1", "c", { result: null }, ACTOR)
    expect(children.updateCheck).toHaveBeenLastCalledWith(TX, "c", { result: null, checkedAt: null, checkedById: null, checkedByName: null })
  })

  it("404s for a check of another item / project", async () => {
    vi.mocked(children.findCheck).mockResolvedValue(null)
    await expect(checks.recordCheck("p1", "r1", "x", { result: "regressed" }, ACTOR)).rejects.toThrow("Not found")
  })

  it("custom checks are capped", async () => {
    vi.mocked(children.countChecks).mockResolvedValue(20)
    await expect(checks.addCustomCheck("p1", "r1", { dueDate: "2026-12-01" })).rejects.toMatchObject({ code: "IMPROVEMENT_TOO_MANY_CHECKS" })
  })
})

describe("rollouts", () => {
  it("adds at the end of the list", async () => {
    vi.mocked(children.countRollouts).mockResolvedValue(2)
    vi.mocked(children.insertRollout).mockResolvedValue({ id: "ro" } as never)
    await rollouts.addRollout("p1", "r1", { targetName: "Line 2" }, ACTOR)
    expect(children.insertRollout).toHaveBeenCalledWith(TX, { releaseItemId: "r1", targetName: "Line 2", sortOrder: 2 })
  })

  it("stamps doneAt when the status becomes done and clears it otherwise", async () => {
    vi.mocked(children.findRollout).mockResolvedValue({ id: "ro", targetName: "L2", status: "doing" } as never)
    vi.mocked(children.updateRollout).mockResolvedValue({ id: "ro", targetName: "L2", status: "done" } as never)
    await rollouts.updateRollout("p1", "r1", "ro", { status: "done" })
    expect(children.updateRollout).toHaveBeenCalledWith(TX, "ro", { status: "done", doneAt: expect.any(Date) })
    await rollouts.updateRollout("p1", "r1", "ro", { status: "todo" })
    expect(children.updateRollout).toHaveBeenLastCalledWith(TX, "ro", { status: "todo", doneAt: null })
  })

  it("reorder needs exactly the item's rollout ids", async () => {
    vi.mocked(children.findRollouts).mockResolvedValue([{ id: "a" }, { id: "b" }] as never)
    await expect(rollouts.reorderRollouts("p1", "r1", { orderedIds: ["a"] })).rejects.toThrow()
    await expect(rollouts.reorderRollouts("p1", "r1", { orderedIds: ["a", "a"] })).rejects.toThrow()
    await rollouts.reorderRollouts("p1", "r1", { orderedIds: ["b", "a"] })
    expect(children.updateRollout).toHaveBeenCalledWith(TX, "b", { sortOrder: 0 })
    expect(children.updateRollout).toHaveBeenCalledWith(TX, "a", { sortOrder: 1 })
  })
})

describe("photos", () => {
  const file = (type = "image/jpeg") => new File([new Uint8Array([1, 2, 3])], "p.jpg", { type })

  it("uploads an image within the per-phase cap and the quota", async () => {
    vi.mocked(children.countPhotos).mockResolvedValue(3)
    vi.mocked(helpers.saveUploadedFile).mockResolvedValue({ ok: true, fileName: "f.jpg", originalName: "p.jpg", fileSize: 3, mimeType: "image/jpeg" } as never)
    vi.mocked(children.insertPhoto).mockResolvedValue({ id: "ph" } as never)
    await photos.uploadPhoto("p1", "r1", "after", file(), ACTOR)
    expect(quota.assertStorageQuota).toHaveBeenCalledWith("p1", 3)
    expect(children.insertPhoto).toHaveBeenCalledWith(DEFAULT_DB, expect.objectContaining({ releaseItemId: "r1", phase: "after", fileName: "f.jpg" }))
  })

  it("refuses non-images (declared or detected) and the 11th photo of a phase", async () => {
    await expect(photos.uploadPhoto("p1", "r1", "before", file("application/pdf"))).rejects.toMatchObject({ code: "IMPROVEMENT_PHOTO_NOT_IMAGE" })
    vi.mocked(children.countPhotos).mockResolvedValue(10)
    await expect(photos.uploadPhoto("p1", "r1", "before", file())).rejects.toMatchObject({ code: "IMPROVEMENT_TOO_MANY_PHOTOS" })
    vi.mocked(children.countPhotos).mockResolvedValue(0)
    vi.mocked(helpers.saveUploadedFile).mockResolvedValue({ ok: true, fileName: "x.bin", originalName: "p.jpg", fileSize: 3, mimeType: "application/zip" } as never)
    await expect(photos.uploadPhoto("p1", "r1", "before", file())).rejects.toMatchObject({ code: "IMPROVEMENT_PHOTO_NOT_IMAGE" })
    expect(helpers.deleteUploadedFile).toHaveBeenCalledWith("p1", "x.bin")
    expect(children.insertPhoto).not.toHaveBeenCalled()
  })

  it("404s for an unknown item, a missing file is a validation error", async () => {
    vi.mocked(repo.findItemState).mockResolvedValue(null)
    await expect(photos.uploadPhoto("p1", "x", "before", file())).rejects.toThrow("Not found")
    vi.mocked(repo.findItemState).mockResolvedValue({ id: "r1" } as never)
    await expect(photos.uploadPhoto("p1", "r1", "before", null)).rejects.toMatchObject({ code: "FILE_REQUIRED" })
  })

  it("delete removes the row, then the stored file", async () => {
    vi.mocked(children.findPhoto).mockResolvedValue({ id: "ph", fileName: "f.jpg", originalName: "p.jpg", phase: "before" } as never)
    await photos.deletePhoto("p1", "r1", "ph", ACTOR)
    expect(children.deletePhoto).toHaveBeenCalledWith(DEFAULT_DB, "ph")
    expect(helpers.deleteUploadedFile).toHaveBeenCalledWith("p1", "f.jpg")
  })
})
