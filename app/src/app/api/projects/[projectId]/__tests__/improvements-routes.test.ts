import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, BASE, ctx, formReq, getReq, jsonReq } from "./a2-helpers"

/** 改善成果ボード routes: the real gate (auth + membership mocked), services mocked. */
const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  sectionFindFirst: vi.fn(),
  svc: {
    getBoard: vi.fn(),
    getSummary: vi.fn(),
    getImprovement: vi.fn(),
    updateImprovement: vi.fn(),
    deleteImprovement: vi.fn(),
  },
  rollouts: { addRollout: vi.fn(), updateRollout: vi.fn(), removeRollout: vi.fn(), reorderRollouts: vi.fn() },
  checks: { addCustomCheck: vi.fn(), recordCheck: vi.fn(), deleteCheck: vi.fn() },
  photos: { listPhotos: vi.fn(), uploadPhoto: vi.fn(), getPhoto: vi.fn(), deletePhoto: vi.fn() },
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => m.sectionFindFirst(...a) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/improvements/improvements.service", () => m.svc)
vi.mock("@/services/improvements/improvements.rollouts", () => m.rollouts)
vi.mock("@/services/improvements/improvements.checks", () => m.checks)
vi.mock("@/services/improvements/improvements.photos", () => m.photos)

const board = await import("../improvements/route")
const item = await import("../improvements/[id]/route")
const rolloutList = await import("../improvements/[id]/rollouts/route")
const rolloutOne = await import("../improvements/[id]/rollouts/[rolloutId]/route")
const checkOne = await import("../improvements/[id]/checks/[checkId]/route")
const photoList = await import("../improvements/[id]/photos/route")
const { NotFoundError, ValidationError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const PI = ctx({ projectId: "p1", id: "r1" })
const PIR = ctx({ projectId: "p1", id: "r1", rolloutId: "ro1" })
const PIC = ctx({ projectId: "p1", id: "r1", checkId: "c1" })
const URL = `${BASE}/improvements/r1`

beforeEach(() => {
  vi.clearAllMocks()
  m.svc.getBoard.mockResolvedValue({ items: [], summary: {}, rolloutNames: [] })
  m.svc.updateImprovement.mockResolvedValue({ id: "r1" })
  m.rollouts.updateRollout.mockResolvedValue({ id: "ro1" })
  m.rollouts.addRollout.mockResolvedValue({ id: "ro2" })
  m.checks.recordCheck.mockResolvedValue({ id: "c1" })
})

describe("GET /improvements", () => {
  it("401 / 404 for no session / outsider", async () => {
    asRole(m, "none")
    expect((await board.GET(getReq(), P)).status).toBe(401)
    asRole(m, "outsider")
    expect((await board.GET(getReq(), P)).status).toBe(404)
    expect(m.svc.getBoard).not.toHaveBeenCalled()
  })

  it("adds the viewer's permissions (dev: track only, PO: both)", async () => {
    asRole(m, "dev")
    expect(await (await board.GET(getReq(), P)).json()).toMatchObject({ permissions: { canManage: false, canTrack: true } })
    asRole(m, "po")
    expect(await (await board.GET(getReq(), P)).json()).toMatchObject({ permissions: { canManage: true, canTrack: true } })
  })
})

describe("PATCH /improvements/[id]", () => {
  it("PO only: 403 for SM / dev", async () => {
    for (const role of ["sm", "dev"] as const) {
      asRole(m, role)
      expect((await item.PATCH(jsonReq("PATCH", { metricName: "x" }, URL), PI)).status).toBe(403)
    }
    expect(m.svc.updateImprovement).not.toHaveBeenCalled()
  })

  it("happy path passes the parsed input and the actor", async () => {
    asRole(m, "po")
    const res = await item.PATCH(jsonReq("PATCH", { baselineValue: 60, resultValue: 30, kaizenStage: "measuring" }, URL), PI)
    expect(res.status).toBe(200)
    expect(m.svc.updateImprovement).toHaveBeenCalledWith("p1", "r1", { baselineValue: 60, resultValue: 30, kaizenStage: "measuring" }, expect.objectContaining({ userId: "user-1" }))
  })

  it("400 for invalid input and for a stage guard; 404 from the service", async () => {
    asRole(m, "po")
    expect((await item.PATCH(jsonReq("PATCH", { metricUnit: "x".repeat(21) }, URL), PI)).status).toBe(400)
    m.svc.updateImprovement.mockRejectedValueOnce(new ValidationError("x", {}, "IMPROVEMENT_NEEDS_STANDARD"))
    const guarded = await item.PATCH(jsonReq("PATCH", { kaizenStage: "standardized" }, URL), PI)
    expect(guarded.status).toBe(400)
    expect(await guarded.json()).toMatchObject({ code: "IMPROVEMENT_NEEDS_STANDARD" })
    m.svc.updateImprovement.mockRejectedValueOnce(new NotFoundError())
    expect((await item.PATCH(jsonReq("PATCH", { metricName: "x" }, URL), PI)).status).toBe(404)
  })

  it("DELETE is PO only", async () => {
    asRole(m, "dev")
    expect((await item.DELETE(getReq(URL), PI)).status).toBe(403)
    asRole(m, "po")
    expect((await item.DELETE(getReq(URL), PI)).status).toBe(200)
    expect(m.svc.deleteImprovement).toHaveBeenCalledWith("p1", "r1", expect.anything())
  })
})

describe("rollouts", () => {
  it("adding a target is PO only", async () => {
    asRole(m, "dev")
    expect((await rolloutList.POST(jsonReq("POST", { targetName: "Line 2" }), PI)).status).toBe(403)
    asRole(m, "po")
    expect((await rolloutList.POST(jsonReq("POST", { targetName: "Line 2" }), PI)).status).toBe(201)
  })

  it("a dev may change the status but not rename", async () => {
    asRole(m, "dev")
    expect((await rolloutOne.PATCH(jsonReq("PATCH", { status: "done" }), PIR)).status).toBe(200)
    expect(m.rollouts.updateRollout).toHaveBeenCalledWith("p1", "r1", "ro1", { status: "done" }, expect.anything())
    expect((await rolloutOne.PATCH(jsonReq("PATCH", { targetName: "New" }), PIR)).status).toBe(403)
    expect((await rolloutOne.DELETE(getReq(), PIR)).status).toBe(403)
  })

  it("a section manager without membership cannot change a status", async () => {
    m.authMock.mockResolvedValue({ user: { id: "sec", name: "S", role: "section_manager" } })
    m.memberFindFirst.mockResolvedValue(null)
    m.sectionFindFirst.mockResolvedValue({ sectionId: "s1" })
    expect((await rolloutOne.PATCH(jsonReq("PATCH", { status: "done" }), PIR)).status).toBe(403)
    expect((await board.GET(getReq(), P)).status).toBe(200)
  })
})

describe("checks and photos", () => {
  it("a dev records a 定着確認 result; deleting a check is PO only", async () => {
    asRole(m, "dev")
    const res = await checkOne.PATCH(jsonReq("PATCH", { result: "sustained", note: "OK" }), PIC)
    expect(res.status).toBe(200)
    expect(m.checks.recordCheck).toHaveBeenCalledWith("p1", "r1", "c1", { result: "sustained", note: "OK" }, expect.objectContaining({ userId: "user-1" }))
    expect((await checkOne.PATCH(jsonReq("PATCH", { result: "maybe" }), PIC)).status).toBe(400)
    expect((await checkOne.DELETE(getReq(), PIC)).status).toBe(403)
  })

  it("photo upload needs a valid phase and passes the file", async () => {
    asRole(m, "dev")
    m.photos.uploadPhoto.mockResolvedValue({ id: "ph1" })
    const fd = new FormData()
    fd.set("phase", "after")
    fd.set("file", new File(["x"], "a.png", { type: "image/png" }))
    expect((await photoList.POST(formReq(fd), PI)).status).toBe(201)
    expect(m.photos.uploadPhoto).toHaveBeenCalledWith("p1", "r1", "after", expect.any(File), expect.anything())
    const bad = new FormData()
    bad.set("phase", "during")
    expect((await photoList.POST(formReq(bad), PI)).status).toBe(400)
  })
})
