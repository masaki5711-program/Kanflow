import { beforeEach, describe, expect, test, vi } from "vitest"

// The worker must never reach the real database or Ollama in tests.
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  transaction: vi.fn(),
  translateText: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { fieldTranslation: { updateMany: mocks.updateMany }, $transaction: mocks.transaction },
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn() }))
vi.mock("../service", () => ({ backfillTranslations: vi.fn(async () => 0) }))
vi.mock("../glossary-service", () => ({ findGlossaryForText: vi.fn(async () => []), bumpGlossaryUsage: vi.fn(async () => undefined) }))
vi.mock("../translator", () => ({ translateText: mocks.translateText }))

import { setWorkerAdmission, stopTranslationWorker, translationWorkerTick } from "../worker"
import { gate } from "../priority-gate"

const ROW = {
  entityType: "backlog_item",
  entityId: "b1",
  field: "title",
  sourceLocale: "ja",
  textJa: "こんにちは",
  textId: null,
  attempts: 0,
  sourceHash: "h",
}

function claimRows(rows: unknown[]) {
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: async () => rows.map(() => ({ entity_type: ROW.entityType, entity_id: ROW.entityId, field: ROW.field })),
      fieldTranslation: { updateMany: async () => ({ count: 1 }), findUnique: async () => ROW },
    })
  )
}

const g = globalThis as unknown as { __kanflowTranslationWorker?: { stopping: boolean } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateMany.mockResolvedValue({ count: 1 })
  setWorkerAdmission(null)
  if (g.__kanflowTranslationWorker) g.__kanflowTranslationWorker.stopping = false
  vi.stubEnv("AI_TRANSLATION_WORKER", "external")
})

describe("translation worker admission + graceful stop", () => {
  test("a denied admission skips the tick without claiming rows", async () => {
    setWorkerAdmission(() => ({ allow: false, reason: "peer-busy" }))
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 0, skipped: "peer-busy" })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("stop aborts the in-flight translation and returns the row to pending", async () => {
    claimRows([ROW])
    let started!: () => void
    const inFlight = new Promise<void>((r) => (started = r))
    mocks.translateText.mockImplementation(
      (_input: unknown, opts: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          started()
          opts.signal.addEventListener("abort", () => reject(opts.signal.reason), { once: true })
        })
    )

    const tick = translationWorkerTick()
    await inFlight
    await expect(stopTranslationWorker({ timeoutMs: 1_000 })).resolves.toBe(true)
    await expect(tick).resolves.toEqual({ processed: 0, skipped: null })

    // resetStale + the preempted row's apply → status pending, attempts unchanged
    const applied = mocks.updateMany.mock.calls.map((c) => c[0]).find((a) => a.where.sourceHash === "h")
    expect(applied.data).toMatchObject({ status: "pending", attempts: 0, startedAt: null })
    expect(gate.background_active).toBe(0)
    // no new ticks after stop
    await expect(translationWorkerTick()).resolves.toEqual({ processed: 0, skipped: "stopping" })
  })

  test("stop with nothing running resolves immediately", async () => {
    await expect(stopTranslationWorker()).resolves.toBe(true)
  })
})
