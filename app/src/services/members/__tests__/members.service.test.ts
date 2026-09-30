import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../members.repository")

const repo = await import("../members.repository")
const { TX } = await import("@/services/__tests__/support")
const svc = await import("../members.service")

describe("members.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("losesLastPo only when the sole PO leaves the role", () => {
    expect(svc.losesLastPo("po", "dev", 1)).toBe(true)
    expect(svc.losesLastPo("po", null, 1)).toBe(true)
    expect(svc.losesLastPo("po", "dev", 2)).toBe(false)
    expect(svc.losesLastPo("dev", null, 1)).toBe(false)
    expect(svc.losesLastPo("po", "po", 1)).toBe(false)
  })

  it("bulk add skips inactive users and existing members", async () => {
    vi.mocked(repo.findActiveUserIds).mockResolvedValue([{ id: "a" }, { id: "b" }])
    vi.mocked(repo.findMemberUserIds).mockResolvedValue([{ userId: "a" }])
    vi.mocked(repo.findMembersByUserIds).mockResolvedValue([{ id: "m-b" }] as never)
    const out = await svc.addMembersBulk("p1", ["a", "b", "c"], "dev")
    expect(repo.insertMembers).toHaveBeenCalledWith(TX, "p1", ["b"], "dev")
    expect(out).toEqual({ added: 1, skipped: 2, members: [{ id: "m-b" }] })
  })

  it("bulk add with nothing new reports added 0", async () => {
    vi.mocked(repo.findActiveUserIds).mockResolvedValue([])
    vi.mocked(repo.findMemberUserIds).mockResolvedValue([])
    expect(await svc.addMembersBulk("p1", ["x"], "dev")).toEqual({ added: 0, skipped: 1 })
    expect(repo.insertMembers).not.toHaveBeenCalled()
  })

  it("single add validates user state and duplicates", async () => {
    vi.mocked(repo.findUserByIdOrEmail).mockResolvedValueOnce(null)
    await expect(svc.addMember("p1", { email: "x@y" }, "dev")).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findUserByIdOrEmail).mockResolvedValueOnce({ id: "u", isActive: false })
    await expect(svc.addMember("p1", { userId: "u" }, "dev")).rejects.toMatchObject({ status: 400 })
    vi.mocked(repo.findUserByIdOrEmail).mockResolvedValueOnce({ id: "u", isActive: true })
    vi.mocked(repo.findMembership).mockResolvedValueOnce({ id: "m" })
    await expect(svc.addMember("p1", { userId: "u" }, "dev")).rejects.toMatchObject({ status: 409 })
    vi.mocked(repo.findUserByIdOrEmail).mockResolvedValueOnce({ id: "u", isActive: true })
    vi.mocked(repo.findMembership).mockResolvedValueOnce(null)
    vi.mocked(repo.insertMember).mockResolvedValueOnce({ id: "m" } as never)
    await expect(svc.addMember("p1", { userId: "u" }, "sm")).resolves.toEqual({ id: "m" })
  })

  it("refuses to demote or remove the last PO", async () => {
    vi.mocked(repo.findMemberRole).mockResolvedValue({ role: "po" })
    vi.mocked(repo.countPos).mockResolvedValue(1)
    await expect(svc.changeMemberRole("p1", "m1", "dev")).rejects.toThrow("最後のPOを降格")
    await expect(svc.removeMember("p1", "m1")).rejects.toThrow("最後のPOを削除")
    expect(repo.updateMemberRole).not.toHaveBeenCalled()
    expect(repo.deleteMember).not.toHaveBeenCalled()
  })

  it("allows role changes when another PO remains", async () => {
    vi.mocked(repo.findMemberRole).mockResolvedValue({ role: "po" })
    vi.mocked(repo.countPos).mockResolvedValue(2)
    vi.mocked(repo.updateMemberRole).mockResolvedValue({ id: "m1", role: "dev", user: null } as never)
    await svc.changeMemberRole("p1", "m1", "dev")
    await svc.removeMember("p1", "m1")
    expect(repo.updateMemberRole).toHaveBeenCalledWith(TX, "p1", "m1", "dev")
    expect(repo.deleteMember).toHaveBeenCalledWith(TX, "p1", "m1")
  })

  it("does not count POs for non-PO targets or PO→PO", async () => {
    vi.mocked(repo.findMemberRole).mockResolvedValue({ role: "dev" })
    await svc.removeMember("p1", "m2")
    vi.mocked(repo.findMemberRole).mockResolvedValue({ role: "po" })
    vi.mocked(repo.updateMemberRole).mockResolvedValue({ id: "m1", role: "po", user: null } as never)
    await svc.changeMemberRole("p1", "m1", "po")
    expect(repo.countPos).not.toHaveBeenCalled()
  })
})
