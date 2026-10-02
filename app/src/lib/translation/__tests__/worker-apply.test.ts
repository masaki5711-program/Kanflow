import { beforeEach, describe, expect, test, vi } from "vitest"

// Worker write-back must be conditional: never recreate a purged row.
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  translateText: vi.fn(),
  aiLog: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fieldTranslation: { updateMany: mocks.updateMany, upsert: mocks.upsert, create: mocks.create },
    $transaction: mocks.transaction,
  },
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: mocks.aiLog }))
vi.mock("../service", () => ({ backfillTranslations: vi.fn(async () => 0) }))
vi.mock("../glossary-service", () => ({ findGlossaryForText: vi.fn(async () => []), bumpGlossaryUsage: vi.fn(async () => undefined) }))
vi.mock("../translator", () => ({ translateText: mocks.translateText }))

import { setWorkerAdmission, translationWorkerTick } from "../worker"

const CLAIMED_AT = new Date("2026-09-23T00:00:00.000Z")
const ROW = {
  entityType: "backlog_item",
  entityId: "b1",
  field: "title",
  sourceLocale: "ja",
  textJa: "こんにちは",
  textId: null,
  attempts: 0,
  sourceHash: "h",
  status: "running",
  startedAt: CLAIMED_AT,
}

function claimOne() {
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: async () => [{ entity_type: ROW.entityType, entity_id: ROW.entityId, field: ROW.field }],
      fieldTranslation: { updateMany: async () => ({ count: 1 }), findUnique: async () => ROW },
    }),
  )
}

/** The apply() call (resetStale is the other updateMany, keyed on status only). */
function applyCall() {
  return mocks.updateMany.mock.calls.map((c) => c[0]).find((a) => a.where.entityId === "b1")
}

const g = globalThis as unknown as { __kanflowTranslationWorker?: { stopping: boolean; running: boolean } }

beforeEach(() => {
  vi.clearAllMocks()
  setWorkerAdmission(null)
  if (g.__kanflowTranslationWorker) {
    g.__kanflowTranslationWorker.stopping = false
    g.__kanflowTranslationWorker.running = false
  }
  vi.stubEnv("AI_TRANSLATION_WORKER", "external")
  claimOne()
  mocks.translateText.mockResolvedValue({ translated: "Halo", modelUsed: "m", glossaryMisses: [] })
})

describe("translation worker write-back", () => {
  test("updates only the row it claimed (running + claim time + source hash); still pending while English is missing", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 })
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 1, skipped: null })
    // ROW has sourceLocale "ja" and no textEn: targetsFor("ja") = ["id", "en"], so after
    // filling "id" the row still needs "en" and goes back to pending (not done).
    expect(applyCall()).toMatchObject({
      where: {
        entityType: "backlog_item",
        entityId: "b1",
        field: "title",
        status: "running",
        startedAt: CLAIMED_AT,
        sourceHash: "h",
      },
      data: { status: "pending", textId: "Halo" },
    })
  })

  test("count 0 (row purged by an entity delete) is skipped: no recreate, not counted", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 0, skipped: null })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.aiLog).toHaveBeenCalledWith("XLATE_BG_SKIP", expect.stringContaining("backlog_item/b1/title"))
  })

  test("a failed translation for a purged row is also discarded silently", async () => {
    mocks.translateText.mockRejectedValue(new Error("boom"))
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 0, skipped: null })
    expect(mocks.aiLog).not.toHaveBeenCalledWith("XLATE_BG_FAIL", expect.anything())
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
