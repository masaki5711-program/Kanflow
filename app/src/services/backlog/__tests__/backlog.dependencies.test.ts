import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../backlog.dependencies.repository")

const repo = await import("../backlog.dependencies.repository")
const act = await import("@/services/_shared/activity")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX, DEFAULT_DB, prismaError } = await import("@/services/__tests__/support")
const dep = await import("../backlog.dependencies")

const edge = (predecessorId: string, successorId: string) => ({ predecessorId, successorId })

const ref = (id: string, over: Partial<{ displayId: number; initiative: string | null; userStory: string | null; status: string }> = {}) => ({
  id,
  displayId: 1,
  initiative: null,
  userStory: null,
  status: "ready",
  ...over,
})

const row = (id: string, predecessorId: string, successorId: string) => ({
  id,
  predecessorId,
  successorId,
  predecessor: ref(predecessorId),
  successor: ref(successorId),
})

describe("backlog.dependencies", () => {
  beforeEach(() => vi.clearAllMocks())

  describe("groupDependencies (pure)", () => {
    it("attaches both directions with i18n, new arrays only", () => {
      const rows = [row("d1", "a", "b")]
      const ft = { ja: "A", id: null, source: "ja", status: "done" } as const
      const i18n = new Map([["a", { initiative: ft }]]) as never
      const out = dep.groupDependencies(rows, i18n)
      expect(out.get("b")?.blockedBy).toEqual([{ dependencyId: "d1", ...ref("a"), i18n: { initiative: ft } }])
      expect(out.get("b")?.blocking).toEqual([])
      expect(out.get("a")?.blocking).toEqual([{ dependencyId: "d1", ...ref("b"), i18n: {} }])
      expect(out.get("a")?.blockedBy).toEqual([])
      // rows themselves are untouched
      expect(rows[0]).toEqual(row("d1", "a", "b"))
    })

    it("accumulates multiple links on the same PBI", () => {
      const rows = [row("d1", "a", "c"), row("d2", "b", "c")]
      const out = dep.groupDependencies(rows, new Map())
      expect(out.get("c")?.blockedBy.map((r) => r.dependencyId)).toEqual(["d1", "d2"])
      expect(out.get("a")?.blocking.map((r) => r.dependencyId)).toEqual(["d1"])
      expect(out.get("b")?.blocking.map((r) => r.dependencyId)).toEqual(["d2"])
    })

    it("missing i18n falls back to {}", () => {
      const out = dep.groupDependencies([row("d1", "a", "b")], new Map())
      expect(out.get("b")?.blockedBy[0].i18n).toEqual({})
    })
  })

  describe("withDependencies (pure)", () => {
    it("attaches empty lists by default and the stored dto when present", () => {
      const deps = new Map([["a", { blockedBy: [{ dependencyId: "d1" }], blocking: [] } as never]])
      const out = dep.withDependencies([{ id: "a" }, { id: "b" }], deps)
      expect(out[0]).toMatchObject({ id: "a", blockedBy: [{ dependencyId: "d1" }], blocking: [] })
      expect(out[1]).toMatchObject({ id: "b", blockedBy: [], blocking: [] })
    })
  })

  describe("assertValidPbiDependency (pure)", () => {
    const live = new Set(["a", "b", "c"])

    it("404s when either end is not a live PBI of the project", () => {
      expect(() => dep.assertValidPbiDependency(live, [], edge("a", "zz"))).toThrow(expect.objectContaining({ status: 404, code: "PBI_NOT_FOUND" }))
      expect(() => dep.assertValidPbiDependency(live, [], edge("zz", "a"))).toThrow(expect.objectContaining({ status: 404, code: "PBI_NOT_FOUND" }))
    })

    it("400s on a self-dependency", () => {
      expect(() => dep.assertValidPbiDependency(live, [], edge("a", "a"))).toThrow(expect.objectContaining({ status: 400, code: "PBI_DEPENDENCY_INVALID" }))
    })

    it("409s on a duplicate link", () => {
      expect(() => dep.assertValidPbiDependency(live, [edge("a", "b")], edge("a", "b"))).toThrow(
        expect.objectContaining({ status: 409, code: "PBI_DEPENDENCY_EXISTS" }),
      )
    })

    it("400s on a cycle, including through an edge whose end is not live (trashed)", () => {
      expect(() => dep.assertValidPbiDependency(live, [edge("a", "b"), edge("b", "c")], edge("c", "a"))).toThrow(
        expect.objectContaining({ status: 400, code: "PBI_DEPENDENCY_CYCLE" }),
      )
      // a -> gone -> c forms a -> c; gone is absent from liveIds (trashed) but its edges still count
      expect(() => dep.assertValidPbiDependency(live, [edge("a", "gone"), edge("gone", "c")], edge("c", "a"))).toThrow(
        expect.objectContaining({ code: "PBI_DEPENDENCY_CYCLE" }),
      )
    })

    it("accepts a valid, non-conflicting link", () => {
      expect(() => dep.assertValidPbiDependency(live, [edge("a", "b")], edge("b", "c"))).not.toThrow()
    })
  })

  describe("createPbiDependency", () => {
    it("inserts and logs activity on the successor; unique violation (P2002) becomes 409", async () => {
      vi.mocked(repo.findLivePbiIds).mockResolvedValue(new Set(["a", "b"]))
      vi.mocked(repo.findDependencyEdges).mockResolvedValue([])
      vi.mocked(repo.insertDependency).mockResolvedValue({ id: "d1", predecessorId: "a", successorId: "b" })
      await expect(dep.createPbiDependency("p1", edge("a", "b"), ACTOR)).resolves.toEqual({ id: "d1", predecessorId: "a", successorId: "b" })
      expect(repo.insertDependency).toHaveBeenCalledWith(TX, { projectId: "p1", predecessorId: "a", successorId: "b" })
      expect(act.logActivity).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          projectId: "p1",
          entityType: "pbi",
          entityId: "b",
          action: "update",
          diff: { meta: { dependency: { added: "a" } } },
        }),
      )

      vi.mocked(repo.insertDependency).mockRejectedValueOnce(prismaError("P2002"))
      await expect(dep.createPbiDependency("p1", edge("a", "b"), ACTOR)).rejects.toMatchObject({ status: 409, code: "PBI_DEPENDENCY_EXISTS" })
    })

    it("rejects before inserting when the guard fails (e.g. self-dependency)", async () => {
      vi.mocked(repo.findLivePbiIds).mockResolvedValue(new Set(["a"]))
      vi.mocked(repo.findDependencyEdges).mockResolvedValue([])
      await expect(dep.createPbiDependency("p1", edge("a", "a"), ACTOR)).rejects.toMatchObject({ status: 400, code: "PBI_DEPENDENCY_INVALID" })
      expect(repo.insertDependency).not.toHaveBeenCalled()
    })
  })

  describe("deletePbiDependency", () => {
    it("404s when the link is not in the project, otherwise deletes and logs", async () => {
      vi.mocked(repo.findDependency).mockResolvedValueOnce(null)
      await expect(dep.deletePbiDependency("p1", "d9", ACTOR)).rejects.toMatchObject({ status: 404 })
      expect(repo.deleteDependency).not.toHaveBeenCalled()

      vi.mocked(repo.findDependency).mockResolvedValueOnce({ id: "d1", predecessorId: "a", successorId: "b" })
      await dep.deletePbiDependency("p1", "d1", ACTOR)
      expect(repo.deleteDependency).toHaveBeenCalledWith(TX, "d1")
      expect(act.logActivity).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ entityId: "b", diff: { meta: { dependency: { removed: "a" } } } }),
      )
    })
  })

  describe("getPbiDependencies", () => {
    it("returns the empty dto by default", async () => {
      vi.mocked(repo.findDependencyRows).mockResolvedValue([])
      await expect(dep.getPbiDependencies("p1", "a")).resolves.toEqual({ blockedBy: [], blocking: [] })
      expect(repo.findDependencyRows).toHaveBeenCalledWith(DEFAULT_DB, "p1", "a")
    })

    it("returns the PBI's own dto when it has links", async () => {
      vi.mocked(repo.findDependencyRows).mockResolvedValue([row("d1", "a", "b")])
      vi.mocked(tr.getI18nFor).mockResolvedValue(new Map())
      const out = await dep.getPbiDependencies("p1", "b")
      expect(out.blockedBy).toHaveLength(1)
      expect(out.blockedBy[0]).toMatchObject({ dependencyId: "d1", id: "a" })
    })
  })

  describe("loadDependencies", () => {
    it("skips the i18n query when there are no rows", async () => {
      vi.mocked(repo.findDependencyRows).mockResolvedValue([])
      const out = await dep.loadDependencies(TX as never, "p1")
      expect(out.size).toBe(0)
      expect(tr.getI18nFor).not.toHaveBeenCalled()
    })

    it("fetches i18n for every id touched by a row when there are rows", async () => {
      vi.mocked(repo.findDependencyRows).mockResolvedValue([row("d1", "a", "b")])
      vi.mocked(tr.getI18nFor).mockResolvedValue(new Map())
      await dep.loadDependencies(TX as never, "p1")
      expect(tr.getI18nFor).toHaveBeenCalledWith("backlog_item", ["a", "b"])
    })
  })
})
