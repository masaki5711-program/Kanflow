import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/api-helpers", () => ({ saveUploadedFile: vi.fn(), deleteUploadedFile: vi.fn(async () => undefined) }))
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))
vi.mock("../icebox.repository")

const repo = await import("../icebox.repository")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../icebox.service")

const CURRENT = { id: "i", version: 6, request: "theirs", attachments: [] }

describe("icebox optimistic locking", () => {
  beforeEach(() => vi.clearAllMocks())

  it("passes the expected version and strips it from the written fields", async () => {
    vi.mocked(repo.updateIceboxItem).mockResolvedValue({ id: "i", version: 3 } as never)
    const out = await svc.updateIceboxItem("p1", "i", { status: "reviewed", version: 2 }, ACTOR)
    expect(repo.updateIceboxItem).toHaveBeenCalledWith(TX, "p1", "i", { status: "reviewed" }, 2)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "icebox_item", "i", { status: "reviewed" })
    expect(out).toMatchObject({ version: 3 })
  })

  it("stale version → 409 with the current item (with i18n)", async () => {
    vi.mocked(repo.updateIceboxItem).mockResolvedValue(null)
    vi.mocked(repo.findIceboxItem).mockResolvedValue(CURRENT as never)
    const err = await svc.updateIceboxItem("p1", "i", { request: "mine", version: 2 }, ACTOR).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: "VERSION_CONFLICT", current: { ...CURRENT, i18n: {} } })
  })

  it("missing item → 404 ICEBOX_ITEM_NOT_FOUND", async () => {
    vi.mocked(repo.updateIceboxItem).mockResolvedValue(null)
    vi.mocked(repo.findIceboxItem).mockResolvedValue(null)
    await expect(svc.updateIceboxItem("p1", "i", { request: "x" }, ACTOR)).rejects.toMatchObject({ status: 404, code: "ICEBOX_ITEM_NOT_FOUND" })
  })

  it("delete with a stale version → 409", async () => {
    vi.mocked(repo.softDeleteIceboxItem).mockResolvedValue(false)
    vi.mocked(repo.findIceboxItem).mockResolvedValue(CURRENT as never)
    await expect(svc.deleteIceboxItem("p1", "i", ACTOR, 2)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" })
    expect(repo.softDeleteIceboxItem).toHaveBeenCalledWith(TX, "p1", "i", ACTOR.userId, 2)
  })
})
