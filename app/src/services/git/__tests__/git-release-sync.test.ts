import { beforeEach, describe, expect, it, vi } from "vitest"

const findMany = vi.fn()
const upsert = vi.fn()
const deleteMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { gitRelease: { findMany: (...a: unknown[]) => findMany(...a), upsert: (...a: unknown[]) => upsert(...a), deleteMany: (...a: unknown[]) => deleteMany(...a) } },
}))

const { draftsFromTags, syncReleases } = await import("../git-release-sync")

const NOW = new Date("2026-10-22T00:00:00Z")
const REPO = { id: "r1", projectId: "p1", webUrl: "https://gitlab.example/g/r/" }

describe("draftsFromTags", () => {
  it("uses the GitLab release for title, text and date, else the commit date", () => {
    const out = draftsFromTags(
      [{ name: "v1.0.0", commit: { committed_date: "2026-09-01T00:00:00Z" } }, { name: "v0.9", commit: { committed_date: "2026-08-01T00:00:00Z" } }],
      [{ tag_name: "v1.0.0", name: " First ", description: " Notes ", released_at: "2026-09-02T00:00:00Z" }],
      REPO.webUrl,
      NOW,
    )
    expect(out[0]).toMatchObject({ tag: "v1.0.0", name: "First", description: "Notes", url: "https://gitlab.example/g/r/-/tags/v1.0.0", releasedAt: new Date("2026-09-02T00:00:00Z") })
    expect(out[1]).toMatchObject({ tag: "v0.9", name: null, description: null, releasedAt: new Date("2026-08-01T00:00:00Z") })
  })

  it("falls back to now when the tag has no usable date", () => {
    expect(draftsFromTags([{ name: "x", commit: { committed_date: "nope" } }], [], REPO.webUrl, NOW)[0].releasedAt).toEqual(NOW)
  })
})

describe("syncReleases", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    upsert.mockResolvedValue({})
    deleteMany.mockResolvedValue({ count: 1 })
  })

  const client = (tags: unknown[], releases: unknown[] | Error = []) =>
    ({ listTags: vi.fn().mockResolvedValue(tags), listReleases: releases instanceof Error ? vi.fn().mockRejectedValue(releases) : vi.fn().mockResolvedValue(releases) }) as never

  it("writes new tags, skips unchanged ones and removes deleted ones", async () => {
    const unchanged = { id: "a", tag: "v1", name: null, description: null, url: "https://gitlab.example/g/r/-/tags/v1", releasedAt: new Date("2026-09-01T00:00:00Z") }
    findMany.mockResolvedValue([unchanged, { id: "gone", tag: "v0", name: null, description: null, url: "u", releasedAt: NOW }])
    const changed = await syncReleases(
      client([{ name: "v1", commit: { committed_date: "2026-09-01T00:00:00Z" } }, { name: "v2", commit: { committed_date: "2026-10-01T00:00:00Z" } }]),
      REPO,
      1,
      NOW,
    )
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0].create).toMatchObject({ tag: "v2", projectId: "p1", repositoryId: "r1" })
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["gone"] } } })
    expect(changed).toBe(2)
  })

  it("keeps the tags when the releases lookup fails", async () => {
    findMany.mockResolvedValue([])
    await syncReleases(client([{ name: "v1", commit: { committed_date: "2026-09-01T00:00:00Z" } }], new Error("403")), REPO, 1, NOW)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it("does not delete anything when the tag list was cut short", async () => {
    findMany.mockResolvedValue([{ id: "old", tag: "v0", name: null, description: null, url: "u", releasedAt: NOW }])
    const many = Array.from({ length: 300 }, (_, i) => ({ name: `t${i}`, commit: { committed_date: "2026-09-01T00:00:00Z" } }))
    await syncReleases(client(many), REPO, 1, NOW)
    expect(deleteMany).not.toHaveBeenCalled()
  })
})
