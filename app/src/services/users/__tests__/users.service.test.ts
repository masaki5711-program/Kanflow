import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (p: string) => `hash(${p})`),
    compare: vi.fn(async (p: string, h: string) => h === `hash(${p})`),
  },
}))
vi.mock("../users.repository")

const repo = await import("../users.repository")
const { TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const users = await import("../users.service")
const account = await import("../account.service")
const { normalizeOptional } = await import("../users.schemas")

const section = { section: { id: "s1", name: "S" } }

describe("users.service (admin)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("normalizes optional text", () => {
    expect(normalizeOptional(undefined)).toBeUndefined()
    expect(normalizeOptional(null)).toBeNull()
    expect(normalizeOptional("  ")).toBeNull()
    expect(normalizeOptional(" a ")).toBe("a")
  })

  it("lists users with flattened sections", async () => {
    vi.mocked(repo.findUsersForAdmin).mockResolvedValue([{ id: "u", sections: [section] }] as never)
    expect(await users.listUsers()).toEqual([{ id: "u", sections: [{ id: "s1", name: "S" }] }])
  })

  it("rejects duplicate email / employee number on create", async () => {
    const input = { name: "N", email: "a@b.c", password: "secret1", role: "member" as const, employeeNumber: " E1 " }
    vi.mocked(repo.findUserWith).mockResolvedValueOnce({ id: "x" })
    await expect(users.createUser(input)).rejects.toThrow("メールアドレス")
    vi.mocked(repo.findUserWith).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "x" })
    await expect(users.createUser(input)).rejects.toThrow("従業員番号")
    expect(repo.findUserWith).toHaveBeenLastCalledWith(DEFAULT_DB, { employeeNumber: "E1" })
  })

  it("creates with a hashed password and section links", async () => {
    vi.mocked(repo.findUserWith).mockResolvedValue(null)
    vi.mocked(repo.insertUser).mockResolvedValue({ id: "u", sections: [section] } as never)
    const out = await users.createUser({ name: "N", email: "a@b.c", password: "secret1", role: "admin", sectionIds: ["s1"] })
    expect(repo.insertUser).toHaveBeenCalledWith(DEFAULT_DB, expect.objectContaining({
      password: "hash(secret1)",
      employeeNumber: null,
      sections: { create: [{ section: { connect: { id: "s1" } } }] },
    }))
    expect(out.sections).toEqual([{ id: "s1", name: "S" }])
  })

  it("prevents admins from locking themselves out", () => {
    expect(users.selfLockoutError("a", "a", { isActive: false })?.status).toBe(400)
    expect(users.selfLockoutError("a", "a", { role: "member" })?.message).toContain("管理者権限")
    expect(users.selfLockoutError("a", "a", { role: "admin" })).toBeNull()
    expect(users.selfLockoutError("a", "b", { isActive: false })).toBeNull()
  })

  it("updates fields and sections in one tx, then returns the fresh row", async () => {
    vi.mocked(repo.findUserWith).mockResolvedValue(null)
    vi.mocked(repo.findUserForAdmin).mockResolvedValue({ id: "u2", sections: [section] } as never)
    const out = await users.updateUser("a", "u2", { name: "N", department: " ", sectionIds: [] })
    expect(repo.updateUser).toHaveBeenCalledWith(TX, "u2", { name: "N", department: null })
    expect(repo.replaceUserSections).toHaveBeenCalledWith(TX, "u2", [])
    expect(out).toEqual({ id: "u2", sections: [{ id: "s1", name: "S" }] })
  })

  it("update rejects taken email and self lockout", async () => {
    await expect(users.updateUser("a", "a", { isActive: false })).rejects.toMatchObject({ status: 400 })
    vi.mocked(repo.findUserWith).mockResolvedValueOnce({ id: "x" })
    await expect(users.updateUser("a", "u2", { email: "t@x.y" })).rejects.toMatchObject({ status: 409 })
    vi.mocked(repo.findUserWith).mockResolvedValueOnce({ id: "x" })
    await expect(users.updateUser("a", "u2", { employeeNumber: "E" })).rejects.toMatchObject({ status: 409 })
  })

  it("resets passwords with a hash", async () => {
    await users.resetPassword("u2", "newpass")
    expect(repo.setPassword).toHaveBeenCalledWith(DEFAULT_DB, "u2", "hash(newpass)")
  })
})

describe("account.service (self)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("profile get 404s, update checks employee number uniqueness", async () => {
    vi.mocked(repo.findProfile).mockResolvedValueOnce(null)
    await expect(account.getProfile("u")).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findUserWith).mockResolvedValueOnce({ id: "x" })
    await expect(account.updateProfile("u", { employeeNumber: "E" })).rejects.toMatchObject({ status: 409 })
    vi.mocked(repo.findUserWith).mockResolvedValueOnce(null)
    await account.updateProfile("u", { name: "N", employeeNumber: "E", department: "" })
    expect(repo.updateProfile).toHaveBeenCalledWith(DEFAULT_DB, "u", { name: "N", employeeNumber: "E", department: null })
  })

  it("language defaults to ja", async () => {
    vi.mocked(repo.findLanguage).mockResolvedValueOnce(null)
    expect(await account.getLanguage("u")).toEqual({ language: "ja" })
    await account.setLanguage("u", "id")
    expect(repo.setLanguage).toHaveBeenCalledWith(DEFAULT_DB, "u", "id")
  })

  it("password change verifies the current password", async () => {
    vi.mocked(repo.findPasswordHash).mockResolvedValueOnce(null)
    await expect(account.changePassword("u", "a", "b")).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findPasswordHash).mockResolvedValue({ password: "hash(old)" })
    expect(await account.changePassword("u", "wrong", "newpass")).toBe("wrong_password")
    expect(repo.setPassword).not.toHaveBeenCalled()
    expect(await account.changePassword("u", "old", "newpass")).toBe("ok")
    expect(repo.setPassword).toHaveBeenCalledWith(DEFAULT_DB, "u", "hash(newpass)")
  })

  it("search returns [] for empty queries and flags members", async () => {
    expect(await account.searchUsers("", undefined)).toEqual([])
    vi.mocked(repo.searchActiveUsers).mockResolvedValue([
      { id: "a", name: "A", email: "e", employeeNumber: null, department: null, memberships: [{ id: "m" }] },
    ] as never)
    expect((await account.searchUsers("A", "p1"))[0].isMember).toBe(true)
    expect((await account.searchUsers("A", undefined))[0].isMember).toBe(false)
  })
})
