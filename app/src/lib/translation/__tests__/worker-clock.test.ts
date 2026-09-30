import { beforeEach, describe, expect, test, vi } from "vitest"

// Timestamps: every write must use UTC (Prisma writes JS Dates as UTC wall-clock),
// and rows written earlier with local-time NOW(3) must not be held back.
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { fieldTranslation: { updateMany: mocks.updateMany }, $transaction: mocks.transaction },
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn() }))
vi.mock("../service", () => ({ backfillTranslations: vi.fn(async () => 0) }))
vi.mock("../glossary-service", () => ({ findGlossaryForText: vi.fn(async () => []), bumpGlossaryUsage: vi.fn(async () => undefined) }))
vi.mock("../translator", () => ({ translateText: vi.fn() }))

import { FUTURE_REQUEST_TOLERANCE_MS, setWorkerAdmission, translationWorkerTick } from "../worker"
import { MAX_ATTEMPTS, BACKOFF_BASE_MS } from "../worker-state"

type UpdateArgs = { where: Record<string, unknown>; data: Record<string, unknown> }

function clampCall(): UpdateArgs | undefined {
  return mocks.updateMany.mock.calls
    .map((c) => c[0] as UpdateArgs)
    .find((a) => a.where.status === "pending" && "requestedAt" in a.where)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateMany.mockResolvedValue({ count: 0 })
  mocks.queryRaw.mockResolvedValue([])
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ $queryRaw: mocks.queryRaw, fieldTranslation: { updateMany: vi.fn(), findUnique: vi.fn() } })
  )
  setWorkerAdmission(null)
})

describe("translation worker clock handling", () => {
  test("tolerance exceeds the longest legitimate retry backoff", () => {
    // Arrange
    const longestBackoff = MAX_ATTEMPTS * BACKOFF_BASE_MS

    // Assert
    expect(FUTURE_REQUEST_TOLERANCE_MS).toBeGreaterThan(longestBackoff)
  })

  test("pulls pending rows scheduled implausibly far in the future back to now", async () => {
    // Arrange
    const before = Date.now()

    // Act
    await translationWorkerTick()

    // Assert
    const call = clampCall()
    expect(call).toBeDefined()
    const threshold = (call!.where.requestedAt as { gt: Date }).gt.getTime()
    expect(threshold).toBeGreaterThanOrEqual(before + FUTURE_REQUEST_TOLERANCE_MS)
    const newValue = (call!.data.requestedAt as Date).getTime()
    expect(newValue).toBeGreaterThanOrEqual(before)
    expect(newValue).toBeLessThan(threshold)
  })

  test("claims rows by comparing against UTC, not the server's local clock", async () => {
    // Act
    await translationWorkerTick()

    // Assert
    const sql = (mocks.queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?")
    expect(sql).toContain("requested_at <= UTC_TIMESTAMP(3)")
    expect(sql).not.toContain("NOW(")
  })
})
