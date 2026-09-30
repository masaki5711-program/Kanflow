import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../users.repository"

function selectKeys(call: { select: Record<string, unknown> }): string[] {
  return Object.keys(call.select)
}

describe("users.repository", () => {
  it("no admin / profile read ever selects the password hash", async () => {
    const db = fakeDb()
    await repo.findUsersForAdmin(db.client)
    await repo.findUserForAdmin(db.client, "u1")
    await repo.findProfile(db.client, "u1")
    const [list] = db.fn("user.findMany").mock.calls[0]
    expect(selectKeys(list)).not.toContain("password")
    expect(list.take).toBe(LIST_LIMITS.users)
    expect(list.orderBy).toEqual({ createdAt: "desc" })
    for (const [arg] of db.fn("user.findUnique").mock.calls) expect(selectKeys(arg)).not.toContain("password")
    expect(repo.PROFILE_SELECT).not.toHaveProperty("password")
  })

  it("findUserWith excludes the given id only when provided", async () => {
    const db = fakeDb()
    await repo.findUserWith(db.client, { email: "a@b.c" }, "u1")
    await repo.findUserWith(db.client, { employeeNumber: "E1" })
    expect(db.fn("user.findFirst")).toHaveBeenNthCalledWith(1, {
      where: { email: "a@b.c", NOT: { id: "u1" } },
      select: { id: true },
    })
    expect(db.fn("user.findFirst")).toHaveBeenNthCalledWith(2, { where: { employeeNumber: "E1" }, select: { id: true } })
  })

  it("insertUser / updateUser do not return the password", async () => {
    const db = fakeDb()
    await repo.insertUser(db.client, { name: "n", email: "e", password: "h" } as never)
    await repo.updateUser(db.client, "u1", { name: "m" })
    expect(selectKeys(db.fn("user.create").mock.calls[0][0])).not.toContain("password")
    expect(db.fn("user.update")).toHaveBeenCalledWith({ where: { id: "u1" }, data: { name: "m" }, select: { id: true } })
  })

  it("replaceUserSections deletes then recreates (skips create when empty)", async () => {
    const db = fakeDb()
    await repo.replaceUserSections(db.client, "u1", ["s1", "s2"])
    expect(db.fn("userSection.deleteMany")).toHaveBeenCalledWith({ where: { userId: "u1" } })
    expect(db.fn("userSection.createMany")).toHaveBeenCalledWith({
      data: [{ userId: "u1", sectionId: "s1" }, { userId: "u1", sectionId: "s2" }],
    })
    const empty = fakeDb()
    await repo.replaceUserSections(empty.client, "u1", [])
    expect(empty.fn("userSection.deleteMany")).toHaveBeenCalled()
    expect(empty.fn("userSection.createMany")).not.toHaveBeenCalled()
  })

  it("password helpers", async () => {
    const db = fakeDb({ "user.findUnique": { password: "hash" } })
    await repo.setPassword(db.client, "u1", "newhash")
    await expect(repo.findPasswordHash(db.client, "u1")).resolves.toEqual({ password: "hash" })
    expect(db.fn("user.update")).toHaveBeenCalledWith({ where: { id: "u1" }, data: { password: "newhash" }, select: { id: true } })
    expect(db.fn("user.findUnique")).toHaveBeenCalledWith({ where: { id: "u1" }, select: { password: true } })
  })

  it("profile / language", async () => {
    const db = fakeDb()
    await repo.updateProfile(db.client, "u1", { name: "x" })
    await repo.findLanguage(db.client, "u1")
    await repo.setLanguage(db.client, "u1", "id")
    expect(db.fn("user.update")).toHaveBeenNthCalledWith(1, { where: { id: "u1" }, data: { name: "x" }, select: repo.PROFILE_SELECT })
    expect(db.fn("user.findUnique")).toHaveBeenCalledWith({ where: { id: "u1" }, select: { language: true } })
    expect(db.fn("user.update")).toHaveBeenNthCalledWith(2, { where: { id: "u1" }, data: { language: "id" }, select: { language: true } })
  })

  it("searchActiveUsers only matches active users and optionally flags memberships", async () => {
    const db = fakeDb()
    await repo.searchActiveUsers(db.client, "yam", "p1")
    await repo.searchActiveUsers(db.client, "yam", undefined)
    const [withProject] = db.fn("user.findMany").mock.calls[0]
    const [without] = db.fn("user.findMany").mock.calls[1]
    expect(withProject.where.isActive).toBe(true)
    expect(withProject.where.OR).toEqual([
      { name: { contains: "yam" } },
      { email: { contains: "yam" } },
      { employeeNumber: { contains: "yam" } },
      { department: { contains: "yam" } },
    ])
    expect(withProject.take).toBe(LIST_LIMITS.userSearch)
    expect(withProject.select.memberships).toEqual({ where: { projectId: "p1" }, select: { id: true } })
    expect(without.select.memberships).toBe(false)
    expect(selectKeys(withProject)).not.toContain("password")
  })
})
