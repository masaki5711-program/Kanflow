/**
 * PBI ↔ master-plan link from the backlog side: PATCH planItemId, list
 * filter, DTO `planItem`, bulk linkPlan, and the plan recalculation hooks of
 * status / points / trash / restore / purge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/soft-delete", async () => ({
  ...(await vi.importActual<typeof import("@/services/_shared/soft-delete")>("@/services/_shared/soft-delete")),
  assertProjectLive: vi.fn(async () => undefined),
}))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("@/lib/plan-progress", () => ({ recalcPlanItems: vi.fn(async () => undefined) }))
vi.mock("@/services/plan/plan.links", () => ({ assertLinkablePlanItem: vi.fn(async () => undefined) }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ addPbisToSprint: vi.fn() }))
vi.mock("../backlog.repository")
vi.mock("../backlog.dependencies.repository", () => ({ findDependencyRows: vi.fn(async () => []) }))

const repo = await import("../backlog.repository")
const { recalcPlanItems } = await import("@/lib/plan-progress")
const { assertLinkablePlanItem } = await import("@/services/plan/plan.links")
const { ValidationError } = await import("@/services/_shared/errors")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../backlog.service")
const { bulkBacklog } = await import("../backlog.bulk")
const { bulkBacklogSchema, updateBacklogItemSchema, listBacklogQuerySchema } = await import("../backlog.schemas")

describe("backlog ↔ plan link", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findTasksOfBacklogItem).mockResolvedValue([])
    vi.mocked(repo.findTasksOfBacklogItems).mockResolvedValue([])
  })

  it("schemas accept planItemId (PATCH, list filter, bulk linkPlan)", () => {
    expect(updateBacklogItemSchema.parse({ planItemId: null })).toEqual({ planItemId: null })
    expect(listBacklogQuerySchema.parse({ planItemId: "pl" })).toEqual({ planItemId: "pl" })
    expect(bulkBacklogSchema.parse({ action: "linkPlan", ids: ["a"], payload: { planItemId: null } }).action).toBe("linkPlan")
    expect(() => bulkBacklogSchema.parse({ action: "linkPlan", ids: ["a"], payload: {} })).toThrow()
  })

  it("planItemRef hides unlinked and trashed plan items", () => {
    expect(svc.planItemRef(null)).toBeNull()
    expect(svc.planItemRef(undefined)).toBeNull()
    expect(svc.planItemRef({ id: "pl", name: "P", deletedAt: new Date() })).toBeNull()
    expect(svc.planItemRef({ id: "pl", name: "P", deletedAt: null })).toEqual({ id: "pl", name: "P" })
  })

  it("list passes the planItemId filter and returns planItem { id, name } per PBI", async () => {
    vi.mocked(repo.findBacklogItems).mockResolvedValue([
      { id: "a", status: "ready", workloadScore: 1, iceboxItem: null, productGoal: null, planItem: { id: "pl", name: "Phase", deletedAt: null } },
    ] as never)
    const out = await svc.listBacklog("p1", { planItemId: "pl" })
    expect(repo.findBacklogItems).toHaveBeenCalledWith(expect.anything(), "p1", undefined, "pl")
    expect(out.readyItems[0]).toMatchObject({ planItem: { id: "pl", name: "Phase" } })
  })

  it("detail DTO carries planItem", async () => {
    vi.mocked(repo.findBacklogItem).mockResolvedValue({ id: "a", iceboxItem: null, productGoal: null, planItem: null } as never)
    await expect(svc.getBacklogItem("p1", "a")).resolves.toMatchObject({ planItem: null })
  })

  describe("PATCH", () => {
    it("validates the target leaf, recalculates the old and new plan items", async () => {
      vi.mocked(repo.findPbiPlanItemId).mockResolvedValue("old")
      vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a", displayId: 1, planItemId: "new" } as never)
      await svc.updateBacklogItem("p1", "a", { planItemId: "new", version: 2 }, ACTOR)
      expect(assertLinkablePlanItem).toHaveBeenCalledWith(TX, "p1", "new")
      expect(repo.updateBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", { planItemId: "new" }, 2)
      expect(recalcPlanItems).toHaveBeenCalledWith(["old", "new"], TX)
    })

    it("'' unlinks; a rejected plan item stops the write", async () => {
      vi.mocked(repo.findPbiPlanItemId).mockResolvedValue("old")
      vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a", displayId: 1, planItemId: null } as never)
      await svc.updateBacklogItem("p1", "a", { planItemId: "" }, ACTOR)
      expect(repo.updateBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", { planItemId: null }, undefined)
      expect(assertLinkablePlanItem).not.toHaveBeenCalled()
      expect(recalcPlanItems).toHaveBeenCalledWith(["old", null], TX)

      vi.mocked(assertLinkablePlanItem).mockRejectedValueOnce(new ValidationError("x", {}, "PLAN_LINK_REQUIRES_LEAF"))
      vi.mocked(repo.updateBacklogItem).mockClear()
      await expect(svc.updateBacklogItem("p1", "a", { planItemId: "parent" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_LINK_REQUIRES_LEAF" })
      expect(repo.updateBacklogItem).not.toHaveBeenCalled()
    })

    it("status / points changes recalc the linked plan item; other edits do not", async () => {
      vi.mocked(repo.findPbiPlanItemId).mockResolvedValue("pl")
      vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a", displayId: 1, planItemId: "pl", userStory: "x" } as never)
      await svc.updateBacklogItem("p1", "a", { workloadScore: 5 }, ACTOR)
      expect(recalcPlanItems).toHaveBeenCalledWith(["pl", "pl"], TX)
      vi.mocked(recalcPlanItems).mockClear()
      await svc.updateBacklogItem("p1", "a", { userStory: "x" }, ACTOR)
      expect(recalcPlanItems).not.toHaveBeenCalled()
      expect(repo.findPbiPlanItemId).toHaveBeenCalledTimes(1)
    })
  })

  it("trash / restore / purge recalc the PBI's plan item", async () => {
    vi.mocked(repo.findPbiPlanItemId).mockResolvedValue("pl")
    vi.mocked(repo.softDeleteBacklogItem).mockResolvedValue(true)
    await svc.deleteBacklogItem("p1", "a", ACTOR)
    expect(recalcPlanItems).toHaveBeenLastCalledWith(["pl"], TX)

    vi.mocked(repo.findTrashedBacklogItem).mockResolvedValue({ id: "a", projectId: "p1" })
    await svc.restoreBacklogItem("p1", "a", ACTOR)
    expect(recalcPlanItems).toHaveBeenCalledTimes(2)

    const order: string[] = []
    vi.mocked(repo.findPbiPlanItemId).mockImplementation(async () => (order.push("read"), "pl"))
    vi.mocked(repo.deleteBacklogItem).mockImplementation((() => (order.push("delete"), Promise.resolve({}))) as never)
    vi.mocked(repo.findPbiAttachmentFileNames).mockResolvedValue([])
    await svc.purgeBacklogItem("p1", "a", null)
    expect(order).toEqual(["read", "delete"])
    expect(recalcPlanItems).toHaveBeenLastCalledWith(["pl"], TX)
  })

  describe("bulk", () => {
    const row = (id: string, planItemId: string | null, status = "ready") => ({ id, displayId: 1, status, assignedPo: null, userStory: id, planItemId })

    it("linkPlan validates the leaf, updates only changed PBIs and recalculates old + new", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("a", "old"), row("b", "pl")] as never)
      const out = await bulkBacklog("p1", { action: "linkPlan", ids: ["a", "b"], payload: { planItemId: "pl" } }, ACTOR)
      expect(assertLinkablePlanItem).toHaveBeenCalledWith(TX, "p1", "pl")
      expect(repo.updateBacklogItemsMany).toHaveBeenCalledWith(TX, "p1", ["a"], { planItemId: "pl" })
      expect(recalcPlanItems).toHaveBeenCalledWith(["pl", "old"], TX)
      expect(out).toEqual({ action: "linkPlan", affectedIds: ["a"], skippedIds: ["b"] })
    })

    it("linkPlan null unlinks without a leaf check", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("a", "old")] as never)
      await bulkBacklog("p1", { action: "linkPlan", ids: ["a"], payload: { planItemId: null } }, ACTOR)
      expect(assertLinkablePlanItem).not.toHaveBeenCalled()
      expect(repo.updateBacklogItemsMany).toHaveBeenCalledWith(TX, "p1", ["a"], { planItemId: null })
    })

    it("status and trash recalc the plan items of the touched PBIs", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("a", "pl", "ready")] as never)
      await bulkBacklog("p1", { action: "status", ids: ["a"], payload: { status: "completed" } }, ACTOR)
      expect(recalcPlanItems).toHaveBeenCalledWith(["pl"], TX)
      await bulkBacklog("p1", { action: "trash", ids: ["a"] }, ACTOR)
      expect(recalcPlanItems).toHaveBeenCalledTimes(2)
    })
  })
})
