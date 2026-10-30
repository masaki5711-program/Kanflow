import { beforeEach, describe, expect, it, vi } from "vitest"

const gitReleaseFindMany = vi.fn()
const releaseItemFindMany = vi.fn()
const releaseItemCount = vi.fn()
const gitLinkFindMany = vi.fn()
const pbiFindMany = vi.fn()
const isGitEnabled = vi.fn()
const updateReleaseItem = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gitRelease: { findMany: (...a: unknown[]) => gitReleaseFindMany(...a) },
    releaseBacklogItem: { findMany: (...a: unknown[]) => releaseItemFindMany(...a), count: (...a: unknown[]) => releaseItemCount(...a) },
    gitLink: { findMany: (...a: unknown[]) => gitLinkFindMany(...a) },
    productBacklogItem: { findMany: (...a: unknown[]) => pbiFindMany(...a) },
  },
}))
vi.mock("../git.service", () => ({ isGitEnabled: (...a: unknown[]) => isGitEnabled(...a) }))
vi.mock("@/services/releases/releases.service", () => ({ updateReleaseItem: (...a: unknown[]) => updateReleaseItem(...a) }))

const svc = await import("../git-releases.service")

const ACTOR = { userId: "u1", userName: "Alice", systemRole: "member" }
const NOW = new Date("2026-10-22T00:00:00Z")

const tagRow = (tag: string, iso: string, description: string | null = null) => ({ tag, name: null, description, url: `https://g/-/tags/${tag}`, releasedAt: new Date(iso) })
const item = (id: string, planVersion: string | null, status: string, pbItemId: string | null) => ({ id, planVersion, status, pbItemId })
const pbi = (id: string, displayId: number) => ({ id, displayId, initiative: `Title ${displayId}`, userStory: null })
const mr = (backlogItemId: string, state: string, mergedAt: string | null) => ({ backlogItemId, state, mergedAt: mergedAt ? new Date(mergedAt) : null })

beforeEach(() => {
  vi.resetAllMocks()
  isGitEnabled.mockResolvedValue(true)
})

describe("getReleaseGitStatus", () => {
  it("returns nothing when Git is off", async () => {
    isGitEnabled.mockResolvedValue(false)
    expect(await svc.getReleaseGitStatus("p1")).toEqual({ enabled: false, versions: [] })
  })

  it("counts merged vs pending planned PBIs and offers the release once the version is tagged", async () => {
    gitReleaseFindMany.mockResolvedValue([tagRow("v1.1.0", "2026-10-01T00:00:00Z"), tagRow("v1.0.0", "2026-09-01T00:00:00Z")])
    releaseItemFindMany.mockResolvedValue([item("i1", "1.1.0", "ready", "b1"), item("i2", "1.1.0", "staged", "b2"), item("i3", "1.2.0", "staged", "b3")])
    pbiFindMany.mockResolvedValue([pbi("b1", 1), pbi("b2", 2), pbi("b3", 3)])
    gitLinkFindMany
      // MR states of the planned PBIs
      .mockResolvedValueOnce([mr("b1", "merged", "2026-09-20T00:00:00Z"), mr("b2", "opened", null)])
      // merged between v1.0.0 and v1.1.0: PBI 7 was never planned
      .mockResolvedValueOnce([{ backlogItemId: "b7", ref: "42", title: "x", url: "https://g/42", author: null, backlogItem: { displayId: 7, initiative: "Surprise", userStory: null, deletedAt: null } }])
    const out = await svc.getReleaseGitStatus("p1")
    const v110 = out.versions.find((v) => v.version === "1.1.0")!
    expect(v110).toMatchObject({ planned: 2, merged: 1, canRelease: true, tag: expect.objectContaining({ tag: "v1.1.0" }) })
    expect(v110.pending).toEqual([{ pbItemId: "b2", displayId: 2, title: "Title 2" }])
    expect(v110.unplanned).toEqual([{ displayId: 7, title: "Surprise", ref: "42", url: "https://g/42" }])
    const v120 = out.versions.find((v) => v.version === "1.2.0")!
    expect(v120).toMatchObject({ tag: null, canRelease: false, unplanned: [] })
  })

  it("does not offer the release when every item is already released", async () => {
    gitReleaseFindMany.mockResolvedValue([tagRow("v1.0.0", "2026-09-01T00:00:00Z")])
    releaseItemFindMany.mockResolvedValue([item("i1", "1.0.0", "released", "b1")])
    pbiFindMany.mockResolvedValue([pbi("b1", 1)])
    gitLinkFindMany.mockResolvedValue([mr("b1", "merged", "2026-08-20T00:00:00Z")])
    expect((await svc.getReleaseGitStatus("p1")).versions[0]).toMatchObject({ canRelease: false, merged: 1 })
  })

  it("release readiness reads only Git-derived MR links (declared-only links are display)", async () => {
    gitReleaseFindMany.mockResolvedValue([tagRow("v1.0.0", "2026-09-01T00:00:00Z")])
    releaseItemFindMany.mockResolvedValue([item("i1", "1.0.0", "ready", "b1")])
    pbiFindMany.mockResolvedValue([pbi("b1", 1)])
    gitLinkFindMany.mockResolvedValue([])
    await svc.getReleaseGitStatus("p1")
    for (const call of gitLinkFindMany.mock.calls) expect(call[0].where).toMatchObject({ kind: "mr", declaredAt: null })
  })
})

describe("releaseVersionFromTag", () => {
  function tagged() {
    gitReleaseFindMany.mockResolvedValue([tagRow("v1.0.0", "2026-09-01T00:00:00Z", "GitLab notes")])
    releaseItemFindMany
      .mockResolvedValueOnce([item("i1", "1.0.0", "ready", "b1"), item("i2", "1.0.0", "staged", null)]) // status
      .mockResolvedValueOnce([{ id: "i1", releaseVersion: null, releaseNote: null }, { id: "i2", releaseVersion: "1.0", releaseNote: "mine" }]) // targets
    pbiFindMany.mockResolvedValue([pbi("b1", 1)])
    gitLinkFindMany.mockResolvedValue([mr("b1", "opened", null)])
  }

  it("releases the open items with the tag's date, name and text, and reports pending PBIs", async () => {
    tagged()
    expect(await svc.releaseVersionFromTag("p1", "1.0.0", ACTOR)).toEqual({ updated: 2, pending: 1 })
    expect(updateReleaseItem).toHaveBeenCalledWith("p1", "i1", { status: "released", releaseDate: "2026-09-01T00:00:00.000Z", releaseVersion: "v1.0.0", releaseNote: "GitLab notes" }, ACTOR)
    // An item that already has a version and a note keeps them.
    expect(updateReleaseItem).toHaveBeenCalledWith("p1", "i2", { status: "released", releaseDate: "2026-09-01T00:00:00.000Z", releaseVersion: "1.0" }, ACTOR)
  })

  it("does nothing for an untagged version", async () => {
    gitReleaseFindMany.mockResolvedValue([])
    releaseItemFindMany.mockResolvedValue([item("i1", "2.0.0", "staged", null)])
    pbiFindMany.mockResolvedValue([])
    gitLinkFindMany.mockResolvedValue([])
    expect(await svc.releaseVersionFromTag("p1", "2.0.0", ACTOR)).toEqual({ updated: 0, pending: 0 })
    expect(updateReleaseItem).not.toHaveBeenCalled()
  })
})

describe("getVersionReleaseNote", () => {
  const merged = (backlogItemId: string, displayId: number, ref: string) => ({ backlogItemId, ref, title: `MR ${ref}`, url: `https://g/${ref}`, author: "Yamada", backlogItem: { displayId, initiative: `Title ${displayId}`, userStory: null, deletedAt: null } })

  it("lists the MRs merged between the previous tag and this one, with the GitLab text", async () => {
    releaseItemCount.mockResolvedValue(1)
    gitReleaseFindMany.mockResolvedValue([tagRow("v1.1.0", "2026-10-01T00:00:00Z", "GL text"), tagRow("v1.0.0", "2026-09-01T00:00:00Z")])
    gitLinkFindMany.mockResolvedValue([merged("b1", 1, "7")])
    const out = await svc.getVersionReleaseNote("p1", "1.1.0", "en", NOW)
    expect(out).toMatchObject({ enabled: true, mergedCount: 1, description: "GL text", tag: expect.objectContaining({ tag: "v1.1.0" }) })
    expect(out.text).toContain("# 1.1.0 release notes")
    expect(out.text).toContain("- [!7](https://g/7) MR 7 (Yamada)")
    const where = gitLinkFindMany.mock.calls[0][0].where
    expect(where.mergedAt).toEqual({ gt: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-10-01T00:00:00Z") })
  })

  it("for an untagged version runs from the latest tag to now", async () => {
    releaseItemCount.mockResolvedValue(1)
    gitReleaseFindMany.mockResolvedValue([tagRow("v1.0.0", "2026-09-01T00:00:00Z")])
    gitLinkFindMany.mockResolvedValue([])
    const out = await svc.getVersionReleaseNote("p1", "2.0.0", "en", NOW)
    expect(out).toMatchObject({ mergedCount: 0, tag: null, description: null })
    expect(gitLinkFindMany.mock.calls[0][0].where.mergedAt).toEqual({ gt: new Date("2026-09-01T00:00:00Z"), lte: NOW })
  })

  it("is disabled without Git and 404s for an unknown version", async () => {
    isGitEnabled.mockResolvedValue(false)
    expect((await svc.getVersionReleaseNote("p1", "1", "ja")).enabled).toBe(false)
    isGitEnabled.mockResolvedValue(true)
    releaseItemCount.mockResolvedValue(0)
    await expect(svc.getVersionReleaseNote("p1", "nope", "ja")).rejects.toMatchObject({ status: 404 })
  })
})
