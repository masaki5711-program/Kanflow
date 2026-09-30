import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../chat-threads.repository")
vi.mock("@/lib/logger", () => {
  const noop = { debug() {}, info() {}, warn() {}, error() {}, child: () => noop }
  return { logger: noop }
})

const repo = await import("../chat-threads.repository")
const svc = await import("../chat-proposal-outcomes.service")
const threads = await import("../chat-threads.service")
const { DEFAULT_DB } = await import("@/services/__tests__/support")
const { ConflictError, NotFoundError } = await import("@/services/_shared/errors")
type ChatProposal = import("@/lib/chat-proposals").ChatProposal
type ProposalOutcome = import("@/lib/chat-proposals").ProposalOutcome

const OWNER = { projectId: "p1", userId: "u1" }
const NOW = new Date("2026-10-01T10:00:00.000Z")
const PROPOSAL: ChatProposal = {
  kind: "create_pbi",
  proposalId: "prop_1",
  title: "Login",
  userStory: "",
  acceptanceCriteria: "",
  storyPoints: null,
  epic: null,
  reason: "",
  possibleDuplicates: [],
}
const outcome = (status: ProposalOutcome["status"], over: Partial<ProposalOutcome> = {}): ProposalOutcome => ({
  status,
  appliedEntityId: null,
  at: NOW.toISOString(),
  by: "u1",
  ...over,
})
const stored = (o?: ProposalOutcome) =>
  JSON.stringify([
    { type: "tool", name: "propose_pbi", ms: 5 },
    o ? { type: "proposal", proposal: PROPOSAL, outcome: o } : { type: "proposal", proposal: PROPOSAL },
  ])

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findOwnedThread).mockResolvedValue({ id: "t1", title: "x", createdAt: NOW, updatedAt: NOW })
  vi.mocked(repo.findProposalMessages).mockResolvedValue([{ id: "m1", toolEvents: stored() }])
  vi.mocked(repo.swapToolEvents).mockResolvedValue(true)
})

describe("nextProposalOutcome", () => {
  const later = (ms: number) => new Date(NOW.getTime() + ms)

  it("reserve: fresh → applying; applied / rejected / a live reservation → conflict", () => {
    expect(svc.nextProposalOutcome(undefined, { action: "reserve" }, "u1", NOW)).toEqual({ next: outcome("applying") })
    for (const cur of [outcome("applied", { appliedEntityId: "x" }), outcome("rejected"), outcome("applying")]) {
      expect(svc.nextProposalOutcome(cur, { action: "reserve" }, "u1", later(1000))).toEqual({ conflict: cur })
    }
  })

  it("reserve takes over an abandoned reservation after the TTL", () => {
    const at = later(svc.PROPOSAL_RESERVATION_TTL_MS + 1)
    expect(svc.nextProposalOutcome(outcome("applying"), { action: "reserve" }, "u2", at)).toEqual({
      next: { status: "applying", appliedEntityId: null, at: at.toISOString(), by: "u2" },
    })
  })

  it("confirm → applied with the created id; idempotent once applied; conflict after reject", () => {
    const applied = svc.nextProposalOutcome(outcome("applying"), { action: "confirm", appliedEntityId: "pbi9" }, "u1", NOW)
    expect(applied).toEqual({ next: outcome("applied", { appliedEntityId: "pbi9" }) })
    const done = outcome("applied", { appliedEntityId: "pbi9" })
    expect(svc.nextProposalOutcome(done, { action: "confirm", appliedEntityId: "other" }, "u1", NOW)).toEqual({ next: done })
    const rejected = svc.nextProposalOutcome(outcome("rejected"), { action: "confirm", appliedEntityId: null }, "u1", NOW)
    expect("conflict" in rejected).toBe(true)
  })

  it("release drops only a reservation; reject refuses applied / applying", () => {
    expect(svc.nextProposalOutcome(outcome("applying"), { action: "release" }, "u1", NOW)).toEqual({ next: undefined })
    const done = outcome("applied")
    expect(svc.nextProposalOutcome(done, { action: "release" }, "u1", NOW)).toEqual({ next: done })
    expect(svc.nextProposalOutcome(undefined, { action: "reject" }, "u1", NOW)).toEqual({ next: outcome("rejected") })
    expect("conflict" in svc.nextProposalOutcome(done, { action: "reject" }, "u1", NOW)).toBe(true)
    expect("conflict" in svc.nextProposalOutcome(outcome("applying"), { action: "reject" }, "u1", NOW)).toBe(true)
  })
})

describe("updateProposalOutcome", () => {
  it("stores the reservation on the proposal event with one compare-and-set", async () => {
    const result = await svc.updateProposalOutcome(OWNER, "t1", "prop_1", { action: "reserve" }, NOW)
    expect(result).toEqual(outcome("applying"))
    expect(repo.findOwnedThread).toHaveBeenCalledWith(DEFAULT_DB, OWNER, "t1")
    expect(repo.findProposalMessages).toHaveBeenCalledWith(DEFAULT_DB, "t1", "prop_1")
    expect(repo.swapToolEvents).toHaveBeenCalledWith(DEFAULT_DB, "m1", stored(), stored(outcome("applying")))
  })

  it("a second approval of an applied proposal is 409 and writes nothing (no duplicate)", async () => {
    const done = outcome("applied", { appliedEntityId: "pbi98" })
    vi.mocked(repo.findProposalMessages).mockResolvedValue([{ id: "m1", toolEvents: stored(done) }])
    const err = await svc.updateProposalOutcome(OWNER, "t1", "prop_1", { action: "reserve" }, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as InstanceType<typeof ConflictError>).extra).toEqual({ outcome: done })
    expect(repo.swapToolEvents).not.toHaveBeenCalled()
  })

  it("re-reads and loses cleanly when a concurrent request won the compare-and-set", async () => {
    vi.mocked(repo.swapToolEvents).mockResolvedValueOnce(false)
    vi.mocked(repo.findProposalMessages)
      .mockResolvedValueOnce([{ id: "m1", toolEvents: stored() }])
      .mockResolvedValueOnce([{ id: "m1", toolEvents: stored(outcome("applying")) }])
    await expect(svc.updateProposalOutcome(OWNER, "t1", "prop_1", { action: "reserve" }, NOW)).rejects.toBeInstanceOf(
      ConflictError
    )
    expect(repo.swapToolEvents).toHaveBeenCalledTimes(1)
  })

  it("release removes the outcome again", async () => {
    vi.mocked(repo.findProposalMessages).mockResolvedValue([{ id: "m1", toolEvents: stored(outcome("applying")) }])
    expect(await svc.updateProposalOutcome(OWNER, "t1", "prop_1", { action: "release" }, NOW)).toBeNull()
    expect(repo.swapToolEvents).toHaveBeenCalledWith(DEFAULT_DB, "m1", stored(outcome("applying")), stored())
  })

  it("keeps the outcome on the oldest message that carries the proposal", async () => {
    vi.mocked(repo.findProposalMessages).mockResolvedValue([
      { id: "m0", toolEvents: JSON.stringify([{ type: "tool", name: "x", ms: 1 }]) },
      { id: "m1", toolEvents: stored() },
      { id: "m2", toolEvents: stored() },
    ])
    await svc.updateProposalOutcome(OWNER, "t1", "prop_1", { action: "reject" }, NOW)
    expect(vi.mocked(repo.swapToolEvents).mock.calls[0][1]).toBe("m1")
  })

  it("404 for another user's thread or a proposal not stored in it", async () => {
    vi.mocked(repo.findProposalMessages).mockResolvedValue([])
    await expect(svc.updateProposalOutcome(OWNER, "t1", "prop_1", { action: "reserve" }, NOW)).rejects.toBeInstanceOf(
      NotFoundError
    )
    vi.mocked(repo.findOwnedThread).mockResolvedValue(null)
    await expect(svc.updateProposalOutcome(OWNER, "t9", "prop_1", { action: "reserve" }, NOW)).rejects.toBeInstanceOf(
      NotFoundError
    )
    expect(repo.swapToolEvents).not.toHaveBeenCalled()
  })
})

describe("stored outcomes in thread messages", () => {
  it("parseToolEvents keeps a valid outcome; toClientContent never leaks it into frames", () => {
    const done = outcome("applied", { appliedEntityId: "pbi98" })
    const events = threads.parseToolEvents(stored(done))
    expect(events[1]).toEqual({ type: "proposal", proposal: PROPOSAL, outcome: done })
    expect(threads.toClientContent("hi", events)).not.toContain("appliedEntityId")
    const bad = JSON.stringify([{ type: "proposal", proposal: PROPOSAL, outcome: { status: "weird" } }])
    expect(threads.parseToolEvents(bad)).toEqual([{ type: "proposal", proposal: PROPOSAL }])
  })
})
