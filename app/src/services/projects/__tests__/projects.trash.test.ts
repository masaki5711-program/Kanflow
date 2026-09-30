import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/attachments/attachments.service", () => ({ attachTemplate: vi.fn(async () => true) }))
vi.mock("../projects.repository")
vi.mock("@/lib/api-helpers", () => ({ removeProjectUploadDir: vi.fn(async () => true) }))
const logSpies = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => logSpies } }))

const repo = await import("../projects.repository")
const tr = await import("@/services/_shared/translations")
const activity = await import("@/services/_shared/activity")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const { removeProjectUploadDir } = await import("@/lib/api-helpers")
const svc = await import("../projects.service")

const TRASHED = { id: "p1", name: "P" }

describe("projects trash", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(removeProjectUploadDir).mockResolvedValue(true)
    vi.mocked(repo.restoreProjectRow).mockResolvedValue(true)
    vi.mocked(repo.deleteTrashedProject).mockResolvedValue(true)
  })

  it("deleteProject moves the project to the trash and touches neither translations nor files", async () => {
    vi.mocked(repo.softDeleteProject).mockResolvedValue(true)
    await svc.deleteProject("p1", ACTOR)
    expect(repo.softDeleteProject).toHaveBeenCalledWith(TX, "p1", ACTOR.userId)
    expect(repo.deleteTrashedProject).not.toHaveBeenCalled()
    expect(tr.purgeIn).not.toHaveBeenCalled()
    expect(removeProjectUploadDir).not.toHaveBeenCalled()
    expect(activity.logActivity).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ projectId: "p1", entityType: "project", action: "delete", actor: ACTOR })
    )
  })

  it("deleteProject 404s when the project is missing or already trashed", async () => {
    vi.mocked(repo.softDeleteProject).mockResolvedValue(false)
    await expect(svc.deleteProject("p1", ACTOR)).rejects.toMatchObject({ status: 404 })
  })

  it("restoreProject takes a trashed project out of the trash", async () => {
    vi.mocked(repo.findTrashedProject).mockResolvedValue(TRASHED)
    await svc.restoreProject("p1", ACTOR)
    expect(repo.restoreProjectRow).toHaveBeenCalledWith(TX, "p1")
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ action: "restore", entityType: "project" }))
  })

  it("restoreProject 404s for a project that is not in the trash", async () => {
    vi.mocked(repo.findTrashedProject).mockResolvedValue(null)
    await expect(svc.restoreProject("p1", ACTOR)).rejects.toMatchObject({ status: 404 })
    expect(repo.restoreProjectRow).not.toHaveBeenCalled()
  })

  it("purgeProject purges the translations of every cascaded child in the same tx", async () => {
    vi.mocked(repo.findTrashedProject).mockResolvedValue(TRASHED)
    const tree = { project: ["p1"], sprint: ["s1"], sprint_task: ["t1"] }
    vi.mocked(repo.collectProjectTranslationTree).mockResolvedValue(tree)
    await svc.purgeProject("p1")
    expect(repo.collectProjectTranslationTree).toHaveBeenCalledWith(TX, "p1")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, tree)
    expect(repo.deleteTrashedProject).toHaveBeenCalledWith(TX, "p1")
  })

  it("purgeProject refuses a live project (404) and deletes nothing", async () => {
    vi.mocked(repo.findTrashedProject).mockResolvedValue(null)
    await expect(svc.purgeProject("p1")).rejects.toMatchObject({ status: 404 })
    expect(repo.deleteTrashedProject).not.toHaveBeenCalled()
    expect(removeProjectUploadDir).not.toHaveBeenCalled()
  })

  it("purgeProject removes the upload dir only after the DB delete committed", async () => {
    vi.mocked(repo.findTrashedProject).mockResolvedValue(TRASHED)
    vi.mocked(repo.collectProjectTranslationTree).mockResolvedValue({ project: ["p1"] })
    const order: string[] = []
    vi.mocked(repo.deleteTrashedProject).mockImplementation(async () => {
      order.push("db")
      return true
    })
    vi.mocked(removeProjectUploadDir).mockImplementation(async () => {
      order.push("fs")
      return true
    })
    await svc.purgeProject("p1")
    expect(removeProjectUploadDir).toHaveBeenCalledWith("p1")
    expect(order).toEqual(["db", "fs"])
  })

  it("purgeProject leaves files alone when the DB delete fails", async () => {
    vi.mocked(repo.findTrashedProject).mockResolvedValue(TRASHED)
    vi.mocked(repo.collectProjectTranslationTree).mockResolvedValue({ project: ["p1"] })
    vi.mocked(repo.deleteTrashedProject).mockRejectedValue(new Error("db down"))
    await expect(svc.purgeProject("p1")).rejects.toThrow("db down")
    expect(removeProjectUploadDir).not.toHaveBeenCalled()
  })

  it("purgeProject still succeeds when removing the upload dir fails (logged)", async () => {
    vi.mocked(repo.findTrashedProject).mockResolvedValue(TRASHED)
    vi.mocked(repo.collectProjectTranslationTree).mockResolvedValue({ project: ["p1"] })
    vi.mocked(removeProjectUploadDir).mockRejectedValue(new Error("EBUSY"))
    await expect(svc.purgeProject("p1")).resolves.toBeUndefined()
    expect(logSpies.error).toHaveBeenCalledWith("project upload dir removal failed", { projectId: "p1", error: "EBUSY" })
  })

  describe("restore vs purge race (P-07)", () => {
    it("restore 404s when a concurrent purge deleted the row first (no false success)", async () => {
      vi.mocked(repo.findTrashedProject).mockResolvedValue(TRASHED)
      vi.mocked(repo.restoreProjectRow).mockResolvedValue(false)
      await expect(svc.restoreProject("p1", ACTOR)).rejects.toMatchObject({ status: 404 })
      expect(activity.logActivity).not.toHaveBeenCalled()
    })

    it("purge 404s (and rolls back) when a concurrent restore took the project out of the trash", async () => {
      vi.mocked(repo.findTrashedProject).mockResolvedValue(TRASHED)
      vi.mocked(repo.collectProjectTranslationTree).mockResolvedValue({ project: ["p1"] })
      vi.mocked(repo.deleteTrashedProject).mockResolvedValue(false)
      await expect(svc.purgeProject("p1")).rejects.toMatchObject({ status: 404 })
      expect(removeProjectUploadDir).not.toHaveBeenCalled()
    })
  })
})
