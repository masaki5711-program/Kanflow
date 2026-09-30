import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  tx: { __tx: true },
  repo: {
    findGoals: vi.fn(),
    insertGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
  },
  tr: {
    prepareText: vi.fn(async (d: unknown) => d),
    enqueueIn: vi.fn(async () => undefined),
    purgeIn: vi.fn(async () => 0),
    attachI18n: vi.fn(async (_t: string, rows: unknown[]) => rows.map((r) => ({ ...(r as object), i18n: {} }))),
    attachI18nOne: vi.fn(async (_t: string, row: unknown) => ({ ...(row as object), i18n: {} })),
  },
}))

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", () => ({
  defaultDb: { __default: true },
  withTransaction: (fn: (tx: unknown) => unknown) => fn(m.tx),
}))
vi.mock("@/services/_shared/translations", () => m.tr)
vi.mock("../goals.repository", () => m.repo)

const svc = await import("../goals.service")
const { touchedTranslationFields } = await import("@/services/__tests__/support")
const actor = { userId: "u1", userName: "User", systemRole: "member" }

describe("goals.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists goals with i18n attached", async () => {
    m.repo.findGoals.mockResolvedValue([{ id: "g1" }])
    const out = await svc.listGoals("p1")
    expect(out).toEqual([{ id: "g1", i18n: {} }])
    expect(m.tr.attachI18n).toHaveBeenCalledWith("product_goal", [{ id: "g1" }])
  })

  it("creates a goal and enqueues its translation in the same transaction", async () => {
    const goal = { id: "g1", title: "T", description: null }
    m.repo.insertGoal.mockResolvedValue(goal)
    const out = await svc.createGoal("p1", { title: "T" }, actor)
    expect(out).toBe(goal)
    expect(m.tr.prepareText).toHaveBeenCalledWith({ title: "T" }, "u1")
    expect(m.repo.insertGoal).toHaveBeenCalledWith(m.tx, "p1", { title: "T" })
    expect(m.tr.enqueueIn).toHaveBeenCalledWith(m.tx, "product_goal", "g1", goal)
  })

  it("updates a goal, enqueues only the changed fields and returns i18n", async () => {
    m.repo.updateGoal.mockResolvedValue({ id: "g1", title: "N" })
    const out = await svc.updateGoal("p1", "g1", { title: "N" }, actor)
    expect(m.tr.enqueueIn).toHaveBeenCalledWith(m.tx, "product_goal", "g1", { title: "N" })
    expect(out).toEqual({ id: "g1", title: "N", i18n: {} })
  })

  it("A3-02: a non-text update (text keys undefined) touches no FieldTranslation row", async () => {
    m.repo.updateGoal.mockResolvedValue({ id: "g1" })
    await svc.updateGoal("p1", "g1", { status: "achieved", title: undefined, description: undefined } as never, actor)
    expect(touchedTranslationFields(m.tr.enqueueIn)).toEqual([])
  })

  it("deletes a goal and purges its translations transactionally", async () => {
    await svc.deleteGoal("p1", "g1")
    expect(m.repo.deleteGoal).toHaveBeenCalledWith(m.tx, "p1", "g1")
    expect(m.tr.purgeIn).toHaveBeenCalledWith(m.tx, { product_goal: ["g1"] })
  })

  it("does not purge when the delete fails", async () => {
    m.repo.deleteGoal.mockRejectedValue(Object.assign(new Error("missing"), { code: "P2025" }))
    await expect(svc.deleteGoal("p1", "gx")).rejects.toMatchObject({ code: "P2025" })
    expect(m.tr.purgeIn).not.toHaveBeenCalled()
  })
})
