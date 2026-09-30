import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const memberFindFirst = vi.fn()
const projectSectionFindFirst = vi.fn()
const projectFindFirst = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => projectSectionFindFirst(...a) },
    project: { findFirst: (...a: unknown[]) => projectFindFirst(...a) },
  },
}))

const { requireProject } = await import("@/lib/authz/require-project")
const { requireProjectMember, requireProjectAccess } = await import("@/lib/api-helpers")

function session(role: string) {
  return { user: { id: "user-1", name: "U", email: "u@example.com", role } }
}

async function bodyOf(result: { error: Response } | object): Promise<unknown> {
  return "error" in result ? (result.error as Response).json() : null
}

async function statusOf(result: { error: Response } | object): Promise<number | "ok"> {
  return "error" in result ? (result.error as Response).status : "ok"
}

describe("requireProject", () => {
  beforeEach(() => {
    authMock.mockReset()
    memberFindFirst.mockReset().mockResolvedValue(null)
    projectSectionFindFirst.mockReset().mockResolvedValue(null)
    projectFindFirst.mockReset().mockResolvedValue({ id: "p1" })
  })

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null)
    const res = await requireProject("p1", "project.view")
    expect(await statusOf(res)).toBe(401)
    expect(await bodyOf(res)).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" })
    expect(memberFindFirst).not.toHaveBeenCalled()
  })

  it("returns 404 for a non-member (hides project existence)", async () => {
    authMock.mockResolvedValue(session("member"))
    const res = await requireProject("p1", "project.view")
    expect(await statusOf(res)).toBe(404)
    expect(await bodyOf(res)).toEqual({ error: "Not found", code: "NOT_FOUND" })
  })

  it("returns 404 for a section manager of an unrelated section", async () => {
    authMock.mockResolvedValue(session("section_manager"))
    const res = await requireProject("p1", "project.view")
    expect(await statusOf(res)).toBe(404)
    expect(projectSectionFindFirst).toHaveBeenCalledWith({
      where: { projectId: "p1", section: { users: { some: { userId: "user-1" } } } },
      select: { sectionId: true },
    })
  })

  it("returns 403 for a member lacking the role", async () => {
    authMock.mockResolvedValue(session("member"))
    memberFindFirst.mockResolvedValue({ role: "dev" })
    const res = await requireProject("p1", "backlog.write")
    expect(await statusOf(res)).toBe(403)
    expect(await bodyOf(res)).toEqual({ error: "権限がありません", code: "FORBIDDEN" })
  })

  it("returns session, actor and via for an allowed member", async () => {
    authMock.mockResolvedValue(session("member"))
    memberFindFirst.mockResolvedValue({ role: "sm" })
    const res = await requireProject("p1", "sprint.manage")
    if ("error" in res) throw new Error("expected success")
    expect(res.via).toBe("member")
    expect(res.session.user.id).toBe("user-1")
    expect(res.actor).toEqual({
      userId: "user-1",
      systemRole: "member",
      projectRole: "sm",
      isSectionManagerOfProject: false,
    })
    expect(projectSectionFindFirst).not.toHaveBeenCalled()
  })

  it("lets admins through with only the project liveness lookup", async () => {
    authMock.mockResolvedValue(session("admin"))
    const res = await requireProject("p1", "project.delete")
    expect(await statusOf(res)).toBe("ok")
    expect(memberFindFirst).not.toHaveBeenCalled()
    expect(projectFindFirst).toHaveBeenCalledWith({ where: { id: "p1", deletedAt: null }, select: { id: true } })
  })

  it("returns 404 for a member when the project is in the trash (or missing)", async () => {
    authMock.mockResolvedValue(session("member"))
    memberFindFirst.mockResolvedValue({ role: "po" })
    projectFindFirst.mockResolvedValue(null)
    const res = await requireProject("p1", "project.view")
    expect(await statusOf(res)).toBe(404)
    expect(await bodyOf(res)).toEqual({ error: "Not found", code: "NOT_FOUND" })
  })

  it("returns 404 for an admin too when the project is in the trash", async () => {
    authMock.mockResolvedValue(session("admin"))
    projectFindFirst.mockResolvedValue(null)
    expect(await statusOf(await requireProject("p1", "project.view"))).toBe(404)
  })

  it("allows trash.manage for PO / SM and trash.purge for PO only", async () => {
    authMock.mockResolvedValue(session("member"))
    memberFindFirst.mockResolvedValue({ role: "sm" })
    expect(await statusOf(await requireProject("p1", "trash.manage"))).toBe("ok")
    expect(await statusOf(await requireProject("p1", "trash.purge"))).toBe(403)
    memberFindFirst.mockResolvedValue({ role: "po" })
    expect(await statusOf(await requireProject("p1", "trash.purge"))).toBe("ok")
  })

  it("lets a section manager read and write Icebox but not the backlog", async () => {
    authMock.mockResolvedValue(session("section_manager"))
    projectSectionFindFirst.mockResolvedValue({ sectionId: "s1" })
    const view = await requireProject("p1", "project.view")
    expect(await statusOf(view)).toBe("ok")
    if (!("error" in view)) expect(view.via).toBe("section_manager")
    expect(await statusOf(await requireProject("p1", "icebox.write"))).toBe("ok")
    expect(await statusOf(await requireProject("p1", "backlog.write"))).toBe(403)
  })
})

describe("legacy wrappers", () => {
  beforeEach(() => {
    authMock.mockReset()
    memberFindFirst.mockReset().mockResolvedValue(null)
    projectSectionFindFirst.mockReset().mockResolvedValue(null)
    projectFindFirst.mockReset().mockResolvedValue({ id: "p1" })
  })

  it("requireProjectMember gives admins a synthetic PO membership", async () => {
    authMock.mockResolvedValue(session("admin"))
    const res = await requireProjectMember("p1", { roles: ["po"] })
    if ("error" in res) throw new Error("expected success")
    expect(res.member.role).toBe("po")
  })

  it("requireProjectMember enforces roles with 403", async () => {
    authMock.mockResolvedValue(session("member"))
    memberFindFirst.mockResolvedValue({ role: "dev" })
    expect(await statusOf(await requireProjectMember("p1", { roles: ["po", "sm"] }))).toBe(403)
    expect(await statusOf(await requireProjectMember("p1"))).toBe("ok")
  })

  it("requireProjectMember refuses section managers who are not members", async () => {
    authMock.mockResolvedValue(session("section_manager"))
    projectSectionFindFirst.mockResolvedValue({ sectionId: "s1" })
    expect(await statusOf(await requireProjectMember("p1"))).toBe(403)
  })

  it("requireProjectAccess maps legacy scopes", async () => {
    authMock.mockResolvedValue(session("section_manager"))
    projectSectionFindFirst.mockResolvedValue({ sectionId: "s1" })
    const read = await requireProjectAccess("p1", "read")
    if ("error" in read) throw new Error("expected success")
    expect(read).toMatchObject({ member: null, via: "section_manager" })
    expect(await statusOf(await requireProjectAccess("p1", "icebox"))).toBe("ok")
    expect(await statusOf(await requireProjectAccess("p1", "memberWrite"))).toBe(403)
    expect(await statusOf(await requireProjectAccess("p1", "po"))).toBe(403)
  })
})
