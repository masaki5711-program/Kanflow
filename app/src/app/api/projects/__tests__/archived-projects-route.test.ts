import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
const listArchivedProjects = vi.fn()
vi.mock("@/services/projects/project-list", () => ({ listArchivedProjects: (...a: unknown[]) => listArchivedProjects(...a) }))

const { GET } = await import("@/app/api/projects/archived/route")

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "user-1", name: "Taro", role: "section_manager" } })
  listArchivedProjects.mockReset()
})

describe("GET /api/projects/archived", () => {
  it("401s without a session", async () => {
    authMock.mockResolvedValue(null)
    const res = (await GET())!
    expect(res.status).toBe(401)
    expect(listArchivedProjects).not.toHaveBeenCalled()
  })

  it("lists the caller's archived projects (scope from the session, not the request)", async () => {
    listArchivedProjects.mockResolvedValue([{ id: "p9" }])
    const res = (await GET())!
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [{ id: "p9" }] })
    expect(listArchivedProjects).toHaveBeenCalledWith({ id: "user-1", role: "section_manager" })
  })

  it("maps failures to 500", async () => {
    listArchivedProjects.mockRejectedValue(new Error("db down"))
    expect((await GET())!.status).toBe(500)
  })
})
