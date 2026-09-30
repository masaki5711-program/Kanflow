import { beforeEach, describe, expect, it, vi } from "vitest"

const $transaction = vi.fn()
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (...a: unknown[]) => $transaction(...a) } }))

const applyGlossaryMarkup = vi.fn()
vi.mock("@/lib/translation/glossary-service", () => ({
  applyGlossaryMarkup: (...a: unknown[]) => applyGlossaryMarkup(...a),
}))

const enqueueTranslations = vi.fn()
const deleteTranslationsForMany = vi.fn()
vi.mock("@/lib/translation/service", () => ({
  attachI18n: vi.fn(),
  attachI18nOne: vi.fn(),
  getI18nFor: vi.fn(),
  enqueueTranslations: (...a: unknown[]) => enqueueTranslations(...a),
  deleteTranslationsForMany: (...a: unknown[]) => deleteTranslationsForMany(...a),
}))

const db = await import("../db")
const tr = await import("../translations")
const barrel = await import("../index")

describe("_shared/db", () => {
  beforeEach(() => vi.clearAllMocks())

  it("withTransaction runs the body with the tx client and bounded options", async () => {
    const tx = { __tx: 1 }
    $transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx))
    const body = vi.fn(async (t: unknown) => ({ got: t }))
    await expect(db.withTransaction(body as never)).resolves.toEqual({ got: tx })
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5_000, timeout: 20_000 })
  })

  it("withTransaction propagates body errors (rollback)", async () => {
    $transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn({}))
    await expect(db.withTransaction(async () => { throw new Error("boom") })).rejects.toThrow("boom")
  })

  it("defaultDb is the global client", () => {
    expect(db.defaultDb).toHaveProperty("$transaction")
  })
})

describe("_shared/translations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("prepareText returns the markup-stripped fields", async () => {
    applyGlossaryMarkup.mockResolvedValue({ fields: { title: "clean" }, pairs: [] })
    await expect(tr.prepareText({ title: "raw<<x>>" }, "u1")).resolves.toEqual({ title: "clean" })
    expect(applyGlossaryMarkup).toHaveBeenCalledWith({ title: "raw<<x>>" }, "u1")
  })

  it("enqueueIn forwards to enqueueTranslations with the tx", async () => {
    enqueueTranslations.mockResolvedValue(undefined)
    const tx = {} as never
    await tr.enqueueIn(tx, "sprint", "s1", { sprintGoal: "g" })
    expect(enqueueTranslations).toHaveBeenCalledWith("sprint", "s1", { sprintGoal: "g" }, tx)
  })

  it("purgeIn sums per-entity deletes and skips empty groups", async () => {
    deleteTranslationsForMany.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
    const tx = {} as never
    const n = await tr.purgeIn(tx, { sprint: ["s1"], sprint_task: [], daily_scrum_note: ["n1", "n2"], project: undefined })
    expect(n).toBe(5)
    expect(deleteTranslationsForMany).toHaveBeenCalledTimes(2)
    expect(deleteTranslationsForMany).toHaveBeenNthCalledWith(1, "sprint", ["s1"], tx)
    expect(deleteTranslationsForMany).toHaveBeenNthCalledWith(2, "daily_scrum_note", ["n1", "n2"], tx)
  })

  it("purgeIn propagates delete failures", async () => {
    deleteTranslationsForMany.mockRejectedValue(new Error("db down"))
    await expect(tr.purgeIn({} as never, { sprint: ["s1"] })).rejects.toThrow("db down")
  })
})

describe("_shared barrel", () => {
  it("re-exports the shared helpers", () => {
    expect(barrel.LIST_LIMITS.aiReports).toBe(10)
    expect(typeof barrel.jsonResponse).toBe("function")
    expect(typeof barrel.toHttpResponse).toBe("function")
    expect(typeof barrel.actorFromSession).toBe("function")
  })
})
