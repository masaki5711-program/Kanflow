import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: { __prisma: true } }))
vi.mock("@/lib/surveillance", () => ({ detectAnomalies: vi.fn() }))
vi.mock("@/lib/ai-agent", () => ({ runAgentInvestigation: vi.fn() }))
vi.mock("@/lib/report-bilingual", () => ({}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn() }))
vi.mock("@/services/_shared/notifications", () => ({
  notify: vi.fn(async () => 2),
  projectMemberIds: vi.fn(async () => ["u-po", "u-sm"]),
}))

const nt = await import("@/services/_shared/notifications")
const { notifySurveillanceCritical } = await import("../jobs/surveillance")

const project = { id: "p1", name: "Proj" }
const report = { id: "r1", title: "Report" }

describe("notifySurveillanceCritical", () => {
  beforeEach(() => vi.clearAllMocks())

  it("notifies PO/SM once per report when a critical anomaly exists", async () => {
    const out = await notifySurveillanceCritical(project, report, [
      { severity: "warning", description: "slow" },
      { severity: "critical", description: "sprint overdue" },
    ] as never)
    expect(out).toBe(2)
    expect(nt.projectMemberIds).toHaveBeenCalledWith({ __prisma: true }, "p1", ["po", "sm"])
    expect(nt.notify).toHaveBeenCalledWith({ __prisma: true }, {
      recipientIds: ["u-po", "u-sm"],
      type: "surveillance_critical",
      projectId: "p1",
      entityType: "ai_report",
      entityId: "r1",
      payload: { reportId: "r1", title: "Report", projectName: "Proj", criticalCount: 1, anomalies: ["sprint overdue"] },
      dedupeKey: "surveillance_critical:r1",
    })
  })

  it("does nothing without critical anomalies", async () => {
    expect(await notifySurveillanceCritical(project, report, [{ severity: "warning", description: "x" }] as never)).toBe(0)
    expect(nt.notify).not.toHaveBeenCalled()
  })
})
