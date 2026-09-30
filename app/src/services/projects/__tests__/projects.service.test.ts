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
const { attachTemplate } = await import("@/services/attachments/attachments.service")
const { ACTOR, TX, DEFAULT_DB, touchedTranslationFields } = await import("@/services/__tests__/support")
const { removeProjectUploadDir } = await import("@/lib/api-helpers")
const svc = await import("../projects.service")
const { projectUpdateDenial } = await import("../projects.policy")

const actorOf = (projectRole: string | null, systemRole = "member") => ({
  userId: "u1",
  systemRole,
  projectRole,
  isSectionManagerOfProject: false,
})

describe("projects.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("resolves sections: admin picks, others inherit", () => {
    const creator = { role: "member", sections: [{ sectionId: "s1" }, { sectionId: "s2" }] }
    expect(svc.resolveNewProjectSections(creator, ["x"])).toEqual(["s1", "s2"])
    expect(svc.resolveNewProjectSections({ role: "admin", sections: [] }, ["x"])).toEqual(["x"])
    expect(svc.resolveNewProjectSections({ role: "admin", sections: [] }, undefined)).toEqual([])
    expect(svc.resolveNewProjectSections(null, ["x"])).toEqual([])
  })

  it("creates a project with the creator as PO, enqueues in tx, then seeds the template", async () => {
    vi.mocked(repo.findCreatorProfile).mockResolvedValue({ language: "id", role: "member", sections: [{ sectionId: "s1" }] })
    vi.mocked(repo.findExistingSectionIds).mockResolvedValue([{ id: "s1" }])
    const project = { id: "p1", name: "N" }
    vi.mocked(repo.insertProject).mockResolvedValue(project as never)
    const out = await svc.createProject({ name: "N" }, ACTOR)
    expect(out).toBe(project)
    expect(repo.insertProject).toHaveBeenCalledWith(TX, {
      name: "N",
      description: undefined,
      projectType: "software",
      language: "id",
      ownerId: "u1",
      sectionIds: ["s1"],
    })
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "project", "p1", project)
    expect(attachTemplate).toHaveBeenCalledWith("p1", svc.PRODUCT_GOAL_TEMPLATE, "Alice")
  })

  it("getProject flattens sections and adds i18n + access hint", async () => {
    vi.mocked(repo.findProjectDetail).mockResolvedValue({
      id: "p1",
      productGoals: [{ id: "g1" }],
      sections: [{ section: { id: "s1", name: "S" } }],
    } as never)
    const out = await svc.getProject("p1", "member")
    expect(out).toMatchObject({
      sections: [{ id: "s1", name: "S" }],
      productGoals: [{ id: "g1", i18n: {} }],
      i18n: {},
      _accessVia: "member",
    })
  })

  it("getProject throws NotFound", async () => {
    vi.mocked(repo.findProjectDetail).mockResolvedValue(null)
    await expect(svc.getProject("p1", "admin")).rejects.toMatchObject({ status: 404 })
  })

  it("updateProject replaces sections only when given", async () => {
    vi.mocked(repo.updateProject).mockResolvedValue({ id: "p1" } as never)
    await svc.updateProject("p1", { name: "X" }, ACTOR)
    expect(repo.replaceProjectSections).not.toHaveBeenCalled()
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "project", "p1", { name: "X" })
    vi.mocked(repo.findExistingSectionIds).mockResolvedValue([{ id: "a" }])
    await svc.updateProject("p1", { sectionIds: ["a", "a"] }, ACTOR)
    expect(repo.updateProject).toHaveBeenLastCalledWith(TX, "p1", {})
    expect(repo.findExistingSectionIds).toHaveBeenCalledWith(TX, ["a"])
    expect(repo.replaceProjectSections).toHaveBeenCalledWith(TX, "p1", ["a"])
  })

  it("updateProject rejects unknown section ids (400, no replace)", async () => {
    vi.mocked(repo.updateProject).mockResolvedValue({ id: "p1" } as never)
    vi.mocked(repo.findExistingSectionIds).mockResolvedValue([{ id: "a" }])
    await expect(svc.updateProject("p1", { sectionIds: ["a", "ghost"] }, ACTOR))
      .rejects.toMatchObject({ status: 400, code: "SECTION_NOT_FOUND" })
    expect(repo.replaceProjectSections).not.toHaveBeenCalled()
  })

  it("assertSectionsExist skips the lookup for an empty list", async () => {
    await expect(svc.assertSectionsExist(TX as never, [])).resolves.toEqual([])
    expect(repo.findExistingSectionIds).not.toHaveBeenCalled()
  })

  // deleteProject (trash) / restoreProject / purgeProject: see projects.trash.test.ts

  it("cleanupProjectUploads logs an unsafe id instead of removing anything", async () => {
    vi.mocked(removeProjectUploadDir).mockResolvedValue(false)
    await svc.cleanupProjectUploads("..")
    expect(logSpies.warn).toHaveBeenCalledWith("project upload dir skipped: unsafe path", { projectId: ".." })
  })

  it("favorites are idempotent", async () => {
    await svc.favoriteProject("u1", "p1")
    await svc.unfavoriteProject("u1", "p1")
    expect(repo.upsertFavorite).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1")
    expect(repo.deleteFavorites).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1")
  })
})

describe("projectUpdateDenial", () => {
  it("lets any member change only the card color", () => {
    expect(projectUpdateDenial(actorOf("dev"), { cardColor: "red" })).toBeNull()
    expect(projectUpdateDenial(actorOf("dev"), { name: "x" })?.message).toBe("権限がありません")
  })

  it("restricts progress and sections to PO / admin", () => {
    expect(projectUpdateDenial(actorOf("sm"), { progressPct: 10 })?.status).toBe(403)
    expect(projectUpdateDenial(actorOf("sm"), { sectionIds: [] })?.status).toBe(403)
    expect(projectUpdateDenial(actorOf("po"), { progressPct: 10, sectionIds: [] })).toBeNull()
    expect(projectUpdateDenial(actorOf(null, "admin"), { progressPct: 1 })).toBeNull()
  })
})

describe("A3-02: partial updates keep translations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("a non-text update (text keys undefined) touches no FieldTranslation row", async () => {
    vi.mocked(repo.updateProject).mockResolvedValue({ id: "p1" } as never)
    await svc.updateProject("p1", { status: "active", name: undefined, description: undefined } as never, ACTOR)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual([])
  })
})
