import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../projects.repository"

describe("projects.repository CRUD", () => {
  it("findCreatorProfile selects language, role and sections", async () => {
    const db = fakeDb()
    await repo.findCreatorProfile(db.client, "u1")
    expect(db.fn("user.findUnique")).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: {
        language: true,
        role: true,
        sections: { select: { sectionId: true }, orderBy: { assignedAt: "asc" } },
      },
    })
  })

  it("insertProject makes the creator the first PO and links sections", async () => {
    const db = fakeDb()
    const base = { name: "P", description: "d", projectType: "general", language: "ja", ownerId: "u1" }
    await repo.insertProject(db.client, { ...base, sectionIds: ["s1"] })
    await repo.insertProject(db.client, { ...base, sectionIds: [] })
    const [withSections] = db.fn("project.create").mock.calls[0]
    const [noSections] = db.fn("project.create").mock.calls[1]
    expect(withSections.data.members).toEqual({ create: { userId: "u1", role: "po" } })
    expect(withSections.data.sections).toEqual({ create: [{ sectionId: "s1" }] })
    expect(noSections.data.sections).toBeUndefined()
    expect(noSections.data).toMatchObject({ name: "P", description: "d", projectType: "general", language: "ja" })
  })

  it("findProjectDetail / update / delete by project id", async () => {
    const db = fakeDb()
    await repo.findProjectDetail(db.client, "p1")
    await repo.updateProject(db.client, "p1", { name: "x" })
    await repo.deleteProject(db.client, "p1")
    const detail = db.fn("project.findUnique").mock.calls[0][0]
    expect(detail.where).toEqual({ id: "p1" })
    expect(detail.include.members.include.user.select).toEqual({ id: true, name: true, email: true })
    expect(db.fn("project.update")).toHaveBeenCalledWith({ where: { id: "p1" }, data: { name: "x" } })
    expect(db.fn("project.delete")).toHaveBeenCalledWith({ where: { id: "p1" } })
  })

  it("replaceProjectSections deletes then recreates; skips create when empty", async () => {
    const db = fakeDb()
    await repo.replaceProjectSections(db.client, "p1", ["s1", "s2"])
    expect(db.fn("projectSection.deleteMany")).toHaveBeenCalledWith({ where: { projectId: "p1" } })
    expect(db.fn("projectSection.createMany")).toHaveBeenCalledWith({
      data: [{ projectId: "p1", sectionId: "s1" }, { projectId: "p1", sectionId: "s2" }],
    })
    const empty = fakeDb()
    await repo.replaceProjectSections(empty.client, "p1", [])
    expect(empty.fn("projectSection.createMany")).not.toHaveBeenCalled()
  })

  it("favorites are keyed by (userId, projectId)", async () => {
    const db = fakeDb()
    await repo.upsertFavorite(db.client, "u1", "p1")
    await repo.deleteFavorites(db.client, "u1", "p1")
    expect(db.fn("userProjectFavorite.upsert")).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "u1", projectId: "p1" } },
      create: { userId: "u1", projectId: "p1" },
      update: {},
    })
    expect(db.fn("userProjectFavorite.deleteMany")).toHaveBeenCalledWith({ where: { userId: "u1", projectId: "p1" } })
  })
})
