import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq, session } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  previewActuals: vi.fn(),
  listSnapshots: vi.fn(),
  finalizeActuals: vi.fn(),
  snapshotItems: vi.fn(),
  setIncludeInLearning: vi.fn(),
  pseudonymizeActuals: vi.fn(),
  listAttributes: vi.fn(),
  replaceAttributes: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/plan-actuals/actuals.service", () => ({
  previewActuals: m.previewActuals,
  listSnapshots: m.listSnapshots,
  finalizeActuals: m.finalizeActuals,
  snapshotItems: m.snapshotItems,
  setIncludeInLearning: m.setIncludeInLearning,
  pseudonymizeActuals: m.pseudonymizeActuals,
}))
vi.mock("@/services/plan-actuals/attributes.service", () => ({ listAttributes: m.listAttributes, replaceAttributes: m.replaceAttributes }))

const actuals = await import("../plan/actuals/route")
const snapshot = await import("../plan/actuals/[snapshotId]/route")
const attributes = await import("../attributes/route")
const pseudonymize = await import("../../../admin/plan-actuals/pseudonymize/route")
const { ValidationError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const S = ctx({ projectId: "p1", snapshotId: "s1" })

describe("actuals routes (plan 12 E1)", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("GET needs project.view and says whether the viewer may finalize", async () => {
    m.previewActuals.mockResolvedValue({ leafCount: 0, completeCount: 0, repoCount: 0, issues: [] })
    m.listSnapshots.mockResolvedValue([])
    asRole(m, "dev")
    const res = await actuals.GET(getReq(), P)
    expect(res.status).toBe(200)
    expect((await res.json()).permissions).toEqual({ finalize: false })
    asRole(m, "sm")
    expect((await (await actuals.GET(getReq(), P)).json()).permissions).toEqual({ finalize: true })
    asRole(m, "outsider")
    expect((await actuals.GET(getReq(), P)).status).toBe(404)
  })

  it("finalize: plan.actualsFinalize allow (PO / SM) / deny (dev); unacknowledged issues are 400 with the list", async () => {
    asRole(m, "dev")
    expect((await actuals.POST(jsonReq("POST", {}), P)).status).toBe(403)
    expect(m.finalizeActuals).not.toHaveBeenCalled()
    asRole(m, "po")
    m.finalizeActuals.mockRejectedValue(new ValidationError("x", { issues: [{ planItemId: "a", kind: "missing_actual" }] }, "PLAN_ACTUALS_INCOMPLETE"))
    const res = await actuals.POST(jsonReq("POST", {}), P)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: "PLAN_ACTUALS_INCOMPLETE", issues: [{ kind: "missing_actual" }] })
    m.finalizeActuals.mockResolvedValue({ id: "s1" })
    expect((await actuals.POST(jsonReq("POST", { acknowledgedIssueCount: 1 }), P)).status).toBe(201)
    expect(m.finalizeActuals).toHaveBeenLastCalledWith("p1", { acknowledgedIssueCount: 1 }, expect.objectContaining({ userId: "user-1" }))
    expect((await actuals.POST(jsonReq("POST", { acknowledgedIssueCount: "1" }), P)).status).toBe(400)
  })

  it("include_in_learning_toggle_requires_actuals_finalize, with a reason", async () => {
    asRole(m, "dev")
    expect((await snapshot.PATCH(jsonReq("PATCH", { includeInLearning: false, reason: "r", version: 0 }), S)).status).toBe(403)
    asRole(m, "po")
    expect((await snapshot.PATCH(jsonReq("PATCH", { includeInLearning: false, version: 0 }), S)).status).toBe(400)
    expect((await snapshot.PATCH(jsonReq("PATCH", { includeInLearning: false, reason: "  ", version: 0 }), S)).status).toBe(400)
    m.setIncludeInLearning.mockResolvedValue({ id: "s1", includeInLearning: false })
    expect((await snapshot.PATCH(jsonReq("PATCH", { includeInLearning: false, reason: "進め方が特殊", version: 0 }), S)).status).toBe(200)
  })

  it("repository paths in the preview go only to those who may finalize", async () => {
    m.previewActuals.mockResolvedValue({ leafCount: 1, completeCount: 0, repoCount: 1, issues: [{ kind: "repository_unreadable", repositoryRef: "group/secret-repo" }] })
    m.listSnapshots.mockResolvedValue([])
    asRole(m, "dev")
    expect((await (await actuals.GET(getReq(), P)).json()).preview.issues).toEqual([{ kind: "repository_unreadable", repositoryRef: "" }])
    asRole(m, "po")
    expect((await (await actuals.GET(getReq(), P)).json()).preview.issues).toEqual([{ kind: "repository_unreadable", repositoryRef: "group/secret-repo" }])
  })

  it("snapshot items are readable with project.view", async () => {
    m.snapshotItems.mockResolvedValue([])
    asRole(m, "dev")
    expect((await snapshot.GET(getReq(), S)).status).toBe(200)
  })

  it("project attributes: project.view reads, project.update (PO / SM) replaces", async () => {
    m.listAttributes.mockResolvedValue([])
    asRole(m, "dev")
    expect((await attributes.GET(getReq(), P)).status).toBe(200)
    expect((await attributes.PUT(jsonReq("PUT", { attributes: [] }), P)).status).toBe(403)
    asRole(m, "po")
    m.replaceAttributes.mockResolvedValue([{ kind: "equipment", ref: "press-3" }])
    expect((await attributes.PUT(jsonReq("PUT", { attributes: [{ kind: "equipment", ref: "press-3" }] }), P)).status).toBe(200)
    expect((await attributes.PUT(jsonReq("PUT", { attributes: [{ kind: "colour", ref: "x" }] }), P)).status).toBe(400)
  })
})

describe("admin pseudonymize (pseudonymize_denied_for_non_admin)", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it.each(["member", "section_manager"])("a %s gets 403 and nothing changes", async (role) => {
    m.authMock.mockResolvedValue(session(role))
    expect((await pseudonymize.POST(jsonReq("POST", { userId: "u1", reason: "退職" }))).status).toBe(403)
    expect(m.pseudonymizeActuals).not.toHaveBeenCalled()
  })

  it("an admin pseudonymises by retired user or by snapshot; anything else is 400", async () => {
    m.authMock.mockResolvedValue(session("admin"))
    m.pseudonymizeActuals.mockResolvedValue({ updated: 2 })
    expect((await pseudonymize.POST(jsonReq("POST", { userId: "u1", reason: "退職" }))).status).toBe(200)
    expect((await pseudonymize.POST(jsonReq("POST", { snapshotId: "s1", reason: "保持期間" }))).status).toBe(200)
    expect((await pseudonymize.POST(jsonReq("POST", { userId: "u1", snapshotId: "s1", reason: "x" }))).status).toBe(400)
  })
})
