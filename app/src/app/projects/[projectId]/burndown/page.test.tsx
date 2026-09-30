import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  memberFind: vi.fn(),
  projectFind: vi.fn(),
  userSectionFind: vi.fn(),
  sprintFind: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: mocks.memberFind },
    project: { findUnique: mocks.projectFind },
    userSection: { findFirst: mocks.userSectionFind },
    sprint: { findMany: mocks.sprintFind },
  },
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
}))
vi.mock("./burndown-content", () => ({ BurndownPageContent: () => null }))

const { default: BurndownPage } = await import("./page")
const { BurndownPageContent } = await import("./burndown-content")

const params = Promise.resolve({ projectId: "p1" })
const user = (role: string) => ({ user: { id: "u1", role } })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sprintFind.mockResolvedValue([])
})

describe("BurndownPage access gate", () => {
  it("redirects anonymous users to login", async () => {
    mocks.auth.mockResolvedValue(null)
    await expect(BurndownPage({ params })).rejects.toThrow("REDIRECT:/login")
  })

  it("renders for a project member", async () => {
    mocks.auth.mockResolvedValue(user("member"))
    mocks.memberFind.mockResolvedValue({ id: "m1" })
    mocks.projectFind.mockResolvedValue({ name: "P" })
    mocks.sprintFind.mockResolvedValue([{ id: "s1", sprintName: "S1", status: "active" }])
    const el = (await BurndownPage({ params })) as ReactElement<{ projectId: string; sprints: unknown }>
    expect(el.type).toBe(BurndownPageContent)
    expect(el.props.projectId).toBe("p1")
    expect(el.props.sprints).toEqual([{ id: "s1", name: "S1", status: "active" }])
    expect(mocks.sprintFind.mock.calls[0][0].where).toEqual({ projectId: "p1", status: { in: ["active", "review", "done", "archived"] } })
    expect(mocks.memberFind).toHaveBeenCalledWith({ where: { projectId: "p1", userId: "u1" } })
  })

  it("404s for a non-member regular user", async () => {
    mocks.auth.mockResolvedValue(user("member"))
    mocks.memberFind.mockResolvedValue(null)
    await expect(BurndownPage({ params })).rejects.toThrow("NOT_FOUND")
  })

  it("lets admins in without membership but 404s when the project is missing", async () => {
    mocks.auth.mockResolvedValue(user("admin"))
    mocks.memberFind.mockResolvedValue(null)
    mocks.projectFind.mockResolvedValue({ name: "P" })
    await expect(BurndownPage({ params })).resolves.toBeTruthy()
    mocks.projectFind.mockResolvedValue(null)
    await expect(BurndownPage({ params })).rejects.toThrow("NOT_FOUND")
  })

  it("lets a section manager in only when sections overlap", async () => {
    mocks.auth.mockResolvedValue(user("section_manager"))
    mocks.memberFind.mockResolvedValue(null)
    mocks.projectFind.mockResolvedValueOnce({ sections: [{ sectionId: "sec1" }] }).mockResolvedValueOnce({ name: "P" })
    mocks.userSectionFind.mockResolvedValue({ sectionId: "sec1" })
    await expect(BurndownPage({ params })).resolves.toBeTruthy()
    expect(mocks.userSectionFind).toHaveBeenCalledWith({
      where: { userId: "u1", sectionId: { in: ["sec1"] } },
      select: { sectionId: true },
    })
  })

  it("404s a section manager without overlap or when the project has no sections", async () => {
    mocks.auth.mockResolvedValue(user("section_manager"))
    mocks.memberFind.mockResolvedValue(null)
    mocks.projectFind.mockResolvedValue({ sections: [{ sectionId: "sec1" }] })
    mocks.userSectionFind.mockResolvedValue(null)
    await expect(BurndownPage({ params })).rejects.toThrow("NOT_FOUND")

    mocks.projectFind.mockResolvedValue(null)
    await expect(BurndownPage({ params })).rejects.toThrow("NOT_FOUND")
    expect(mocks.userSectionFind).toHaveBeenCalledTimes(1)
  })
})
