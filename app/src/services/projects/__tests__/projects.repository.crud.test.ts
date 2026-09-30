import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../projects.repository"
import { DEFAULT_SURVEILLANCE_SETTINGS, parseStoredSurveillanceSettings } from "@/lib/surveillance-settings"

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

  it("insertProject stores AI surveillance OFF for a new project (condition 3)", async () => {
    const db = fakeDb()
    await repo.insertProject(db.client, { name: "P", description: undefined, projectType: "general", language: "ja", ownerId: "u1", sectionIds: [] })
    const [call] = db.fn("project.create").mock.calls[0]
    const stored = parseStoredSurveillanceSettings(call.data.surveillanceSettings)
    expect(stored.enabled).toBe(false)
    expect(stored).toEqual({ ...DEFAULT_SURVEILLANCE_SETTINGS, enabled: false })
    // Existing projects (column null) keep the old default: enabled.
    expect(parseStoredSurveillanceSettings(null).enabled).toBe(true)
  })

  it("findProjectDetail / update / delete by project id", async () => {
    const db = fakeDb()
    await repo.findProjectDetail(db.client, "p1")
    await repo.updateProject(db.client, "p1", { name: "x" })
    await repo.deleteProject(db.client, "p1")
    const detail = db.fn("project.findUnique").mock.calls[0][0]
    expect(detail.where).toEqual({ id: "p1", deletedAt: null })
    expect(detail.include.members.include.user.select).toEqual({ id: true, name: true, email: true })
    expect(detail.include._count.select.backlogItems).toEqual({ where: { deletedAt: null } })
    expect(detail.include._count.select.iceboxItems).toEqual({ where: { deletedAt: null } })
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

describe("projects.repository trash", () => {
  it("softDeleteProject stamps a live project only", async () => {
    const db = fakeDb({ "project.updateMany": { count: 1 } })
    const now = new Date("2026-10-01T00:00:00Z")
    await expect(repo.softDeleteProject(db.client, "p1", "u1", now)).resolves.toBe(true)
    expect(db.fn("project.updateMany")).toHaveBeenCalledWith({
      where: { id: "p1", deletedAt: null },
      data: { deletedAt: now, deletedById: "u1" },
    })
    const none = fakeDb({ "project.updateMany": { count: 0 } })
    await expect(repo.softDeleteProject(none.client, "p1", "u1")).resolves.toBe(false)
  })

  it("restoreProjectRow clears the columns of a trashed project only", async () => {
    const db = fakeDb({ "project.updateMany": { count: 1 } })
    await expect(repo.restoreProjectRow(db.client, "p1")).resolves.toBe(true)
    expect(db.fn("project.updateMany")).toHaveBeenCalledWith({
      where: { id: "p1", deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    })
  })

  it("deleteTrashedProject deletes only while the project is still trashed", async () => {
    const db = fakeDb({ "project.deleteMany": { count: 1 } })
    await expect(repo.deleteTrashedProject(db.client, "p1")).resolves.toBe(true)
    expect(db.fn("project.deleteMany")).toHaveBeenCalledWith({ where: { id: "p1", deletedAt: { not: null } } })
    const restored = fakeDb({ "project.deleteMany": { count: 0 } })
    await expect(repo.deleteTrashedProject(restored.client, "p1")).resolves.toBe(false)
  })

  it("findTrashedProject / findTrashedProjects see the trash only, newest first", async () => {
    const db = fakeDb({ "project.findMany": [] })
    await repo.findTrashedProject(db.client, "p1")
    await repo.findTrashedProjects(db.client)
    expect(db.fn("project.findFirst").mock.calls[0][0].where).toEqual({ id: "p1", deletedAt: { not: null } })
    const list = db.fn("project.findMany").mock.calls[0][0]
    expect(list.where).toEqual({ deletedAt: { not: null } })
    expect(list.orderBy).toEqual({ deletedAt: "desc" })
    expect(list.select._count.select.backlogItems).toEqual({ where: { deletedAt: null } })
  })

  it("findExpiredTrashedProjects selects projects trashed before the cutoff", async () => {
    const db = fakeDb({ "project.findMany": [] })
    const cutoff = new Date("2026-09-01T00:00:00Z")
    await repo.findExpiredTrashedProjects(db.client, cutoff, 5)
    expect(db.fn("project.findMany")).toHaveBeenCalledWith({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { deletedAt: "asc" },
      take: 5,
    })
  })
})
