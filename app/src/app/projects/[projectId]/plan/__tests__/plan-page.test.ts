import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  memberFind: vi.fn(),
  projectFind: vi.fn(),
  userSectionFind: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: m.memberFind },
    project: { findUnique: m.projectFind },
    userSection: { findFirst: m.userSectionFind },
  },
}))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) },
  notFound: () => { throw new Error("NOT_FOUND") },
}))
vi.mock("../plan-content", () => ({ PlanContent: () => null }))

const { default: PlanPage } = await import("../page")
const params = Promise.resolve({ projectId: "p1" })
const run = () => PlanPage({ params }) as Promise<ReactElement<{ projectId: string; canEdit: boolean }>>
const session = (role: string) => ({ user: { id: "u1", role } })

describe("PlanPage (server)", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
  })

  it("redirects to /login without a session", async () => {
    m.auth.mockResolvedValue(null)
    await expect(run()).rejects.toThrow("REDIRECT:/login")
  })

  it.each([
    ["po", true],
    ["sm", true],
    ["dev", false],
  ])("member with role %s → canEdit=%s", async (role, canEdit) => {
    m.auth.mockResolvedValue(session("user"))
    m.memberFind.mockResolvedValue({ role })
    const el = await run()
    expect(el.props).toEqual({ projectId: "p1", canEdit })
  })

  it("admin without membership can edit", async () => {
    m.auth.mockResolvedValue(session("admin"))
    m.memberFind.mockResolvedValue(null)
    expect((await run()).props.canEdit).toBe(true)
  })

  it("non-member regular user gets 404", async () => {
    m.auth.mockResolvedValue(session("user"))
    m.memberFind.mockResolvedValue(null)
    await expect(run()).rejects.toThrow("NOT_FOUND")
  })

  it("section manager with overlapping section gets read-only access", async () => {
    m.auth.mockResolvedValue(session("section_manager"))
    m.memberFind.mockResolvedValue(null)
    m.projectFind.mockResolvedValue({ sections: [{ sectionId: "s1" }] })
    m.userSectionFind.mockResolvedValue({ sectionId: "s1" })
    expect((await run()).props.canEdit).toBe(false)
    expect(m.userSectionFind).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", sectionId: { in: ["s1"] } } }))
  })

  it("section manager without overlap or with no project sections gets 404", async () => {
    m.auth.mockResolvedValue(session("section_manager"))
    m.memberFind.mockResolvedValue(null)
    m.projectFind.mockResolvedValue({ sections: [{ sectionId: "s1" }] })
    m.userSectionFind.mockResolvedValue(null)
    await expect(run()).rejects.toThrow("NOT_FOUND")

    m.projectFind.mockResolvedValue(null)
    await expect(run()).rejects.toThrow("NOT_FOUND")
  })
})
