/**
 * Activity logging hooks of the smaller domain services (goals, releases,
 * plan, members, icebox, projects). Backlog / sprint / sprint-backlog hooks
 * (which also notify) have their own `*.activity.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("./support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("./support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("./support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("./support")).translationMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
}))
vi.mock("@/lib/api-helpers", () => ({
  saveUploadedFile: vi.fn(),
  deleteUploadedFile: vi.fn(async () => undefined),
  removeProjectUploadDir: vi.fn(async () => true),
}))
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))
vi.mock("@/services/attachments/attachments.service", () => ({ attachTemplate: vi.fn(async () => true) }))
vi.mock("@/services/goals/goals.repository")
vi.mock("@/services/releases/releases.repository")
vi.mock("@/services/plan/plan.repository")
vi.mock("@/services/members/members.repository")
vi.mock("@/services/icebox/icebox.repository")
vi.mock("@/services/projects/projects.repository")

const act = await import("@/services/_shared/activity")
const { ACTOR, TX, DEFAULT_DB } = await import("./support")

const goalsRepo = await import("@/services/goals/goals.repository")
const goals = await import("@/services/goals/goals.service")
const relRepo = await import("@/services/releases/releases.repository")
const releases = await import("@/services/releases/releases.service")
const planRepo = await import("@/services/plan/plan.repository")
const plan = await import("@/services/plan/plan.service")
const memRepo = await import("@/services/members/members.repository")
const members = await import("@/services/members/members.service")
const iceRepo = await import("@/services/icebox/icebox.repository")
const icebox = await import("@/services/icebox/icebox.service")
const projRepo = await import("@/services/projects/projects.repository")
const projects = await import("@/services/projects/projects.service")
const files = await import("@/lib/api-helpers")

const withType = (entityType: string, extra: Record<string, unknown> = {}) =>
  expect.objectContaining({ projectId: "p1", entityType, actor: ACTOR, ...extra })

beforeEach(() => vi.clearAllMocks())

describe("goals", () => {
  it("create / update / delete are logged in the transaction", async () => {
    vi.mocked(goalsRepo.insertGoal).mockResolvedValue({ id: "g1", title: "G" } as never)
    await goals.createGoal("p1", { title: "G" }, ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, withType("goal", { entityId: "g1" }))

    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "g1", title: "G" })
    vi.mocked(goalsRepo.updateGoal).mockResolvedValue({ id: "g1", title: "H" } as never)
    await goals.updateGoal("p1", "g1", { title: "H" }, ACTOR)
    expect(act.logUpdate).toHaveBeenCalledWith(TX, withType("goal", { before: { id: "g1", title: "G" } }))

    await goals.deleteGoal("p1", "g1", ACTOR)
    expect(act.logDelete).toHaveBeenCalledWith(TX, withType("goal", { entityId: "g1" }))
  })
})

describe("releases", () => {
  it("update / delete / import are logged", async () => {
    vi.mocked(relRepo.updateReleaseItem).mockResolvedValue({ id: "r1" } as never)
    await releases.updateReleaseItem("p1", "r1", { status: "released" } as never, ACTOR)
    expect(act.loadSnapshot).toHaveBeenCalledWith(TX, "release", "r1")
    expect(act.logUpdate).toHaveBeenCalledWith(TX, withType("release", { entityId: "r1" }))

    await releases.deleteReleaseItem("p1", "r1", ACTOR)
    expect(act.logDelete).toHaveBeenCalledWith(TX, withType("release", { entityId: "r1" }))

    vi.mocked(relRepo.findPbisForRelease).mockResolvedValue([{ id: "b1" }, { id: "b2" }] as never)
    vi.mocked(relRepo.insertReleaseItem).mockImplementation(((_db: unknown, d: { pbItemId: string }) =>
      Promise.resolve({ id: `r-${d.pbItemId}` })) as never)
    await releases.importReleaseItems("p1", { pbItemIds: ["b1", "b2"], planVersion: "v1" } as never, ACTOR)
    expect(act.logCreate).toHaveBeenCalledTimes(2)
    expect(act.logCreate).toHaveBeenCalledWith(TX, withType("release", { entityId: "r-b2", meta: { pbItemId: "b2" } }))
  })
})

describe("plan", () => {
  it("create / update / delete are logged", async () => {
    const { planRow } = await import("@/services/plan/__tests__/plan-fixtures")
    const row = planRow({ id: "n" })
    vi.mocked(planRepo.nextPlanSortOrder).mockResolvedValue(1)
    vi.mocked(planRepo.insertPlanItem).mockResolvedValue(row as never)
    vi.mocked(planRepo.findPlanItem).mockResolvedValue(row as never)
    vi.mocked(planRepo.countPlanChildren).mockResolvedValue(0)
    vi.mocked(planRepo.findLinkedPbisOfItem).mockResolvedValue([])
    await plan.createPlanItem("p1", { name: "N", plannedStart: "2026-10-01", plannedEnd: "2026-10-02" } as never, ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, withType("plan_item", { entityId: "n" }))

    vi.mocked(planRepo.updatePlanItemVersioned).mockResolvedValue(row as never)
    await plan.updatePlanItem("p1", "n", { name: "M" }, ACTOR)
    expect(act.logUpdate).toHaveBeenCalledWith(TX, withType("plan_item", { entityId: "n" }))

    vi.mocked(planRepo.findPlanTree).mockResolvedValue([{ id: "n", parentId: null }])
    vi.mocked(planRepo.softDeletePlanItems).mockResolvedValue(1)
    await plan.deletePlanItem("p1", "n", ACTOR)
    expect(act.logDelete).toHaveBeenCalledWith(TX, withType("plan_item", { entityId: "n", meta: { trashed: true, subtreeCount: 1 } }))
  })

  it("reorder logs one move per reparented item", async () => {
    vi.mocked(planRepo.findPlanItemsByIds).mockResolvedValue([{ id: "a", parentId: null }, { id: "b", parentId: null }])
    vi.mocked(planRepo.findPlanTree).mockResolvedValue([
      { id: "a", parentId: null },
      { id: "b", parentId: null },
    ])
    await plan.reorderPlan("p1", [{ id: "a", parentId: "b", sortOrder: 0 }, { id: "b", parentId: null, sortOrder: 1 }], ACTOR)
    expect(act.logActivity).toHaveBeenCalledTimes(1)
    expect(act.logActivity).toHaveBeenCalledWith(TX, {
      projectId: "p1",
      entityType: "plan_item",
      entityId: "a",
      action: "move",
      actor: ACTOR,
      diff: { changes: { parentId: { from: null, to: "b" } } },
    })
  })

  it("a pure sort-order reorder logs one project-level move", async () => {
    vi.mocked(planRepo.findPlanItemsByIds).mockResolvedValue([{ id: "a", parentId: null }])
    vi.mocked(planRepo.findPlanTree).mockResolvedValue([{ id: "a", parentId: null }])
    await plan.reorderPlan("p1", [{ id: "a", parentId: null, sortOrder: 3 }], ACTOR)
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({
      entityType: "project",
      entityId: "p1",
      diff: { changes: { planOrder: { changed: true } }, meta: { count: 1 } },
    }))
  })
})

describe("members", () => {
  it("bulk add logs each created membership with the user name", async () => {
    vi.mocked(memRepo.findActiveUserIds).mockResolvedValue([{ id: "a" }])
    vi.mocked(memRepo.findMemberUserIds).mockResolvedValue([])
    vi.mocked(memRepo.findMembersByUserIds).mockResolvedValue([{ id: "m-a", userId: "a", role: "dev", user: { name: "Ann" } }] as never)
    await members.addMembersBulk("p1", ["a"], "dev", ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, withType("member", {
      entityId: "m-a",
      row: { userId: "a", role: "dev" },
      meta: { userName: "Ann" },
    }))
  })

  it("single add logs with the default client (no transaction)", async () => {
    vi.mocked(memRepo.findUserByIdOrEmail).mockResolvedValue({ id: "a", isActive: true })
    vi.mocked(memRepo.findMembership).mockResolvedValue(null)
    vi.mocked(memRepo.insertMember).mockResolvedValue({ id: "m-a", userId: "a", role: "sm", user: { name: "Ann" } } as never)
    await members.addMember("p1", { userId: "a" }, "sm", ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(DEFAULT_DB, withType("member", { entityId: "m-a" }))
  })

  it("role change and removal are logged", async () => {
    vi.mocked(memRepo.findMemberRole).mockResolvedValue({ role: "dev" })
    vi.mocked(memRepo.updateMemberRole).mockResolvedValue({ id: "m1", role: "sm", user: { name: "Bob" } } as never)
    await members.changeMemberRole("p1", "m1", "sm", ACTOR)
    expect(act.logUpdate).toHaveBeenCalledWith(TX, withType("member", { entityId: "m1", meta: { userName: "Bob" } }))
    await members.removeMember("p1", "m1", ACTOR)
    expect(act.logDelete).toHaveBeenCalledWith(TX, withType("member", { entityId: "m1" }))
  })
})

describe("icebox", () => {
  it("create / update are logged in the transaction", async () => {
    vi.mocked(iceRepo.nextIceboxDisplayId).mockResolvedValue(3)
    vi.mocked(iceRepo.insertIceboxItem).mockResolvedValue({ id: "i1", displayId: 3 } as never)
    await icebox.createIceboxItem("p1", { request: "R" } as never, ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, withType("icebox", { entityId: "i1", meta: { displayId: 3 } }))

    vi.mocked(iceRepo.updateIceboxItem).mockResolvedValue({ id: "i1", displayId: 3 } as never)
    await icebox.updateIceboxItem("p1", "i1", { request: "S" } as never, ACTOR)
    expect(act.logUpdate).toHaveBeenCalledWith(TX, withType("icebox", { entityId: "i1", meta: { displayId: 3 } }))
  })

  it("attachment add / remove are logged as updates", async () => {
    vi.mocked(iceRepo.findIceboxItemId).mockResolvedValue({ id: "i1" })
    vi.mocked(files.saveUploadedFile).mockResolvedValueOnce({
      ok: true,
      fileName: "f",
      originalName: "spec.pdf",
      fileSize: 1,
      mimeType: "application/pdf",
    } as never)
    vi.mocked(iceRepo.insertIceboxAttachment).mockResolvedValueOnce({ id: "att" } as never)
    await icebox.uploadIceboxAttachment("p1", "i1", new File(["x"], "spec.pdf"), ACTOR)
    expect(act.logActivity).toHaveBeenCalledWith(DEFAULT_DB, expect.objectContaining({
      entityType: "icebox",
      entityId: "i1",
      action: "update",
      diff: { changes: { attachment: { from: null, to: "spec.pdf" } } },
    }))

    vi.mocked(iceRepo.findIceboxAttachment).mockResolvedValue({ id: "att", fileName: "f", originalName: "spec.pdf" } as never)
    await icebox.deleteIceboxAttachment("p1", "i1", "att", ACTOR)
    expect(act.logActivity).toHaveBeenLastCalledWith(DEFAULT_DB, expect.objectContaining({
      diff: { changes: { attachment: { from: "spec.pdf", to: null } } },
    }))
  })
})

describe("projects", () => {
  it("create / update are logged in the transaction", async () => {
    vi.mocked(projRepo.findCreatorProfile).mockResolvedValue({ language: "ja", role: "admin", sections: [] } as never)
    vi.mocked(projRepo.insertProject).mockResolvedValue({ id: "np", name: "N" } as never)
    await projects.createProject({ name: "N" } as never, ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, expect.objectContaining({ projectId: "np", entityType: "project", entityId: "np" }))

    vi.mocked(projRepo.updateProject).mockResolvedValue({ id: "p1" } as never)
    vi.mocked(projRepo.findExistingSectionIds).mockResolvedValue([{ id: "s" }])
    await projects.updateProject("p1", { name: "M", sectionIds: ["s"] } as never, ACTOR)
    expect(act.logUpdate).toHaveBeenCalledWith(TX, withType("project", { entityId: "p1", meta: { sectionIds: ["s"] } }))
  })
})
