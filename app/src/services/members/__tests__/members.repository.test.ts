import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../members.repository"

const USER_SELECT = { id: true, name: true, email: true, employeeNumber: true, department: true }

describe("members.repository", () => {
  it("findMembers is project-scoped and never selects the password", async () => {
    const db = fakeDb()
    await repo.findMembers(db.client, "p1")
    expect(db.fn("projectMember.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      include: { user: { select: USER_SELECT } },
      orderBy: { joinedAt: "asc" },
      take: LIST_LIMITS.projectMembers,
    })
  })

  it("findActiveUserIds only returns active users and copies the id list", async () => {
    const db = fakeDb()
    const ids = Object.freeze(["u1", "u2"])
    await repo.findActiveUserIds(db.client, ids)
    const arg = db.fn("user.findMany").mock.calls[0][0]
    expect(arg).toEqual({ where: { id: { in: ["u1", "u2"] }, isActive: true }, select: { id: true } })
    expect(arg.where.id.in).not.toBe(ids)
  })

  it("member-by-user lookups are project-scoped", async () => {
    const db = fakeDb()
    await repo.findMemberUserIds(db.client, "p1", ["u1"])
    await repo.findMembersByUserIds(db.client, "p1", ["u1"])
    expect(db.fn("projectMember.findMany")).toHaveBeenNthCalledWith(1, {
      where: { projectId: "p1", userId: { in: ["u1"] } },
      select: { userId: true },
    })
    expect(db.fn("projectMember.findMany")).toHaveBeenNthCalledWith(2, {
      where: { projectId: "p1", userId: { in: ["u1"] } },
      include: { user: { select: USER_SELECT } },
    })
  })

  it("insertMembers builds one row per user with the role", async () => {
    const db = fakeDb()
    await repo.insertMembers(db.client, "p1", ["u1", "u2"], "dev")
    expect(db.fn("projectMember.createMany")).toHaveBeenCalledWith({
      data: [
        { projectId: "p1", userId: "u1", role: "dev" },
        { projectId: "p1", userId: "u2", role: "dev" },
      ],
    })
  })

  it("findUserByIdOrEmail prefers the id", async () => {
    const db = fakeDb()
    await repo.findUserByIdOrEmail(db.client, { userId: "u1", email: "a@b.c" })
    await repo.findUserByIdOrEmail(db.client, { email: "a@b.c" })
    await repo.findUserByIdOrEmail(db.client, {})
    const select = { id: true, isActive: true }
    expect(db.fn("user.findUnique")).toHaveBeenNthCalledWith(1, { where: { id: "u1" }, select })
    expect(db.fn("user.findUnique")).toHaveBeenNthCalledWith(2, { where: { email: "a@b.c" }, select })
    expect(db.fn("user.findUnique")).toHaveBeenNthCalledWith(3, { where: { email: "" }, select })
  })

  it("membership / role / PO count are project-scoped", async () => {
    const db = fakeDb({ "projectMember.count": 2 })
    await repo.findMembership(db.client, "p1", "u1")
    await repo.findMemberRole(db.client, "p1", "m1")
    await expect(repo.countPos(db.client, "p1")).resolves.toBe(2)
    expect(db.fn("projectMember.findFirst")).toHaveBeenNthCalledWith(1, { where: { projectId: "p1", userId: "u1" }, select: { id: true } })
    expect(db.fn("projectMember.findFirst")).toHaveBeenNthCalledWith(2, { where: { id: "m1", projectId: "p1" }, select: { role: true } })
    expect(db.fn("projectMember.count")).toHaveBeenCalledWith({ where: { projectId: "p1", role: "po" } })
  })

  it("insert / update role / delete", async () => {
    const db = fakeDb()
    await repo.insertMember(db.client, "p1", "u1", "sm")
    await repo.updateMemberRole(db.client, "p1", "m1", "po")
    await repo.deleteMember(db.client, "p1", "m1")
    expect(db.fn("projectMember.create")).toHaveBeenCalledWith({
      data: { projectId: "p1", userId: "u1", role: "sm" },
      include: { user: { select: USER_SELECT } },
    })
    expect(db.fn("projectMember.update")).toHaveBeenCalledWith({
      where: { id: "m1", projectId: "p1" },
      data: { role: "po" },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    expect(db.fn("projectMember.delete")).toHaveBeenCalledWith({ where: { id: "m1", projectId: "p1" } })
  })
})
