import { describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

/** learningUse at use time, without a database: an unknown value fails closed (never learned from). Synthetic rows. */
const { learnableItemFacts } = await import("../actuals.learnable")

const row = (id: string, learningUse: string | null) => ({
  id,
  templateKey: "k",
  name: "作業",
  plannedDays: 5,
  actualDays: 9,
  waitGapDays: 1,
  role: null,
  ownerId: null,
  ownerConcurrentAvg: null,
  ownerConcurrentPeak: null,
  learningUse,
  pbis: [],
  repos: [],
  snapshot: { projectId: "p", lineage: "l", projectType: "t", closedAt: new Date("2026-01-01"), firstFinalizedAt: new Date("2026-01-02") },
})

function fakeDb(rows: ReturnType<typeof row>[]) {
  return {
    planActualsItem: { findMany: async () => rows },
    productBacklogItem: { findMany: async () => [] },
    projectAttribute: { findMany: async () => [] },
  } as unknown as Parameters<typeof learnableItemFacts>[1]
}

describe("learningUse in learnableItemFacts", () => {
  it("an unknown learningUse fails closed; excluded is not learned; waiting moves the overrun into the wait", async () => {
    const facts = await learnableItemFacts(["a", "b", "c", "d"], fakeDb([row("a", null), row("b", "waiting"), row("c", "excluded"), row("d", "something_new")]))
    expect(facts.map((f) => f.snapshotItemId)).toEqual(["a", "b"])
    expect(facts[0]).toMatchObject({ actualDays: 9, waitGapDays: 1 })
    expect(facts[0]).not.toHaveProperty("learningUse")
    expect(facts[1]).toMatchObject({ actualDays: 5, waitGapDays: 5, learningUse: "waiting" })
  })
})
