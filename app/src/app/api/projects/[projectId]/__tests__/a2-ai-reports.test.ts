import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  sectionFindFirst: vi.fn(),
  aiReportFindMany: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => m.sectionFindFirst(...a) },
    aiReport: { findMany: (...a: unknown[]) => m.aiReportFindMany(...a) },
  },
}))

const { GET } = await import("../ai-reports/route")
const P = ctx({ projectId: "p1" })

describe("GET /ai-reports", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.sectionFindFirst.mockResolvedValue(null)
  })

  it("401 without session", async () => {
    asRole(m, "none")
    expect((await GET(getReq(), P)).status).toBe(401)
    expect(m.aiReportFindMany).not.toHaveBeenCalled()
  })

  it("404 for non-member", async () => {
    asRole(m, "outsider")
    expect((await GET(getReq(), P)).status).toBe(404)
    expect(m.aiReportFindMany).not.toHaveBeenCalled()
  })

  it("lets a section manager of the project read (project.view)", async () => {
    m.authMock.mockResolvedValue({ user: { id: "sm-1", role: "section_manager" } })
    m.memberFindFirst.mockResolvedValue(null)
    m.sectionFindFirst.mockResolvedValue({ sectionId: "s1" })
    m.aiReportFindMany.mockResolvedValue([])
    const res = await GET(getReq(), P)
    expect(res.status).toBe(200)
  })

  it("returns the latest reports scoped to the project", async () => {
    asRole(m, "dev")
    m.aiReportFindMany.mockResolvedValue([{ id: "r1", trigger: "daily" }])
    const res = await GET(getReq(), P)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: "r1", trigger: "daily" }])
    const arg = m.aiReportFindMany.mock.calls[0][0] as { where: { projectId: string } }
    expect(arg.where.projectId).toBe("p1")
  })

  it("500 on failure", async () => {
    asRole(m, "dev")
    m.aiReportFindMany.mockRejectedValue(new Error("x"))
    const res = await GET(getReq(), P)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "取得に失敗しました", code: "INTERNAL" })
  })
})
