import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), loadProjectActor: vi.fn() }))

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/authz", async () => ({
  ...(await vi.importActual<typeof import("@/lib/authz/policy")>("@/lib/authz/policy")),
  loadProjectActor: mocks.loadProjectActor,
}))
vi.mock("@/app/page-metadata", () => ({ buildPageMetadata: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
}))
vi.mock("../trash-content", () => ({ TrashContent: () => null }))

const { default: TrashPage } = await import("../page")
const { TrashContent } = await import("../trash-content")

const params = Promise.resolve({ projectId: "p1" })
const actor = (projectRole: string | null, systemRole = "member") => ({
  userId: "u1",
  systemRole,
  projectRole,
  isSectionManagerOfProject: false,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: "u1", role: "member" } })
})

describe("TrashPage access gate", () => {
  it("redirects anonymous users to login", async () => {
    mocks.auth.mockResolvedValue(null)
    await expect(TrashPage({ params })).rejects.toThrow("REDIRECT:/login")
  })

  it("renders for a PO with the purge permission", async () => {
    mocks.loadProjectActor.mockResolvedValue(actor("po"))
    const el = (await TrashPage({ params })) as ReactElement<{ projectId: string; canPurge: boolean }>
    expect(el.type).toBe(TrashContent)
    expect(el.props).toEqual({ projectId: "p1", canPurge: true })
    expect(mocks.loadProjectActor).toHaveBeenCalledWith("u1", "member", "p1")
  })

  it("renders for an SM without the purge permission", async () => {
    mocks.loadProjectActor.mockResolvedValue(actor("sm"))
    const el = (await TrashPage({ params })) as ReactElement<{ canPurge: boolean }>
    expect(el.props.canPurge).toBe(false)
  })

  it("404s for a Dev and for a non-member", async () => {
    mocks.loadProjectActor.mockResolvedValue(actor("dev"))
    await expect(TrashPage({ params })).rejects.toThrow("NOT_FOUND")
    mocks.loadProjectActor.mockResolvedValue(actor(null))
    await expect(TrashPage({ params })).rejects.toThrow("NOT_FOUND")
  })
})
