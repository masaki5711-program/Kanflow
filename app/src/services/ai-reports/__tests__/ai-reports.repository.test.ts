import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../ai-reports.repository"

describe("ai-reports.repository", () => {
  it("findLatestReports is project-scoped, newest first, bounded", async () => {
    const db = fakeDb()
    await repo.findLatestReports(db.client, "p1")
    const arg = db.fn("aiReport.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1" })
    expect(arg.orderBy).toEqual({ createdAt: "desc" })
    expect(arg.take).toBe(LIST_LIMITS.aiReports)
    expect(arg.select).not.toHaveProperty("meta")
  })

  it("insertReport returns only the id", async () => {
    const db = fakeDb({ "aiReport.create": { id: "r1" } })
    const data = { projectId: "p1", trigger: "manual" } as never
    await expect(repo.insertReport(db.client, data)).resolves.toEqual({ id: "r1" })
    expect(db.fn("aiReport.create")).toHaveBeenCalledWith({ data, select: { id: true } })
  })

  it("deleteOtherReports keeps the new one and stays inside the project + trigger", async () => {
    const db = fakeDb()
    await repo.deleteOtherReports(db.client, "p1", "surveillance", "r1")
    expect(db.fn("aiReport.deleteMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", trigger: "surveillance", id: { not: "r1" } },
    })
  })
})
