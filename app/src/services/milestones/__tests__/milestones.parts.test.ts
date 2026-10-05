import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/lib/api-helpers", () => ({
  saveUploadedFile: vi.fn(async () => ({ ok: true, fileName: "f.png", originalName: "a.png", fileSize: 10, mimeType: "image/png" })),
  deleteUploadedFile: vi.fn(async () => undefined),
}))
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))
vi.mock("../milestones.repository")
vi.mock("../milestones.parts.repository")

const repo = await import("../milestones.repository")
const parts = await import("../milestones.parts.repository")
const helpers = await import("@/lib/api-helpers")
const quota = await import("@/services/attachments/storage-quota")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const checks = await import("../milestones.checks")
const punch = await import("../milestones.punch")
const docs = await import("../milestones.documents")
const budget = await import("../milestones.budget")

const NOW = new Date("2026-10-02T03:00:00Z")
const CHECK = { id: "c1", name: "能力", result: null, planItemId: null }
const PUNCH = { id: "pu1", title: "ボルト不足", status: "open", photos: [] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(parts.findCheck).mockResolvedValue(CHECK as never)
  vi.mocked(parts.findPunch).mockResolvedValue(PUNCH as never)
  vi.mocked(parts.findDocument).mockResolvedValue({ id: "d1", name: "図面", status: "pending", files: [] } as never)
  vi.mocked(repo.findLivePlanItem).mockResolvedValue({ id: "s1", name: "x", notes: null })
})

describe("checks", () => {
  it("recording a result stamps today (Tokyo) and the recorder; clearing clears them", async () => {
    await checks.updateCheck("p1", "c1", { result: "passed", witness: "山田" }, ACTOR, NOW)
    expect(parts.updateCheck).toHaveBeenCalledWith(TX, "c1", { witness: "山田", result: "passed", checkedAt: new Date("2026-10-02T00:00:00Z"), recordedById: "u1", recordedByName: "Alice" })
    await checks.updateCheck("p1", "c1", { result: null }, ACTOR, NOW)
    expect(parts.updateCheck).toHaveBeenLastCalledWith(TX, "c1", { result: null, checkedAt: null, recordedById: null, recordedByName: null })
  })

  it("keeps an explicit check day", async () => {
    await checks.updateCheck("p1", "c1", { result: "failed", checkedAt: "2026-09-30" }, ACTOR, NOW)
    expect(parts.updateCheck).toHaveBeenCalledWith(TX, "c1", expect.objectContaining({ checkedAt: new Date("2026-09-30T00:00:00Z") }))
  })

  it("rejects the 101st check and a stage link outside the project", async () => {
    vi.mocked(parts.countChecks).mockResolvedValue(100)
    await expect(checks.createCheck("p1", { name: "x" }, ACTOR)).rejects.toMatchObject({ code: "MILESTONE_LIMIT_REACHED" })
    vi.mocked(parts.countChecks).mockResolvedValue(0)
    vi.mocked(repo.findLivePlanItem).mockResolvedValue(null)
    await expect(checks.createCheck("p1", { name: "x", planItemId: "other" }, ACTOR)).rejects.toMatchObject({ status: 400, code: "INVALID_REFERENCE" })
  })

  it("404s for a check of another project", async () => {
    vi.mocked(parts.findCheck).mockResolvedValue(null)
    await expect(checks.deleteCheck("p1", "c9", ACTOR)).rejects.toMatchObject({ status: 404 })
  })
})

describe("punch list", () => {
  it("an assignee must be a project member; the member's name is copied", async () => {
    vi.mocked(repo.findMemberName).mockResolvedValue(null)
    await expect(punch.createPunch("p1", { title: "t", assigneeId: "x" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_OWNER_NOT_MEMBER" })
    vi.mocked(repo.findMemberName).mockResolvedValue({ user: { name: "Bob" } })
    await punch.createPunch("p1", { title: "t", assigneeId: "u2", dueDate: "2026-10-10" }, ACTOR)
    expect(parts.insertPunch).toHaveBeenCalledWith(TX, expect.objectContaining({ assigneeId: "u2", assigneeName: "Bob", dueDate: new Date("2026-10-10T00:00:00Z"), createdByName: "Alice" }))
  })

  it("a typed assignee name works without a member", async () => {
    await punch.updatePunch("p1", "pu1", { assigneeId: null, assigneeName: "メーカー 佐藤" }, ACTOR, NOW)
    expect(parts.updatePunch).toHaveBeenCalledWith(TX, "pu1", { assigneeId: null, assigneeName: "メーカー 佐藤" })
  })

  it("done stamps closedAt, reopening clears it", async () => {
    await punch.updatePunch("p1", "pu1", { status: "done" }, ACTOR, NOW)
    expect(parts.updatePunch).toHaveBeenCalledWith(TX, "pu1", { status: "done", closedAt: NOW })
    vi.mocked(parts.findPunch).mockResolvedValue({ ...PUNCH, status: "done" } as never)
    await punch.updatePunch("p1", "pu1", { status: "open" }, ACTOR, NOW)
    expect(parts.updatePunch).toHaveBeenLastCalledWith(TX, "pu1", { status: "open", closedAt: null })
  })

  it("deleting removes the stored photo files after the rows", async () => {
    vi.mocked(parts.findPunchFileNames).mockResolvedValue([{ fileName: "a.png" }])
    await punch.deletePunch("p1", "pu1", ACTOR)
    expect(parts.deletePunch).toHaveBeenCalledWith(TX, "pu1")
    expect(helpers.deleteUploadedFile).toHaveBeenCalledWith("p1", "a.png")
  })

  it("photos: quota checked, images only (the verified type decides), at most 10", async () => {
    const png = new File(["x"], "a.png", { type: "image/png" })
    await punch.uploadPunchPhoto("p1", "pu1", png, ACTOR)
    expect(quota.assertStorageQuota).toHaveBeenCalledWith("p1", 1)
    expect(parts.insertPunchPhoto).toHaveBeenCalledWith(DEFAULT_DB, { punchItemId: "pu1", fileName: "f.png", originalName: "a.png", fileSize: 10, mimeType: "image/png" })
    await expect(punch.uploadPunchPhoto("p1", "pu1", new File(["x"], "a.pdf", { type: "application/pdf" }), ACTOR)).rejects.toMatchObject({ code: "IMPROVEMENT_PHOTO_NOT_IMAGE" })
    vi.mocked(helpers.saveUploadedFile).mockResolvedValueOnce({ ok: true, fileName: "g.bin", originalName: "fake.png", fileSize: 3, mimeType: "application/pdf" } as never)
    await expect(punch.uploadPunchPhoto("p1", "pu1", png, ACTOR)).rejects.toMatchObject({ code: "IMPROVEMENT_PHOTO_NOT_IMAGE" })
    expect(helpers.deleteUploadedFile).toHaveBeenCalledWith("p1", "g.bin")
    vi.mocked(parts.countPunchPhotos).mockResolvedValue(10)
    await expect(punch.uploadPunchPhoto("p1", "pu1", png, ACTOR)).rejects.toMatchObject({ code: "MILESTONE_LIMIT_REACHED" })
  })
})

describe("documents", () => {
  it("received stamps when / who; pending clears", async () => {
    await docs.updateDocument("p1", "d1", { status: "received" }, ACTOR, NOW)
    expect(parts.updateDocument).toHaveBeenCalledWith(TX, "d1", { status: "received", receivedAt: NOW, receivedByName: "Alice" })
    vi.mocked(parts.findDocument).mockResolvedValue({ id: "d1", name: "図面", status: "received", files: [] } as never)
    await docs.updateDocument("p1", "d1", { status: "pending" }, ACTOR, NOW)
    expect(parts.updateDocument).toHaveBeenLastCalledWith(TX, "d1", { status: "pending", receivedAt: null, receivedByName: null })
  })

  it("files are not limited to images", async () => {
    await docs.uploadDocumentFile("p1", "d1", new File(["x"], "a.pdf", { type: "application/pdf" }), ACTOR)
    expect(parts.insertDocumentFile).toHaveBeenCalledWith(DEFAULT_DB, expect.objectContaining({ documentId: "d1", uploadedByName: "Alice" }))
  })
})

describe("budget and trend", () => {
  it("a null metric value removes the month; a value upserts it", async () => {
    vi.mocked(parts.findMetric).mockResolvedValue({ id: "m1", name: "不良率", points: [{ month: "2026-09", value: 1.5 }] } as never)
    await budget.putMetricPoint("p1", "m1", { month: "2026-09", value: null }, ACTOR)
    expect(parts.deleteMetricPoint).toHaveBeenCalledWith(TX, "m1", "2026-09")
    await budget.putMetricPoint("p1", "m1", { month: "2026-10", value: 1.2 }, ACTOR)
    expect(parts.upsertMetricPoint).toHaveBeenCalledWith(TX, "m1", "2026-10", 1.2, "Alice")
  })

  it("budget lines keep untouched fields and blank notes become null", async () => {
    vi.mocked(parts.findBudgetLine).mockResolvedValue({ id: "b1", name: "本体", plannedYen: 100, actualYen: null } as never)
    await budget.updateBudgetLine("p1", "b1", { actualYen: 120, note: "" }, ACTOR)
    expect(parts.updateBudgetLine).toHaveBeenCalledWith(TX, "b1", { actualYen: 120, note: null })
  })
})
