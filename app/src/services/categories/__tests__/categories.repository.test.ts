import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../categories.repository"
import { parseSectionFilter } from "../categories.schemas"

describe("categories.repository", () => {
  it.each([
    [{ kind: "all" } as const, {}],
    [{ kind: "global" } as const, { sectionId: null }],
    [{ kind: "section", sectionId: "s1" } as const, { sectionId: "s1" }],
  ])("findAdminCategories filter %j -> where %j", async (filter, where) => {
    const db = fakeDb()
    await repo.findAdminCategories(db.client, filter)
    const arg = db.fn("adminCategory.findMany").mock.calls[0][0]
    expect(arg.where).toEqual(where)
    expect(arg.take).toBe(LIST_LIMITS.adminCategories)
    expect(arg.orderBy).toEqual([{ sectionId: "asc" }, { sortOrder: "asc" }, { name: "asc" }])
  })

  it("writes", async () => {
    const db = fakeDb()
    const data = { name: "n", color: "red", sortOrder: 0, sectionId: null }
    await repo.insertAdminCategory(db.client, data)
    await repo.updateAdminCategory(db.client, "c1", { name: "m" })
    await repo.deleteAdminCategory(db.client, "c1")
    expect(db.fn("adminCategory.create")).toHaveBeenCalledWith({ data })
    expect(db.fn("adminCategory.update")).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "m" } })
    expect(db.fn("adminCategory.delete")).toHaveBeenCalledWith({ where: { id: "c1" } })
  })
})

describe("parseSectionFilter", () => {
  it("absent -> all, empty -> global, value -> that section", () => {
    expect(parseSectionFilter(null)).toEqual({ kind: "all" })
    expect(parseSectionFilter("")).toEqual({ kind: "global" })
    expect(parseSectionFilter("s1")).toEqual({ kind: "section", sectionId: "s1" })
  })
})
