import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../releases.repository")

const repo = await import("../releases.repository")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../releases.service")

describe("releases.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists with PBI i18n nested", async () => {
    vi.mocked(repo.findReleaseItems).mockResolvedValue([{ id: "r1", pbItem: { id: "b1" } }, { id: "r2", pbItem: null }] as never)
    const out = await svc.listReleases("p1")
    expect(out[0].pbItem).toEqual({ id: "b1", i18n: {} })
    expect(out[1].pbItem).toBeNull()
  })

  it("update converts the release date and enqueues the input", async () => {
    vi.mocked(repo.updateReleaseItem).mockResolvedValue({ id: "r1" } as never)
    await svc.updateReleaseItem("p1", "r1", { releaseDate: "", releaseNote: "n" }, ACTOR)
    expect(repo.updateReleaseItem).toHaveBeenCalledWith(TX, "p1", "r1", { releaseNote: "n", releaseDate: null })
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "release_item", "r1", { releaseDate: "", releaseNote: "n" })
    await svc.updateReleaseItem("p1", "r1", { status: "ready" }, ACTOR)
    expect(repo.updateReleaseItem).toHaveBeenLastCalledWith(TX, "p1", "r1", { status: "ready" })
  })

  it("delete purges translations", async () => {
    await svc.deleteReleaseItem("p1", "r1")
    expect(repo.deleteReleaseItem).toHaveBeenCalledWith(TX, "p1", "r1")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { release_item: ["r1"] })
  })

  it("import copies PBIs and enqueues each created item in the tx", async () => {
    vi.mocked(repo.findPbisForRelease).mockResolvedValue([
      { id: "b1", initiative: "I", epic: null, userStory: "U", assignedPo: null, poNote: null },
      { id: "b2", initiative: null, epic: null, userStory: null, assignedPo: null, poNote: null },
    ])
    vi.mocked(repo.insertReleaseItem).mockImplementation(((_db: unknown, data: { pbItemId: string }) =>
      Promise.resolve({ id: `r-${data.pbItemId}` })) as never)
    await expect(svc.importReleaseItems("p1", { pbItemIds: ["b1", "b2"], planVersion: "v1" })).resolves.toEqual({ created: 2 })
    expect(repo.insertReleaseItem).toHaveBeenCalledWith(TX, expect.objectContaining({ pbItemId: "b1", planVersion: "v1", status: "staged" }))
    expect(tr.enqueueIn).toHaveBeenCalledTimes(2)
  })

  it("import 404s when no PBI matches", async () => {
    vi.mocked(repo.findPbisForRelease).mockResolvedValue([])
    await expect(svc.importReleaseItems("p1", { pbItemIds: ["x"] })).rejects.toThrow("該当するPBIがありません")
  })
})
