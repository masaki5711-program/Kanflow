import { beforeEach, describe, expect, test, vi } from "vitest"

// The three-language worker fills ONE missing language per pass and only marks a
// row "done" once ja/id/en are all present. These tests drive translationWorkerTick()
// across several passes against a mutable in-memory row to verify that sequencing.
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  transaction: vi.fn(),
  translateText: vi.fn(),
  findGlossaryForText: vi.fn(),
  aiLog: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { fieldTranslation: { updateMany: mocks.updateMany }, $transaction: mocks.transaction },
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: mocks.aiLog }))
vi.mock("../service", () => ({ backfillTranslations: vi.fn(async () => 0) }))
vi.mock("../glossary-service", () => ({
  findGlossaryForText: mocks.findGlossaryForText,
  bumpGlossaryUsage: vi.fn(async () => undefined),
}))
vi.mock("../translator", () => ({ translateText: mocks.translateText }))

import { missingTargets, setWorkerAdmission, translationWorkerTick } from "../worker"

const CLAIMED_AT = new Date("2026-09-23T00:00:00.000Z")

/** Claims `row` every tick and persists whatever apply() writes back onto it. */
function wireRow(row: Record<string, unknown>) {
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: async () => [{ entity_type: row.entityType, entity_id: row.entityId, field: row.field }],
      fieldTranslation: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ ...row }) },
    })
  )
  mocks.updateMany.mockImplementation(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (args.where.entityId === row.entityId) Object.assign(row, args.data)
    return { count: 1 }
  })
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
  // Deterministic by default: the English-backfill claim only matters to the
  // dedicated describe block below; everywhere else a pending row is always
  // claimed first, but stubbing "off" keeps that branch from ever firing.
  vi.stubEnv("TRANSLATION_EN_BACKFILL_HOURS", "off")
  mocks.findGlossaryForText.mockResolvedValue([])
})

describe("missingTargets", () => {
  test("ja source missing both id and en", () => {
    expect(missingTargets({ sourceLocale: "ja", textJa: "こんにちは", textId: null, textEn: null })).toEqual(["id", "en"])
  })

  test("ja source with id already filled is missing only en", () => {
    expect(missingTargets({ sourceLocale: "ja", textJa: "こんにちは", textId: "Halo", textEn: null })).toEqual(["en"])
  })

  test("old rows with textEn undefined (column absent pre-migration) count as missing", () => {
    expect(
      missingTargets({ sourceLocale: "ja", textJa: "こんにちは", textId: "Halo", textEn: undefined as unknown as null })
    ).toEqual(["en"])
  })

  test("nothing missing when every column is filled", () => {
    expect(missingTargets({ sourceLocale: "id", textJa: "こんにちは", textId: "Halo", textEn: "Hello" })).toEqual([])
  })

  test("blank strings count as missing, not just null", () => {
    expect(missingTargets({ sourceLocale: "ja", textJa: "こんにちは", textId: "   ", textEn: "Hello" })).toEqual(["id"])
  })

  test("en source is missing ja then id (en fill order)", () => {
    expect(missingTargets({ sourceLocale: "en", textJa: null, textId: null, textEn: "Hello" })).toEqual(["ja", "id"])
  })
})

describe("multi-pass fill: ja source", () => {
  test("first pass fills id and requeues pending; second pass fills en and marks done", async () => {
    const row = {
      entityType: "backlog_item",
      entityId: "b1",
      field: "title",
      sourceLocale: "ja",
      textJa: "こんにちは",
      textId: null,
      textEn: null,
      attempts: 0,
      sourceHash: "h",
      status: "running",
      startedAt: CLAIMED_AT,
      model: null,
      translatedAt: null as Date | null,
    }
    wireRow(row)

    mocks.translateText.mockResolvedValueOnce({ translated: "Halo", modelUsed: "m", glossaryMisses: [] })
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 1, skipped: null })
    expect(row.status).toBe("pending")
    expect(row.textId).toBe("Halo")
    expect(row.textEn).toBeNull()
    expect(row.translatedAt).toBeNull()

    mocks.translateText.mockResolvedValueOnce({ translated: "Hello", modelUsed: "m", glossaryMisses: [] })
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 1, skipped: null })
    expect(row.status).toBe("done")
    expect(row.textId).toBe("Halo")
    expect(row.textEn).toBe("Hello")
    expect(row.translatedAt).toBeInstanceOf(Date)

    expect(mocks.translateText).toHaveBeenCalledTimes(2)
    expect(mocks.translateText.mock.calls[0][0]).toMatchObject({ sourceLocale: "ja", targetLocale: "id" })
    expect(mocks.translateText.mock.calls[1][0]).toMatchObject({ sourceLocale: "ja", targetLocale: "en" })
  })
})

describe("multi-pass fill: en source", () => {
  test("fills ja then id, in that order, before marking done", async () => {
    const row = {
      entityType: "backlog_item",
      entityId: "e1",
      field: "title",
      sourceLocale: "en",
      textJa: null,
      textId: null,
      textEn: "Hello",
      attempts: 0,
      sourceHash: "h2",
      status: "running",
      startedAt: CLAIMED_AT,
      model: null,
    }
    wireRow(row)

    mocks.translateText.mockResolvedValueOnce({ translated: "こんにちは", modelUsed: "m", glossaryMisses: [] })
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 1, skipped: null })
    expect(row.status).toBe("pending")
    expect(row.textJa).toBe("こんにちは")
    expect(row.textId).toBeNull()

    mocks.translateText.mockResolvedValueOnce({ translated: "Halo", modelUsed: "m", glossaryMisses: [] })
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 1, skipped: null })
    expect(row.status).toBe("done")
    expect(row.textId).toBe("Halo")

    expect(mocks.translateText.mock.calls[0][0]).toMatchObject({ sourceLocale: "en", targetLocale: "ja" })
    expect(mocks.translateText.mock.calls[1][0]).toMatchObject({ sourceLocale: "en", targetLocale: "id" })
  })
})

describe("nothing missing", () => {
  test("a row re-queued with every language already filled finishes done without a model call", async () => {
    const row = {
      entityType: "backlog_item",
      entityId: "b2",
      field: "title",
      sourceLocale: "ja",
      textJa: "こんにちは",
      textId: "Halo",
      textEn: "Hello",
      attempts: 0,
      sourceHash: "h3",
      status: "running",
      startedAt: CLAIMED_AT,
      model: "old-model",
    }
    wireRow(row)

    await expect(translationWorkerTick()).resolves.toEqual({ processed: 1, skipped: null })
    expect(row.status).toBe("done")
    expect(mocks.translateText).not.toHaveBeenCalled()
  })
})

describe("failure and preemption are unaffected by multi-language fill", () => {
  test("a failed call backs off normally and does not touch any text column", async () => {
    const row = {
      entityType: "backlog_item",
      entityId: "b3",
      field: "title",
      sourceLocale: "ja",
      textJa: "こんにちは",
      textId: null,
      textEn: null,
      attempts: 0,
      sourceHash: "h4",
      status: "running",
      startedAt: CLAIMED_AT,
      model: null,
    }
    wireRow(row)
    mocks.translateText.mockRejectedValueOnce(new Error("boom"))

    await expect(translationWorkerTick()).resolves.toEqual({ processed: 0, skipped: null })
    expect(row.status).toBe("pending")
    expect(row.attempts).toBe(1)
    expect(row.textId).toBeNull()
    expect(row.textEn).toBeNull()
    expect(mocks.aiLog).toHaveBeenCalledWith("XLATE_BG_FAIL", expect.stringContaining("boom"))
  })
})

describe("tick-level failures", () => {
  test("an unexpected error during the tick is caught and reported as skipped: error", async () => {
    mocks.updateMany.mockRejectedValueOnce(new Error("db down"))
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 0, skipped: "error" })
    expect(mocks.aiLog).toHaveBeenCalledWith("XLATE_WORKER", expect.stringContaining("db down"))
  })
})

describe("English backfill claim (idle catch-up for pre-English rows)", () => {
  test("fills text_en for an older done row when nothing is pending, inside the backfill window", async () => {
    vi.stubEnv("TRANSLATION_EN_BACKFILL_HOURS", "always")
    const row = {
      entityType: "backlog_item",
      entityId: "old1",
      field: "title",
      sourceLocale: "ja",
      textJa: "こんにちは",
      textId: "Halo",
      textEn: null,
      attempts: 0,
      sourceHash: "h5",
      status: "running",
      startedAt: CLAIMED_AT,
      model: "m",
    }
    // First $transaction call: the normal pending claim finds nothing.
    mocks.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: async () => [], fieldTranslation: { updateMany: async () => ({ count: 0 }), findUnique: async () => null } })
    )
    // Second $transaction call: the English-backfill claim finds the older done row.
    mocks.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: async () => [{ entity_type: row.entityType, entity_id: row.entityId, field: row.field }],
        fieldTranslation: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ ...row }) },
      })
    )
    mocks.updateMany.mockImplementation(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (args.where.entityId === row.entityId) Object.assign(row, args.data)
      return { count: 1 }
    })
    mocks.translateText.mockResolvedValueOnce({ translated: "Hello", modelUsed: "m", glossaryMisses: [] })

    await expect(translationWorkerTick()).resolves.toEqual({ processed: 1, skipped: null })
    expect(row.textEn).toBe("Hello")
    expect(row.status).toBe("done")
    expect(mocks.translateText.mock.calls[0][0]).toMatchObject({ sourceLocale: "ja", targetLocale: "en" })
  })

  test("does not claim anything when the backfill window is off, even with nothing pending", async () => {
    vi.stubEnv("TRANSLATION_EN_BACKFILL_HOURS", "off")
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: async () => [], fieldTranslation: { updateMany: async () => ({ count: 0 }), findUnique: async () => null } })
    )

    await expect(translationWorkerTick()).resolves.toEqual({ processed: 0, skipped: null })
    expect(mocks.translateText).not.toHaveBeenCalled()
    // Only the normal pending claim ran — no second $transaction for the backfill query.
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })
})
