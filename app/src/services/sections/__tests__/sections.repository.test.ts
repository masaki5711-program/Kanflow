import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../sections.repository"

const ORDER = [{ sortOrder: "asc" }, { name: "asc" }]

describe("sections.repository", () => {
  it("lists are ordered and bounded", async () => {
    const db = fakeDb()
    await repo.findSectionsWithCounts(db.client)
    await repo.findSectionOptions(db.client)
    expect(db.fn("section.findMany")).toHaveBeenNthCalledWith(1, {
      orderBy: ORDER,
      include: { _count: { select: { users: true, projects: true, categories: true } } },
      take: LIST_LIMITS.sections,
    })
    expect(db.fn("section.findMany")).toHaveBeenNthCalledWith(2, {
      orderBy: ORDER,
      select: { id: true, name: true },
      take: LIST_LIMITS.sections,
    })
  })

  it("writes", async () => {
    const db = fakeDb()
    await repo.insertSection(db.client, { name: "n", description: null, sortOrder: 1 })
    await repo.updateSection(db.client, "s1", { name: "m" })
    await repo.deleteSection(db.client, "s1")
    expect(db.fn("section.create")).toHaveBeenCalledWith({ data: { name: "n", description: null, sortOrder: 1 } })
    expect(db.fn("section.update")).toHaveBeenCalledWith({ where: { id: "s1" }, data: { name: "m" } })
    expect(db.fn("section.delete")).toHaveBeenCalledWith({ where: { id: "s1" } })
  })
})
