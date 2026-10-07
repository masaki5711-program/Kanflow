import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../reactions.repository")
const publishAfterCommit = vi.fn()
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: (...a: unknown[]) => publishAfterCommit(...a) }))

const repo = await import("../reactions.repository")
const svc = await import("../reactions.service")
const { ACTOR, DEFAULT_DB, TX } = await import("@/services/__tests__/support")
const { NotFoundError } = await import("@/services/_shared/errors")
const { reactionsQuerySchema, toggleReactionSchema } = await import("../reactions.schemas")

const r = (emoji: string, userId: string, name: string = userId.toUpperCase(), targetId = "t1") => ({ targetId, emoji, userId, user: { name } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(repo.findMirrorMessageId).mockResolvedValue(null)
})

describe("summarize", () => {
  it("counts per emoji in palette order and flags the viewer's own", () => {
    const out = svc.summarize([r("🎉", "u2"), r("👍", "u1"), r("👍", "u2"), r("👀", "u3")], "u1")
    expect(out.map((s) => [s.emoji, s.count, s.mine])).toEqual([
      ["👍", 2, true],
      ["🎉", 1, false],
      ["👀", 1, false],
    ])
    expect(out[0].users).toEqual(["U1", "U2"])
  })

  it("lists at most REACTION_USERS_MAX names but counts everybody", () => {
    const rows = Array.from({ length: 14 }, (_, i) => r("👍", `u${i}`))
    const [only] = svc.summarize(rows, "nobody")
    expect(only.count).toBe(14)
    expect(only.users).toHaveLength(svc.REACTION_USERS_MAX)
    expect(only.mine).toBe(false)
  })

  it("ignores emojis outside the palette and shows a missing name as a dash", () => {
    expect(svc.summarize([r("💩", "u1")], "u1")).toEqual([])
    expect(svc.summarize([{ emoji: "👍", userId: "u1", user: null }], "u1")[0].users).toEqual(["—"])
  })
})

describe("getReactions", () => {
  it("answers every requested id, redirects a chat mirror to its comment and leaves unknown ids empty", async () => {
    vi.mocked(repo.findLiveTeamMessages).mockResolvedValue([
      { id: "m1", commentId: "c1" },
      { id: "m2", commentId: null },
    ])
    vi.mocked(repo.findReactions).mockImplementation(
      (async (_db: unknown, type: string) => (type === "comment" ? [r("❤️", "u2", "U2", "c1")] : [r("👍", "u1", "U1", "m2")])) as never,
    )
    const out = await svc.getReactions("p1", { targetType: "team_message", ids: ["m1", "m2", "gone"] }, "u1")
    expect(out.m1).toEqual([{ emoji: "❤️", count: 1, mine: false, users: ["U2"] }])
    expect(out.m2).toEqual([{ emoji: "👍", count: 1, mine: true, users: ["U1"] }])
    expect(out.gone).toEqual([])
    expect(repo.findReactions).toHaveBeenCalledWith(DEFAULT_DB, "comment", ["c1"])
  })

  it("only looks up targets inside the project", async () => {
    vi.mocked(repo.findTaskIds).mockResolvedValue([])
    const out = await svc.getReactions("p1", { targetType: "task_completion", ids: ["x"] }, "u1")
    expect(repo.findTaskIds).toHaveBeenCalledWith(DEFAULT_DB, "p1", ["x"])
    expect(out).toEqual({ x: [] })
    expect(repo.findReactions).not.toHaveBeenCalled()
  })
})

describe("toggleReaction", () => {
  const input = { targetType: "comment", targetId: "c1", emoji: "👍" } as const

  beforeEach(() => {
    vi.mocked(repo.findLiveCommentIds).mockResolvedValue([{ id: "c1" }])
    vi.mocked(repo.findReactions).mockResolvedValue([])
  })

  it("adds the reaction when the viewer has not put it yet", async () => {
    vi.mocked(repo.findReaction).mockResolvedValue(null)
    vi.mocked(repo.findReactions).mockResolvedValue([r("👍", "u1", "Alice", "c1")])
    const out = await svc.toggleReaction("p1", input, ACTOR)
    expect(repo.createReaction).toHaveBeenCalledWith(TX, { projectId: "p1", targetType: "comment", targetId: "c1", userId: "u1", emoji: "👍" })
    expect(out.active).toBe(true)
    expect(out.reactions).toEqual([{ emoji: "👍", count: 1, mine: true, users: ["Alice"] }])
  })

  it("takes the reaction back when it is already there", async () => {
    vi.mocked(repo.findReaction).mockResolvedValue({ id: "rx1" })
    const out = await svc.toggleReaction("p1", input, ACTOR)
    expect(repo.deleteReaction).toHaveBeenCalledWith(TX, "rx1")
    expect(repo.createReaction).not.toHaveBeenCalled()
    expect(out).toEqual({ active: false, reactions: [] })
  })

  it("treats a lost double-click race as added", async () => {
    vi.mocked(repo.findReaction).mockResolvedValue(null)
    vi.mocked(repo.createReaction).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }))
    expect((await svc.toggleReaction("p1", input, ACTOR)).active).toBe(true)
  })

  it("rethrows other database errors", async () => {
    vi.mocked(repo.findReaction).mockResolvedValue(null)
    vi.mocked(repo.createReaction).mockRejectedValue(new Error("boom"))
    await expect(svc.toggleReaction("p1", input, ACTOR)).rejects.toThrow("boom")
  })

  it("refuses a target that is not in the project", async () => {
    vi.mocked(repo.findLiveCommentIds).mockResolvedValue([])
    await expect(svc.toggleReaction("p1", input, ACTOR)).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.createReaction).not.toHaveBeenCalled()
  })

  it("stores a reaction on a chat mirror under its comment and notifies both views", async () => {
    vi.mocked(repo.findLiveTeamMessages).mockResolvedValue([{ id: "m1", commentId: "c1" }])
    vi.mocked(repo.findMirrorMessageId).mockResolvedValue({ id: "m1" })
    vi.mocked(repo.findReaction).mockResolvedValue(null)
    await svc.toggleReaction("p1", { targetType: "team_message", targetId: "m1", emoji: "🎉" }, ACTOR)
    expect(repo.createReaction).toHaveBeenCalledWith(TX, expect.objectContaining({ targetType: "comment", targetId: "c1" }))
    const published = publishAfterCommit.mock.calls.map(([e]) => `${e.entityType}:${e.entityId}`).sort()
    expect(published).toEqual(["comment:c1", "team_message:m1"])
    expect(publishAfterCommit.mock.calls[0][0]).toMatchObject({ type: "reaction", projectId: "p1", actorId: "u1" })
  })
})

describe("schemas", () => {
  it("accepts only the fixed palette", () => {
    expect(toggleReactionSchema.safeParse({ targetType: "comment", targetId: "c", emoji: "👍" }).success).toBe(true)
    expect(toggleReactionSchema.safeParse({ targetType: "comment", targetId: "c", emoji: "💩" }).success).toBe(false)
    expect(toggleReactionSchema.safeParse({ targetType: "pbi", targetId: "c", emoji: "👍" }).success).toBe(false)
  })

  it("dedupes ids and caps their number", () => {
    expect(reactionsQuerySchema.parse({ targetType: "comment", ids: "a, b,a,," }).ids).toEqual(["a", "b"])
    const many = Array.from({ length: 201 }, (_, i) => `i${i}`).join(",")
    expect(reactionsQuerySchema.safeParse({ targetType: "comment", ids: many }).success).toBe(false)
  })
})
