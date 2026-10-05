import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, BASE, ctx, formReq, getReq, jsonReq } from "./a2-helpers"

/** マイルストーン・検収ボード routes: the real gate (auth + membership mocked), services mocked. */
const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  sectionFindFirst: vi.fn(),
  svc: { getBoard: vi.fn(), updateSettings: vi.fn(), tickCondition: vi.fn() },
  checks: { createCheck: vi.fn(), updateCheck: vi.fn(), deleteCheck: vi.fn() },
  punch: { createPunch: vi.fn(), updatePunch: vi.fn(), deletePunch: vi.fn(), uploadPunchPhoto: vi.fn(), getPunchPhoto: vi.fn(), deletePunchPhoto: vi.fn() },
  docs: { createDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn(), uploadDocumentFile: vi.fn(), getDocumentFile: vi.fn(), deleteDocumentFile: vi.fn() },
  budget: { createBudgetLine: vi.fn(), updateBudgetLine: vi.fn(), deleteBudgetLine: vi.fn(), createMetric: vi.fn(), updateMetric: vi.fn(), deleteMetric: vi.fn(), putMetricPoint: vi.fn() },
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => m.sectionFindFirst(...a) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/milestones/milestones.service", () => m.svc)
vi.mock("@/services/milestones/milestones.checks", () => m.checks)
vi.mock("@/services/milestones/milestones.punch", () => m.punch)
vi.mock("@/services/milestones/milestones.documents", () => m.docs)
vi.mock("@/services/milestones/milestones.budget", () => m.budget)

const board = await import("../milestones/route")
const settings = await import("../milestones/settings/route")
const checklist = await import("../milestones/stages/[planItemId]/checklist/route")
const checkList = await import("../milestones/checks/route")
const checkOne = await import("../milestones/checks/[checkId]/route")
const punchList = await import("../milestones/punch/route")
const punchOne = await import("../milestones/punch/[punchId]/route")
const punchPhotos = await import("../milestones/punch/[punchId]/photos/route")
const docOne = await import("../milestones/documents/[documentId]/route")
const budgetList = await import("../milestones/budget/route")
const points = await import("../milestones/metrics/[metricId]/points/route")
const { NotFoundError, ValidationError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const URL = `${BASE}/milestones`

beforeEach(() => {
  vi.clearAllMocks()
  m.svc.getBoard.mockResolvedValue({ stages: [], summary: {} })
  for (const fn of [m.checks.updateCheck, m.punch.createPunch, m.punch.updatePunch, m.docs.updateDocument, m.svc.tickCondition, m.budget.putMetricPoint, m.punch.uploadPunchPhoto]) fn.mockResolvedValue({ id: "x" })
})

describe("GET /milestones", () => {
  it("401 / 404 for no session / outsider; never reaches the service", async () => {
    asRole(m, "none")
    expect((await board.GET(getReq(), P)).status).toBe(401)
    asRole(m, "outsider")
    expect((await board.GET(getReq(), P)).status).toBe(404)
    expect(m.svc.getBoard).not.toHaveBeenCalled()
  })

  it("adds the viewer's permissions and id (dev: track only, SM: edit + track)", async () => {
    asRole(m, "dev")
    expect(await (await board.GET(getReq(), P)).json()).toMatchObject({ permissions: { canEdit: false, canTrack: true }, viewerId: "user-1" })
    asRole(m, "sm")
    expect(await (await board.GET(getReq(), P)).json()).toMatchObject({ permissions: { canEdit: true, canTrack: true } })
  })
})

describe("plan.write routes", () => {
  it("settings / new checks / budget lines: 403 for dev, 200 / 201 for SM", async () => {
    asRole(m, "dev")
    expect((await settings.PATCH(jsonReq("PATCH", { budgetEnabled: true }, URL), P)).status).toBe(403)
    expect((await checkList.POST(jsonReq("POST", { name: "能力" }, URL), P)).status).toBe(403)
    expect((await budgetList.POST(jsonReq("POST", { name: "本体" }, URL), P)).status).toBe(403)
    asRole(m, "sm")
    m.svc.updateSettings.mockResolvedValue({})
    m.checks.createCheck.mockResolvedValue({ id: "c1" })
    expect((await settings.PATCH(jsonReq("PATCH", { budgetEnabled: true }, URL), P)).status).toBe(200)
    expect((await checkList.POST(jsonReq("POST", { name: "能力", criterion: "CT 30秒" }, URL), P)).status).toBe(201)
    expect(m.checks.createCheck).toHaveBeenCalledWith("p1", { name: "能力", criterion: "CT 30秒" }, expect.objectContaining({ userId: "user-1" }))
  })

  it("400 for an empty settings body", async () => {
    asRole(m, "po")
    expect((await settings.PATCH(jsonReq("PATCH", {}, URL), P)).status).toBe(400)
  })
})

describe("milestone.track routes (any member)", () => {
  it("dev records a check result; a structure field needs plan.write (403)", async () => {
    asRole(m, "dev")
    const C = ctx({ projectId: "p1", checkId: "c1" })
    expect((await checkOne.PATCH(jsonReq("PATCH", { result: "passed", witness: "山田" }, URL), C)).status).toBe(200)
    expect(m.checks.updateCheck).toHaveBeenCalledWith("p1", "c1", { result: "passed", witness: "山田" }, expect.anything())
    expect((await checkOne.PATCH(jsonReq("PATCH", { result: "passed", name: "rename" }, URL), C)).status).toBe(403)
    expect((await checkOne.DELETE(getReq(), C)).status).toBe(403)
    expect(m.checks.deleteCheck).not.toHaveBeenCalled()
  })

  it("dev ticks a 完了条件, adds and works punch items, but cannot delete them", async () => {
    asRole(m, "dev")
    expect((await checklist.PUT(jsonReq("PUT", { label: "仕様書承認済み", checked: true }, URL), ctx({ projectId: "p1", planItemId: "s1" }))).status).toBe(200)
    expect((await punchList.POST(jsonReq("POST", { title: "ボルト不足" }, URL), P)).status).toBe(201)
    const PU = ctx({ projectId: "p1", punchId: "pu1" })
    expect((await punchOne.PATCH(jsonReq("PATCH", { status: "done" }, URL), PU)).status).toBe(200)
    expect((await punchOne.DELETE(getReq(), PU)).status).toBe(403)
  })

  it("documents: status by any member, renaming needs plan.write", async () => {
    asRole(m, "dev")
    const D = ctx({ projectId: "p1", documentId: "d1" })
    expect((await docOne.PATCH(jsonReq("PATCH", { status: "received" }, URL), D)).status).toBe(200)
    expect((await docOne.PATCH(jsonReq("PATCH", { name: "新しい名前" }, URL), D)).status).toBe(403)
  })

  it("photo upload passes the multipart file; metric values by any member", async () => {
    asRole(m, "dev")
    const form = new FormData()
    form.append("file", new File(["x"], "a.png", { type: "image/png" }))
    expect((await punchPhotos.POST(formReq(form, URL), ctx({ projectId: "p1", punchId: "pu1" }))).status).toBe(201)
    expect(m.punch.uploadPunchPhoto).toHaveBeenCalledWith("p1", "pu1", expect.any(File), expect.anything())
    expect((await points.PUT(jsonReq("PUT", { month: "2026-10", value: 1.2 }, URL), ctx({ projectId: "p1", metricId: "m1" }))).status).toBe(200)
  })

  it("400 for invalid input, 404 / 400 mapped from the service", async () => {
    asRole(m, "po")
    expect((await points.PUT(jsonReq("PUT", { month: "2026-13", value: 1 }, URL), ctx({ projectId: "p1", metricId: "m1" }))).status).toBe(400)
    expect((await checkOne.PATCH(jsonReq("PATCH", { result: "maybe" }, URL), ctx({ projectId: "p1", checkId: "c1" }))).status).toBe(400)
    m.punch.updatePunch.mockRejectedValueOnce(new NotFoundError("Not found"))
    expect((await punchOne.PATCH(jsonReq("PATCH", { status: "done" }, URL), ctx({ projectId: "p1", punchId: "zz" }))).status).toBe(404)
    m.punch.createPunch.mockRejectedValueOnce(new ValidationError("x", {}, "MILESTONE_LIMIT_REACHED"))
    const res = await punchList.POST(jsonReq("POST", { title: "t" }, URL), P)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: "MILESTONE_LIMIT_REACHED" })
  })
})
