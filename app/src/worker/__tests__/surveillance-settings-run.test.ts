import { beforeEach, describe, expect, test, vi } from "vitest"

// Per-project surveillance settings inside the worker run. No DB / Ollama.
const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  detectAnomalies: vi.fn(),
  runAgentInvestigation: vi.fn(),
  notify: vi.fn(),
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
  convertLegacyAiReports: vi.fn(async () => ({ converted: 0 })),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn() }))
vi.mock("@/services/_shared/notifications", () => ({ notify: mocks.notify, projectMemberIds: vi.fn(async () => ["po"]) }))

const { runSurveillance, DEFAULT_MAX_INVESTIGATIONS, resolveMaxInvestigations } = await import("../jobs/surveillance")
const { DEFAULT_SURVEILLANCE_SETTINGS } = await import("@/lib/surveillance-settings")

const CRITICAL = [{ code: "sprint_overdue", severity: "critical", description: "overdue" }]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ $queryRaw: async () => [{ v: 1 }] })
  )
  mocks.deleteMany.mockResolvedValue({ count: 0 })
  mocks.findFirst.mockResolvedValue(null)
  mocks.detectAnomalies.mockResolvedValue(CRITICAL)
  mocks.runAgentInvestigation.mockResolvedValue({ report: "r", structured: null, toolCalls: [], iterations: 1, ms: 1 })
  mocks.create.mockResolvedValue({ id: "rep" })
  mocks.notify.mockResolvedValue(1)
})

describe("runSurveillance with project settings", () => {
  test("loads the settings column and passes parsed thresholds to detection", async () => {
    mocks.findMany.mockResolvedValue([{ id: "p1", name: "A", surveillanceSettings: JSON.stringify({ stalledDays: 9 }) }])
    await runSurveillance({ retentionDays: 90 })
    expect(mocks.findMany.mock.calls[0][0].select).toEqual({ id: true, name: true, surveillanceSettings: true })
    expect(mocks.detectAnomalies).toHaveBeenCalledWith("p1", { ...DEFAULT_SURVEILLANCE_SETTINGS, stalledDays: 9 })
  })

  test("a disabled project is skipped without detection or investigation", async () => {
    mocks.findMany.mockResolvedValue([{ id: "p1", name: "A", surveillanceSettings: JSON.stringify({ enabled: false }) }])
    const r = await runSurveillance({ retentionDays: 90 })
    expect(r.projects).toEqual([{ project: "A", skipped: "disabled" }])
    expect(mocks.detectAnomalies).not.toHaveBeenCalled()
    expect(mocks.runAgentInvestigation).not.toHaveBeenCalled()
  })

  test("critical anomalies notify PO / SM unless notifyCritical is off", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "p1", name: "A", surveillanceSettings: null },
      { id: "p2", name: "B", surveillanceSettings: JSON.stringify({ notifyCritical: false }) },
    ])
    await runSurveillance({ retentionDays: 90 })
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify.mock.calls[0][1]).toMatchObject({ type: "surveillance_critical", projectId: "p1" })
  })

  test("maxInvestigations caps the agent runs per pass", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "p1", name: "A", surveillanceSettings: null },
      { id: "p2", name: "B", surveillanceSettings: null },
    ])
    const r = await runSurveillance({ retentionDays: 90, maxInvestigations: 1 })
    expect(r.investigated).toBe(1)
    expect(r.projects[1]).toMatchObject({ project: "B", investigated: false, skipped: "max investigations reached" })
  })
})

describe("resolveMaxInvestigations", () => {
  test("defaults to 3 and accepts positive integers only", () => {
    expect(DEFAULT_MAX_INVESTIGATIONS).toBe(3)
    expect(resolveMaxInvestigations({})).toBe(3)
    expect(resolveMaxInvestigations({ SURVEILLANCE_MAX_INVESTIGATIONS: "5" })).toBe(5)
    expect(resolveMaxInvestigations({ SURVEILLANCE_MAX_INVESTIGATIONS: "0" })).toBe(3)
    expect(resolveMaxInvestigations({ SURVEILLANCE_MAX_INVESTIGATIONS: "x" })).toBe(3)
  })
})
