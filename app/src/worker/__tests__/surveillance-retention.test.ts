import { beforeEach, describe, expect, test, vi } from "vitest"

// Never touch the real database or Ollama.
const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  detectAnomalies: vi.fn(),
  runAgentInvestigation: vi.fn(),
  convertLegacyAiReports: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiReport: { deleteMany: mocks.deleteMany, findFirst: mocks.findFirst, create: mocks.create },
    project: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}))
vi.mock("@/lib/surveillance", () => ({ detectAnomalies: mocks.detectAnomalies }))
vi.mock("@/lib/ai-agent", () => ({ runAgentInvestigation: mocks.runAgentInvestigation }))
vi.mock("@/lib/report-bilingual", () => ({
  bilingualizeStructuredReport: vi.fn(async (r: unknown) => r),
  bilingualizeReportBody: vi.fn(async (b: string) => b),
  convertLegacyAiReports: mocks.convertLegacyAiReports,
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn() }))

import { buildGoal, extractPreviousFindings, pruneOldReports, retentionCutoff, runSurveillance } from "../jobs/surveillance"

/** $transaction fake: GET_LOCK answers `lockFree`, other statements 1. */
function lockTx(lockFree: boolean) {
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: async (strings: TemplateStringsArray) => [{ v: strings.join("").includes("GET_LOCK") ? (lockFree ? 1 : 0) : 1 }],
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteMany.mockResolvedValue({ count: 0 })
  mocks.findMany.mockResolvedValue([])
  mocks.findFirst.mockResolvedValue(null)
  mocks.convertLegacyAiReports.mockResolvedValue({ converted: 0 })
})

describe("retention", () => {
  test("cutoff is N days before now", () => {
    const now = new Date("2026-09-23T06:30:00Z")
    expect(retentionCutoff(now, 90)).toEqual(new Date("2026-06-25T06:30:00Z"))
    expect(retentionCutoff(now, 1)).toEqual(new Date("2026-09-22T06:30:00Z"))
  })

  test("pruneOldReports deletes only reports created before the cutoff", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 4 })
    const now = new Date("2026-09-23T00:00:00Z")
    await expect(pruneOldReports(90, now)).resolves.toBe(4)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-06-25T00:00:00Z") } } })
  })
})

describe("runSurveillance", () => {
  test("keeps history: a new report never deletes the project's previous reports", async () => {
    lockTx(true)
    mocks.findMany.mockResolvedValue([{ id: "p1", name: "Line A" }])
    mocks.detectAnomalies.mockResolvedValue([{ severity: "warning", description: "velocity drop" }])
    mocks.findFirst.mockResolvedValue({ id: "old", structured: null, summary: "前回の指摘", createdAt: new Date("2026-09-22T06:30:00Z") })
    mocks.runAgentInvestigation.mockResolvedValue({ report: "本文", structured: null, toolCalls: [], iterations: 1, ms: 10 })
    mocks.create.mockResolvedValue({ id: "new" })
    const before = vi.fn(async () => undefined)

    const r = await runSurveillance({ retentionDays: 90, now: () => new Date("2026-09-23T06:30:00Z"), beforeInvestigation: before })

    expect(r.status).toBe("done")
    expect(r.projects).toEqual([{ project: "Line A", anomalies: 1, investigated: true, reportId: "new" }])
    // exactly one deleteMany: the retention sweep (no per-project supersede)
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-06-25T06:30:00Z") } } })
    expect(before).toHaveBeenCalledTimes(1)
    expect(JSON.parse(mocks.create.mock.calls[0][0].data.meta).followUpOf).toBe("old")
  })

  test("skips without touching reports when another process holds the surveillance lock", async () => {
    lockTx(false)
    const r = await runSurveillance({ retentionDays: 90 })
    expect(r).toMatchObject({ status: "skipped", reason: "running in another process" })
    expect(mocks.deleteMany).not.toHaveBeenCalled()
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  test("an aborted run stops before the next project", async () => {
    lockTx(true)
    const controller = new AbortController()
    controller.abort()
    mocks.findMany.mockResolvedValue([{ id: "p1", name: "A" }])
    const r = await runSurveillance({ retentionDays: 90, signal: controller.signal })
    expect(r.status).toBe("aborted")
    expect(mocks.detectAnomalies).not.toHaveBeenCalled()
  })
})

describe("legacy conversion + shared retention", () => {
  test("each run converts legacy reports after the retention sweep, yielding to web users", async () => {
    lockTx(true)
    mocks.convertLegacyAiReports.mockResolvedValue({ converted: 2 })
    const before = vi.fn(async () => undefined)
    const r = await runSurveillance({ retentionDays: 90, beforeInvestigation: before })
    expect(r.conversion).toEqual({ converted: 2 })
    expect(mocks.convertLegacyAiReports).toHaveBeenCalledWith({ signal: undefined, beforeConvert: before })
    expect(mocks.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.convertLegacyAiReports.mock.invocationCallOrder[0])
  })

  test("a conversion failure does not abort the run", async () => {
    lockTx(true)
    mocks.convertLegacyAiReports.mockRejectedValue(new Error("ollama down"))
    const r = await runSurveillance({ retentionDays: 90 })
    expect(r).toMatchObject({ status: "done", conversion: { converted: 0 } })
  })

  test("default retention comes from the shared setting (90, alias AI_REPORT_RETENTION_DAYS)", async () => {
    lockTx(true)
    vi.stubEnv("SURVEILLANCE_RETENTION_DAYS", "")
    vi.stubEnv("AI_REPORT_RETENTION_DAYS", "")
    await expect(runSurveillance()).resolves.toMatchObject({ retention: { days: 90 } })
    vi.stubEnv("AI_REPORT_RETENTION_DAYS", "30")
    await expect(runSurveillance()).resolves.toMatchObject({ retention: { days: 30 } })
    vi.stubEnv("SURVEILLANCE_RETENTION_DAYS", "60")
    await expect(runSurveillance()).resolves.toMatchObject({ retention: { days: 60 } })
    vi.unstubAllEnvs()
  })
})

describe("goal building", () => {
  test("extractPreviousFindings keeps Japanese lines of bilingual fields", () => {
    const structured = JSON.stringify({
      findings: [{ severity: "high", title: "Kecepatan turun\n速度低下", detail: "" }],
      followUps: [{ item: "レビュー未実施", status: "unresolved" }, { item: "済", status: "resolved" }],
      actions: [{ action: "見積り見直し" }],
    })
    expect(extractPreviousFindings(structured, null)).toEqual(["- [high] 速度低下", "- [継続] レビュー未実施", "- [推奨アクション] 見積り見直し"])
    expect(extractPreviousFindings(null, "要約")).toEqual(["- 要約"])
  })

  test("buildGoal mentions follow-ups and anomalies", () => {
    const g = buildGoal(["- a"], new Date("2026-09-22T00:00:00Z"), [{ severity: "critical", description: "x" } as never])
    expect(g).toContain("前回の報告（2026-09-22）")
    expect(g).toContain("- [critical] x")
  })
})
