import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * In-memory stand-in for the repository: rows keep soft-deleted entries (so max(seq) sees them), and
 * `lockPbi` is a real mutex held until the surrounding transaction ends — the property the PBI row
 * lock gives. Each read yields to the event loop so interleavings would show without the lock.
 */
type Row = { id: string; pbiId: string; seq: number; given: string | null; when: string | null; then: string | null; text: string | null; evidenceKind: string | null; deletedAt: Date | null }
const store = vi.hoisted(() => ({ rows: [] as Row[], tail: Promise.resolve(), events: [] as string[], isolation: [] as Array<string | undefined> }))
const tick = () => new Promise((r) => setTimeout(r, 1))

vi.mock("@/services/_shared/db", () => ({
  defaultDb: { __default: true },
  withTransaction: vi.fn(async (fn: (tx: { release?: () => void }) => unknown, options?: { isolationLevel?: string }) => {
    store.isolation.push(options?.isolationLevel)
    const tx: { release?: () => void } = {}
    try {
      return await fn(tx)
    } finally {
      tx.release?.()
    }
  }),
}))
vi.mock("@/services/_shared/activity", () => ({ logActivity: vi.fn(async () => undefined) }))
vi.mock("../acceptance-criteria.repository", () => ({
  findPbi: vi.fn(async (_db: unknown, projectId: string, ref: { id?: string; displayId?: number }) =>
    projectId === "p1" && (ref.id === "b1" || ref.displayId === 12) ? { id: "b1", displayId: 12, initiative: "Login", userStory: null } : null
  ),
  lockPbi: vi.fn(async (tx: { release?: () => void }) => {
    const prev = store.tail
    let release!: () => void
    store.tail = new Promise<void>((r) => (release = r))
    await prev
    tx.release = release
    store.events.push("lock")
  }),
  countLive: vi.fn(async (_db: unknown, pbiId: string) => store.rows.filter((r) => r.pbiId === pbiId && !r.deletedAt).length),
  maxSeq: vi.fn(async (_db: unknown, pbiId: string) => {
    await tick()
    store.events.push("max")
    return Math.max(0, ...store.rows.filter((r) => r.pbiId === pbiId).map((r) => r.seq))
  }),
  create: vi.fn(async (_db: unknown, d: Omit<Row, "id" | "deletedAt"> & { createdById: string | null }) => {
    await tick()
    if (store.rows.some((r) => r.pbiId === d.pbiId && r.seq === d.seq)) throw new Error("unique (pbiId, seq)")
    const row = { id: `r${store.rows.length}`, deletedAt: null, ...d }
    store.rows.push(row)
    return row
  }),
  findBySeq: vi.fn(async (_db: unknown, pbiId: string, seq: number) => store.rows.find((r) => r.pbiId === pbiId && r.seq === seq && !r.deletedAt) ?? null),
  update: vi.fn(async (_db: unknown, id: string, data: Partial<Row>) => Object.assign(store.rows.find((r) => r.id === id)!, data)),
  softDelete: vi.fn(async (_db: unknown, id: string, _by: string | null, now: Date) => Object.assign(store.rows.find((r) => r.id === id)!, { deletedAt: now })),
  findLive: vi.fn(async (_db: unknown, pbiId: string) => store.rows.filter((r) => r.pbiId === pbiId && !r.deletedAt).sort((a, b) => a.seq - b.seq)),
}))

const svc = await import("../acceptance-criteria.service")
const repo = await import("../acceptance-criteria.repository")
const activity = await import("@/services/_shared/activity")
const { AC_MAX_PER_PBI } = await import("../acceptance-criteria.schemas")
const { NotFoundError, ValidationError } = await import("@/services/_shared/errors")

const ACTOR = { userId: "u1", userName: "PO One", systemRole: "member" }
const add = (text: string, over: Record<string, unknown> = {}) => svc.createAcceptanceCriterion("p1", "b1", { text, ...over }, ACTOR)

beforeEach(() => {
  store.rows = []
  store.tail = Promise.resolve()
  store.events = []
  store.isolation = []
  vi.clearAllMocks()
})

describe("createAcceptanceCriterion", () => {
  it("gives increasing seq with the display id PBI-<n>/AC-<seq>, by id or by number", async () => {
    expect((await add("a")).id).toBe("PBI-12/AC-1")
    expect((await svc.createAcceptanceCriterion("p1", "PBI-12", { given: "g", when: "w", then: "t", evidenceKind: "test" }, ACTOR))).toMatchObject({
      id: "PBI-12/AC-2",
      seq: 2,
      given: "g",
      when: "w",
      then: "t",
      text: null,
      evidenceKind: "test",
    })
  })

  it("trims; blank fields become null; needs at least one of given / when / then / text", async () => {
    expect(await add("  keep  ", { given: "   " })).toMatchObject({ text: "keep", given: null })
    await expect(svc.createAcceptanceCriterion("p1", "b1", { given: " ", text: "" }, ACTOR)).rejects.toBeInstanceOf(ValidationError)
    await expect(svc.createAcceptanceCriterion("p1", "b1", { evidenceKind: "test" }, ACTOR)).rejects.toBeInstanceOf(ValidationError)
  })

  it("a PBI of another project (or a trashed / missing one) is a 404 PBI_NOT_FOUND", async () => {
    await expect(svc.createAcceptanceCriterion("other", "b1", { text: "a" }, ACTOR)).rejects.toMatchObject({ code: "PBI_NOT_FOUND" })
  })

  it("takes the PBI lock BEFORE reading max(seq), in a READ COMMITTED transaction", async () => {
    await add("a")
    expect(store.events).toEqual(["lock", "max"])
    expect(store.isolation).toEqual(["ReadCommitted"])
  })

  it("concurrent creates get distinct, gap-free seqs (the lock serializes max+1)", async () => {
    const dtos = await Promise.all(Array.from({ length: 8 }, (_, i) => add(`item ${i}`)))
    const seqs = dtos.map((d) => d.seq).sort((a, b) => a - b)
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(new Set(dtos.map((d) => d.id)).size).toBe(8)
  })

  it("refuses beyond the per-PBI limit with AC_LIMIT_REACHED", async () => {
    for (let i = 1; i <= AC_MAX_PER_PBI; i++) store.rows.push({ id: `x${i}`, pbiId: "b1", seq: i, given: null, when: null, then: null, text: "t", evidenceKind: null, deletedAt: null })
    await expect(add("one more")).rejects.toMatchObject({ code: "AC_LIMIT_REACHED" })
  })

  it("records an activity entry on the PBI naming the criterion", async () => {
    await add("a")
    expect(activity.logActivity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: "pbi", entityId: "b1", diff: expect.objectContaining({ meta: { acceptanceCriterion: "PBI-12/AC-1", change: "added" } }) }))
  })
})

describe("seq is never reused", () => {
  it("after deleting the last item the next one gets a NEW number", async () => {
    await add("a")
    await add("b")
    await svc.deleteAcceptanceCriterion("p1", "b1", "AC-2", ACTOR)
    expect((await add("c")).id).toBe("PBI-12/AC-3")
    expect((await svc.listAcceptanceCriteria("p1", "b1")).data.map((d) => d.id)).toEqual(["PBI-12/AC-1", "PBI-12/AC-3"])
  })

  it("deleting everything still continues the numbering; a deleted item is gone for edit / delete (AC_NOT_FOUND)", async () => {
    await add("a")
    await svc.deleteAcceptanceCriterion("p1", "b1", "1", ACTOR)
    expect((await add("b")).seq).toBe(2)
    await expect(svc.updateAcceptanceCriterion("p1", "b1", "AC-1", { text: "x" }, ACTOR)).rejects.toMatchObject({ code: "AC_NOT_FOUND" })
    await expect(svc.deleteAcceptanceCriterion("p1", "b1", "AC-1", ACTOR)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("updateAcceptanceCriterion", () => {
  it("changes only the sent fields and never the seq / id", async () => {
    await add("keep", { given: "g" })
    const dto = await svc.updateAcceptanceCriterion("p1", "b1", "PBI-12/AC-1", { when: "w", evidenceKind: "measurement" }, ACTOR)
    expect(dto).toMatchObject({ id: "PBI-12/AC-1", seq: 1, given: "g", when: "w", text: "keep", evidenceKind: "measurement" })
    expect((await svc.updateAcceptanceCriterion("p1", "b1", "AC-1", { evidenceKind: null }, ACTOR)).evidenceKind).toBeNull()
  })

  it("an empty patch writes nothing and logs nothing", async () => {
    await add("only")
    vi.mocked(activity.logActivity).mockClear()
    expect(await svc.updateAcceptanceCriterion("p1", "b1", "AC-1", {}, ACTOR)).toMatchObject({ id: "PBI-12/AC-1", text: "only" })
    expect(repo.update).not.toHaveBeenCalled()
    expect(activity.logActivity).not.toHaveBeenCalled()
  })

  it("a reference naming another PBI (PBI-13/AC-1 on PBI 12) is AC_NOT_FOUND for edit and delete", async () => {
    await add("only")
    await expect(svc.updateAcceptanceCriterion("p1", "b1", "PBI-13/AC-1", { text: "x" }, ACTOR)).rejects.toMatchObject({ code: "AC_NOT_FOUND" })
    await expect(svc.deleteAcceptanceCriterion("p1", "b1", "PBI-13/AC-1", ACTOR)).rejects.toMatchObject({ code: "AC_NOT_FOUND" })
    expect(repo.softDelete).not.toHaveBeenCalled()
  })

  it("edit and delete take the PBI lock before reading the criterion", async () => {
    await add("a")
    store.events = []
    vi.mocked(repo.findBySeq).mockClear()
    await svc.updateAcceptanceCriterion("p1", "b1", "AC-1", { text: "b" }, ACTOR)
    await svc.deleteAcceptanceCriterion("p1", "b1", "AC-1", ACTOR)
    expect(store.events).toEqual(["lock", "lock"])
    expect(vi.mocked(repo.lockPbi).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(repo.findBySeq).mock.invocationCallOrder[0])
  })

  it("cannot clear the last content, and an unknown / malformed reference is AC_NOT_FOUND", async () => {
    await add("only")
    await expect(svc.updateAcceptanceCriterion("p1", "b1", "AC-1", { text: "" }, ACTOR)).rejects.toBeInstanceOf(ValidationError)
    expect(vi.mocked(repo.update)).not.toHaveBeenCalled()
    await expect(svc.updateAcceptanceCriterion("p1", "b1", "AC-9", { text: "x" }, ACTOR)).rejects.toMatchObject({ code: "AC_NOT_FOUND" })
    await expect(svc.updateAcceptanceCriterion("p1", "b1", "nonsense", { text: "x" }, ACTOR)).rejects.toMatchObject({ code: "AC_NOT_FOUND" })
  })
})
