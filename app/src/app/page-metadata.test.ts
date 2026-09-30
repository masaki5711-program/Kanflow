import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const userFind = vi.fn()
const projectFind = vi.fn()
const getI18nFor = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFind(a) },
    project: { findUnique: (a: unknown) => projectFind(a) },
  },
}))
vi.mock("@/lib/translation/hooks", () => ({ getI18nFor: (...a: unknown[]) => getI18nFor(...a) }))

import { buildPageMetadata } from "./page-metadata"

describe("buildPageMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: "u1" } })
    userFind.mockResolvedValue({ language: "en" })
    projectFind.mockResolvedValue({ name: "アルファ", projectType: "software" })
    getI18nFor.mockResolvedValue(new Map())
  })

  it("builds '<Page> · Kanflow' in the viewer's language for top-level pages", async () => {
    const meta = await buildPageMetadata(({ t }) => t.myProfileTitle)
    expect(meta.title).toMatch(/ · Kanflow$/)
    expect(meta.title).not.toMatch(/プロフィール/)
    expect(projectFind).not.toHaveBeenCalled()
  })

  it("adds the localized project name for project pages", async () => {
    userFind.mockResolvedValue({ language: "id" })
    getI18nFor.mockResolvedValue(
      new Map([["p1", { name: { source: "ja", ja: "アルファ", id: "Alfa", status: "done" } }]]),
    )
    const meta = await buildPageMetadata(({ pt }) => pt.backlogTitle, "p1")
    expect(meta.title).toMatch(/ · Alfa · Kanflow$/)
    // A trashed project is treated like a missing one (no name in the title).
    expect(projectFind).toHaveBeenCalledWith({ where: { id: "p1", deletedAt: null }, select: { name: true, projectType: true } })
  })

  it("falls back to Japanese without a session and omits a missing project", async () => {
    authMock.mockResolvedValue(null)
    projectFind.mockResolvedValue(null)
    const meta = await buildPageMetadata(({ t }) => t.planTitle, "missing")
    expect(userFind).not.toHaveBeenCalled()
    expect(String(meta.title).split(" · ")).toHaveLength(2)
  })

  it("treats an unknown stored language as Japanese", async () => {
    userFind.mockResolvedValue({ language: "xx" })
    const ja = await buildPageMetadata(({ t }) => t.planTitle)
    authMock.mockResolvedValue(null)
    const anon = await buildPageMetadata(({ t }) => t.planTitle)
    expect(ja.title).toBe(anon.title)
  })

  it("never throws — returns the app name on lookup failure", async () => {
    authMock.mockRejectedValue(new Error("db down"))
    await expect(buildPageMetadata(({ t }) => t.planTitle, "p1")).resolves.toEqual({ title: "Kanflow" })
  })
})
