import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../goals.repository"

describe("goals.repository", () => {
  it("findGoals is project-scoped and bounded", async () => {
    const db = fakeDb()
    await repo.findGoals(db.client, "p1")
    expect(db.fn("productGoal.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      orderBy: { createdAt: "asc" },
      take: LIST_LIMITS.productGoals,
    })
  })

  it("insertGoal only writes whitelisted fields with the given projectId", async () => {
    const db = fakeDb()
    await repo.insertGoal(db.client, "p1", { title: "T", description: "D", projectId: "evil" } as never)
    expect(db.fn("productGoal.create")).toHaveBeenCalledWith({ data: { projectId: "p1", title: "T", description: "D" } })
  })

  it("update / delete require the projectId", async () => {
    const db = fakeDb()
    await repo.updateGoal(db.client, "p1", "g1", { title: "x" })
    await repo.deleteGoal(db.client, "p1", "g1")
    expect(db.fn("productGoal.update")).toHaveBeenCalledWith({ where: { id: "g1", projectId: "p1" }, data: { title: "x" } })
    expect(db.fn("productGoal.delete")).toHaveBeenCalledWith({ where: { id: "g1", projectId: "p1" } })
  })
})
