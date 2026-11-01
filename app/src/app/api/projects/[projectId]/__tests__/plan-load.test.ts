import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, jsonReq } from "./a2-helpers"

const m = vi.hoisted(() => ({ authMock: vi.fn(), memberFindFirst: vi.fn(), loadBaseSchedule: vi.fn() }))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/plan/plan.base-schedule", () => ({ loadBaseSchedule: m.loadBaseSchedule }))

const route = await import("../plan/load/route")
const { ValidationError, ConflictError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const BODY = { startDate: "2026-11-02", schedule: { items: [{ key: "a", name: "A", durationDays: 3 }] } }

describe("POST /plan/load (W12)", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("needs plan.write: a developer gets 403, an outsider 404; nothing is written", async () => {
    asRole(m, "dev")
    expect((await route.POST(jsonReq("POST", BODY), P)).status).toBe(403)
    asRole(m, "outsider")
    expect((await route.POST(jsonReq("POST", BODY), P)).status).toBe(404)
    expect(m.loadBaseSchedule).not.toHaveBeenCalled()
  })

  it("PO / SM load the schedule → 201 with the result", async () => {
    m.loadBaseSchedule.mockResolvedValue({ createdCount: 1, dependencyCount: 0, rootIds: ["n1"], plannedStart: "2026-11-02", plannedEnd: "2026-11-04" })
    asRole(m, "sm")
    const res = await route.POST(jsonReq("POST", BODY), P)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ createdCount: 1, rootIds: ["n1"] })
    expect(m.loadBaseSchedule).toHaveBeenCalledWith("p1", BODY, expect.objectContaining({ userId: "user-1" }))
  })

  it("passes proposalId through; a repeated load is 409 PLAN_ALREADY_LOADED", async () => {
    asRole(m, "po")
    m.loadBaseSchedule.mockRejectedValue(new ConflictError("dup", {}, "PLAN_ALREADY_LOADED"))
    const res = await route.POST(jsonReq("POST", { ...BODY, proposalId: "prop_plan_x" }), P)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("PLAN_ALREADY_LOADED")
    expect(m.loadBaseSchedule).toHaveBeenCalledWith("p1", { ...BODY, proposalId: "prop_plan_x" }, expect.anything())
  })

  it("validates the body (bad date, no items, over 500 items) → 400, and maps schedule errors with their code", async () => {
    asRole(m, "po")
    expect((await route.POST(jsonReq("POST", { ...BODY, startDate: "soon" }), P)).status).toBe(400)
    expect((await route.POST(jsonReq("POST", { startDate: "2026-11-02", schedule: { items: [] } }), P)).status).toBe(400)
    const many = Array.from({ length: 501 }, (_, i) => ({ key: `k${i}`, name: "x" }))
    expect((await route.POST(jsonReq("POST", { startDate: "2026-11-02", schedule: { items: many } }), P)).status).toBe(400)
    m.loadBaseSchedule.mockRejectedValue(new ValidationError("cycle", {}, "PLAN_SCHEDULE_INVALID"))
    const res = await route.POST(jsonReq("POST", BODY), P)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("PLAN_SCHEDULE_INVALID")
  })
})
