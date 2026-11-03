import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  createRun: vi.fn(),
  readRunCard: vi.fn(),
  readRunEvidence: vi.fn(),
  recordFeedback: vi.fn(),
  loadEstimateRun: vi.fn(),
  loadBaseSchedule: vi.fn(),
  loadVisibleTemplate: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/plan-estimate-run/estimate-run.service", () => ({
  createRun: m.createRun,
  readRunCard: m.readRunCard,
  readRunEvidence: m.readRunEvidence,
  recordFeedback: m.recordFeedback,
  loadEstimateRun: m.loadEstimateRun,
  REMOVED_OWNER_KEYS_MAX: 500,
}))
vi.mock("@/services/plan/plan.base-schedule", () => ({ loadBaseSchedule: m.loadBaseSchedule }))
vi.mock("@/services/plan-templates/plan-templates.service", () => ({ loadVisibleTemplate: m.loadVisibleTemplate }))

const runs = await import("../plan/estimate-runs/route")
const card = await import("../plan/estimate-runs/[runId]/route")
const evidence = await import("../plan/estimate-runs/[runId]/evidence/route")
const feedback = await import("../plan/estimate-runs/[runId]/feedback/route")
const load = await import("../plan/load/route")

const P = ctx({ projectId: "p1" })
const R = ctx({ projectId: "p1", runId: "r1" })
const SCHEDULE = { items: [{ key: "a", name: "A", durationDays: 2 }] }

describe("計画を作る routes (plan.estimate)", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("PO / SM may make and read runs; a dev and an outsider may not", async () => {
    for (const role of ["dev", "outsider"] as const) {
      asRole(m, role)
      expect((await runs.POST(jsonReq("POST", { startDate: "2026-11-09", templateId: "t1" }), P)).status).toBeGreaterThanOrEqual(403)
      expect((await card.GET(getReq(), R)).status).toBeGreaterThanOrEqual(403)
      expect((await evidence.GET(getReq(), R)).status).toBeGreaterThanOrEqual(403)
      expect((await feedback.POST(jsonReq("POST", { key: "a", kind: "too_high" }), R)).status).toBeGreaterThanOrEqual(403)
    }
    expect(m.createRun).not.toHaveBeenCalled()
    asRole(m, "po")
    m.createRun.mockResolvedValue({ runId: "r1", expiresAt: "x", summary: {} })
    expect((await runs.POST(jsonReq("POST", { startDate: "2026-11-09", templateId: "t1", roleAssignments: { dev: ["u2"] } }), P)).status).toBe(201)
    // A private template is checked for the caller before anything is computed.
    expect(m.loadVisibleTemplate).toHaveBeenCalledWith(expect.anything(), "t1", expect.objectContaining({ userId: "user-1" }))
    expect(m.createRun).toHaveBeenCalledWith("p1", { startDate: "2026-11-09", skipWeekends: false, roleAssignments: { dev: ["u2"] }, source: { kind: "template", templateId: "t1" } }, expect.objectContaining({ userId: "user-1" }))
  })

  it("a run is made from exactly one of a template and a schedule; unknown fields are refused", async () => {
    asRole(m, "po")
    expect((await runs.POST(jsonReq("POST", { startDate: "2026-11-09" }), P)).status).toBe(400)
    expect((await runs.POST(jsonReq("POST", { startDate: "2026-11-09", templateId: "t1", schedule: SCHEDULE }), P)).status).toBe(400)
    expect((await runs.POST(jsonReq("POST", { startDate: "2026-11-09", templateId: "t1", owners: { a: "u2" } }), P)).status).toBe(400)
    expect(m.createRun).not.toHaveBeenCalled()
  })

  it("external_schedule_owner_id_ignored: an ownerId inside a schedule item never reaches the run", async () => {
    asRole(m, "po")
    m.createRun.mockResolvedValue({ runId: "r1", expiresAt: "x", summary: {} })
    await runs.POST(jsonReq("POST", { startDate: "2026-11-09", schedule: { items: [{ key: "a", name: "A", ownerId: "u9" }] } }), P)
    const source = m.createRun.mock.calls[0][1].source
    expect(source.schedule.items[0]).toEqual({ key: "a", name: "A" })
    expect(JSON.stringify(m.createRun.mock.calls[0])).not.toContain("u9")
  })

  it("per_person_parts_need_view_member_load: the route passes the reader's right to the service", async () => {
    asRole(m, "po")
    m.readRunCard.mockResolvedValue({ runId: "r1" })
    await card.GET(getReq(), R)
    expect(m.readRunCard).toHaveBeenCalledWith("p1", "r1", expect.objectContaining({ userId: "user-1", canViewMemberLoad: true }))
  })

  it("feedback takes a known kind and at most 500 characters", async () => {
    asRole(m, "sm")
    m.recordFeedback.mockResolvedValue({ id: "f1" })
    expect((await feedback.POST(jsonReq("POST", { key: "a", kind: "too_high", note: "x".repeat(500) }), R)).status).toBe(201)
    expect((await feedback.POST(jsonReq("POST", { key: "a", kind: "nonsense" }), R)).status).toBe(400)
    expect((await feedback.POST(jsonReq("POST", { key: "a", kind: "other", note: "x".repeat(501) }), R)).status).toBe(400)
  })
})

describe("/plan/load with an estimate run", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("needs plan.write AND plan.estimate; reads only { estimateRunId, removedOwnerKeys }", async () => {
    asRole(m, "po")
    m.loadEstimateRun.mockResolvedValue({ createdCount: 1 })
    expect((await load.POST(jsonReq("POST", { estimateRunId: "r1", removedOwnerKeys: ["a"] }), P)).status).toBe(201)
    expect(m.loadEstimateRun).toHaveBeenCalledWith("p1", "r1", ["a"], expect.objectContaining({ userId: "user-1" }), { canViewMemberLoad: true })
    expect(m.loadBaseSchedule).not.toHaveBeenCalled()
    asRole(m, "dev")
    expect((await load.POST(jsonReq("POST", { estimateRunId: "r1" }), P)).status).toBe(403)
  })

  it("card_cannot_add_owners: a schedule, an owner map or any other field next to estimateRunId is refused", async () => {
    asRole(m, "po")
    for (const body of [
      { estimateRunId: "r1", schedule: SCHEDULE, startDate: "2026-11-09" },
      { estimateRunId: "r1", owners: { a: "u2" } },
      { estimateRunId: "r1", addedOwners: { a: "u2" } },
      { estimateRunId: "r1", removedOwnerKeys: ["bad key"] },
    ]) {
      expect((await load.POST(jsonReq("POST", body), P)).status).toBe(400)
    }
    expect(m.loadEstimateRun).not.toHaveBeenCalled()
  })

  it("a plain base schedule still loads the old way", async () => {
    asRole(m, "po")
    m.loadBaseSchedule.mockResolvedValue({ createdCount: 1 })
    expect((await load.POST(jsonReq("POST", { startDate: "2026-11-09", schedule: SCHEDULE }), P)).status).toBe(201)
    expect(m.loadEstimateRun).not.toHaveBeenCalled()
  })
})
