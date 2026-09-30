import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const trash = { listTrashedProjects: vi.fn() }
vi.mock("@/services/trash/trash.service", () => trash)
const projects = { restoreProject: vi.fn(), purgeProject: vi.fn() }
vi.mock("@/services/projects/projects.service", () => projects)

const { NotFoundError } = await import("@/services/_shared/errors")
const listRoute = await import("@/app/api/admin/trash/projects/route")
const itemRoute = await import("@/app/api/admin/trash/projects/[id]/route")
const restoreRoute = await import("@/app/api/admin/trash/projects/[id]/restore/route")

const BASE = "http://localhost/api/admin/trash/projects"
const idParams = (id = "p9") => ({ params: Promise.resolve({ id }) })
const ADMIN = { user: { id: "admin-1", name: "Admin", email: "a@example.com", role: "admin" } }
const MEMBER = { user: { id: "user-1", name: "U", email: "u@example.com", role: "member" } }

const ENDPOINTS: Array<[string, () => Promise<Response | undefined>]> = [
  ["GET list", () => listRoute.GET()],
  ["POST restore", () => restoreRoute.POST(new Request(`${BASE}/p9/restore`, { method: "POST" }), idParams())],
  ["DELETE purge", () => itemRoute.DELETE(new Request(`${BASE}/p9`, { method: "DELETE" }), idParams())],
]

const ALL = [trash.listTrashedProjects, projects.restoreProject, projects.purgeProject]

beforeEach(() => {
  authMock.mockReset().mockResolvedValue(ADMIN)
  for (const m of ALL) m.mockReset()
})

async function statusOf(p: Promise<Response | undefined>): Promise<number> {
  const res = await p
  if (!res) throw new Error("no response")
  return res.status
}

describe("admin trash routes — access control", () => {
  it.each(ENDPOINTS)("%s → 401 without a session", async (_n, invoke) => {
    authMock.mockResolvedValue(null)
    expect(await statusOf(invoke())).toBe(401)
    for (const m of ALL) expect(m).not.toHaveBeenCalled()
  })

  it.each(ENDPOINTS)("%s → 403 for a non-admin", async (_n, invoke) => {
    authMock.mockResolvedValue(MEMBER)
    expect(await statusOf(invoke())).toBe(403)
    for (const m of ALL) expect(m).not.toHaveBeenCalled()
  })
})

describe("admin trash routes", () => {
  it("lists trashed projects", async () => {
    const body = { retentionDays: 30, projects: [] }
    trash.listTrashedProjects.mockResolvedValue(body)
    const res = await listRoute.GET()
    expect(res?.status).toBe(200)
    expect(await res?.json()).toEqual(body)
  })

  it("restores with the admin as actor", async () => {
    projects.restoreProject.mockResolvedValue(undefined)
    expect(await statusOf(restoreRoute.POST(new Request(`${BASE}/p9/restore`, { method: "POST" }), idParams()))).toBe(200)
    expect(projects.restoreProject).toHaveBeenCalledWith("p9", { userId: "admin-1", userName: "Admin", systemRole: "admin" })
  })

  it("purges a trashed project and maps a live / missing one to 404", async () => {
    projects.purgeProject.mockResolvedValueOnce(undefined)
    expect(await statusOf(itemRoute.DELETE(new Request(`${BASE}/p9`, { method: "DELETE" }), idParams()))).toBe(200)
    expect(projects.purgeProject).toHaveBeenCalledWith("p9")
    projects.purgeProject.mockRejectedValueOnce(new NotFoundError())
    expect(await statusOf(itemRoute.DELETE(new Request(`${BASE}/p9`, { method: "DELETE" }), idParams()))).toBe(404)
  })

  it("returns 500 when listing fails", async () => {
    trash.listTrashedProjects.mockRejectedValue(new Error("db"))
    expect(await statusOf(listRoute.GET())).toBe(500)
  })
})
