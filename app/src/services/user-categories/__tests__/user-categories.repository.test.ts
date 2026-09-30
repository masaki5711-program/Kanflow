import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../user-categories.repository"

const WITH_ASSIGNMENTS = { assignments: { select: { projectId: true } } }

describe("user-categories.repository (user-scoped)", () => {
  it("findUserCategories only returns the caller's categories", async () => {
    const db = fakeDb()
    await repo.findUserCategories(db.client, "u1")
    expect(db.fn("userProjectCategory.findMany")).toHaveBeenCalledWith({
      where: { userId: "u1" },
      include: WITH_ASSIGNMENTS,
      orderBy: { sortOrder: "asc" },
      take: LIST_LIMITS.userCategories,
    })
  })

  it("name / ownership lookups include the userId", async () => {
    const db = fakeDb()
    await repo.findCategoryByName(db.client, "u1", "Work")
    await repo.findOwnedCategory(db.client, "u1", "c1")
    expect(db.fn("userProjectCategory.findUnique")).toHaveBeenCalledWith({
      where: { userId_name: { userId: "u1", name: "Work" } },
      select: { id: true },
    })
    expect(db.fn("userProjectCategory.findFirst")).toHaveBeenCalledWith({
      where: { id: "c1", userId: "u1" },
      select: { id: true, name: true },
    })
  })

  it("nextCategorySortOrder is per user", async () => {
    const db = fakeDb({ "userProjectCategory.aggregate": { _max: { sortOrder: 2 } } })
    await expect(repo.nextCategorySortOrder(db.client, "u1")).resolves.toBe(3)
    expect(db.fn("userProjectCategory.aggregate")).toHaveBeenCalledWith({ where: { userId: "u1" }, _max: { sortOrder: true } })
    const empty = fakeDb({ "userProjectCategory.aggregate": { _max: { sortOrder: null } } })
    await expect(repo.nextCategorySortOrder(empty.client, "u1")).resolves.toBe(1)
  })

  it("category writes", async () => {
    const db = fakeDb()
    const data = { userId: "u1", name: "n", color: "red", sortOrder: 1 }
    await repo.insertUserCategory(db.client, data)
    await repo.updateUserCategory(db.client, "c1", { name: "m" })
    await repo.deleteUserCategory(db.client, "c1")
    expect(db.fn("userProjectCategory.create")).toHaveBeenCalledWith({ data, include: WITH_ASSIGNMENTS })
    expect(db.fn("userProjectCategory.update")).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "m" }, include: WITH_ASSIGNMENTS })
    expect(db.fn("userProjectCategory.delete")).toHaveBeenCalledWith({ where: { id: "c1" } })
  })

  it("membership check and assignments", async () => {
    const db = fakeDb()
    await repo.findMembership(db.client, "p1", "u1")
    await repo.upsertAssignment(db.client, "c1", "p1")
    await repo.deleteAssignments(db.client, "c1", "p1")
    expect(db.fn("projectMember.findFirst")).toHaveBeenCalledWith({ where: { projectId: "p1", userId: "u1" }, select: { id: true } })
    expect(db.fn("userProjectCategoryAssignment.upsert")).toHaveBeenCalledWith({
      where: { categoryId_projectId: { categoryId: "c1", projectId: "p1" } },
      create: { categoryId: "c1", projectId: "p1" },
      update: {},
    })
    expect(db.fn("userProjectCategoryAssignment.deleteMany")).toHaveBeenCalledWith({ where: { categoryId: "c1", projectId: "p1" } })
  })
})
