import { describe, expect, it } from "vitest"
import { criticalPath, learnParallelCap, level, type LevelInput, type LevelItem } from "../level"

const item = (key: string, days: number, over: Partial<LevelItem> = {}): LevelItem => ({ key, days, load: 1, role: "dev", predecessors: [], order: 0, ...over })
const fullTime = () => 1
const cap = (n: number) => () => n

/** No person-day above capacity, recomputed independently of the engine. */
function maxDailyUse(input: LevelInput, result: ReturnType<typeof level>): number {
  const byKey = new Map(input.items.map((i) => [i.key, i]))
  const used = new Map<string, number>()
  for (const p of result.placements) {
    const parts = p.split ?? [p]
    for (const part of parts) {
      if (!part.owner) continue
      for (let d = part.start; d <= part.end; d++) used.set(`${part.owner}|${d}`, (used.get(`${part.owner}|${d}`) ?? 0) + (byKey.get(p.key)?.load ?? 0))
    }
  }
  let worst = 0
  for (const [k, u] of used) {
    const [owner, d] = k.split("|")
    worst = Math.max(worst, u - input.capacity(owner, Number(d)))
  }
  return worst
}

describe("critical path", () => {
  it("computes float: the longest chain has none", () => {
    const items = [item("a", 3, { order: 0 }), item("b", 2, { predecessors: ["a"], order: 1 }), item("side", 1, { order: 2 })]
    const cpm = criticalPath(items)
    expect(cpm.tf.get("a")).toBe(0)
    expect(cpm.tf.get("b")).toBe(0)
    expect(cpm.tf.get("side")).toBe(4)
  })
})

describe("level", () => {
  it("critical_path_item_scheduled_first", () => {
    // One person; 'side' comes first in the template but has float, 'crit' gates a long chain.
    const items = [item("side", 2, { order: 0 }), item("crit", 2, { order: 1 }), item("tail", 5, { predecessors: ["crit"], order: 2 })]
    const r = level({ items, assign: { dev: ["u1"] }, capacity: fullTime, parallelCap: cap(1) })
    const at = Object.fromEntries(r.placements.map((p) => [p.key, p]))
    expect(at.crit.start).toBe(0)
    expect(at.side.start).toBeGreaterThan(at.crit.start)
  })

  it("no_user_exceeds_capacity_after_leveling (3 people, load from another project)", () => {
    // u2 is fully busy in another project on days 0..4 (C = 0), u3 works half-time.
    const capacity = (u: string, d: number) => (u === "u2" && d < 5 ? 0 : u === "u3" ? 0.5 : 1)
    const items = Array.from({ length: 6 }, (_, i) => item(`t${i}`, 3, { order: i, load: i % 2 ? 0.5 : 1 }))
    const input: LevelInput = { items, assign: { dev: ["u1", "u2", "u3"] }, capacity, parallelCap: cap(2) }
    const r = level(input)
    expect(maxDailyUse(input, r)).toBeLessThanOrEqual(1e-9)
    expect(Object.values(r.after).every((s) => s.daysOverCapacity === 0)).toBe(true)
    // Before levelling, everything sat on the first candidate at day 0: over capacity.
    expect(r.before.u1.daysOverCapacity).toBeGreaterThan(0)
    expect(r.moves.length).toBeGreaterThan(0)
  })

  it("extends the end only as much as the capacity requires", () => {
    // Two independent 3-day items, one person: they cannot overlap, so the plan takes 6 days — not more.
    const r = level({ items: [item("a", 3, { order: 0 }), item("b", 3, { order: 1 })], assign: { dev: ["u1"] }, capacity: fullTime, parallelCap: cap(2) })
    expect(r.end).toBe(5)
    // With two people they run side by side.
    const r2 = level({ items: [item("a", 3, { order: 0 }), item("b", 3, { order: 1 })], assign: { dev: ["u1", "u2"] }, capacity: fullTime, parallelCap: cap(2) })
    expect(r2.end).toBe(2)
  })

  it("zero_load_item_consumes_no_capacity", () => {
    const items = [item("wait", 10, { load: 0, order: 0 }), item("work", 2, { order: 1 })]
    const r = level({ items, assign: { dev: ["u1"] }, capacity: fullTime, parallelCap: cap(1) })
    const at = Object.fromEntries(r.placements.map((p) => [p.key, p]))
    // The waiting item does not block the person: the work starts on day 0 too.
    expect(at.work.start).toBe(0)
    expect(r.after.u1).toEqual({ maxUtilization: 1, daysOverCapacity: 0 })
  })

  it("respects the parallel cap m_u", () => {
    const items = [item("a", 2, { load: 0.3, order: 0 }), item("b", 2, { load: 0.3, order: 1 }), item("c", 2, { load: 0.3, order: 2 })]
    const r = level({ items, assign: { dev: ["u1"] }, capacity: fullTime, parallelCap: cap(2) })
    const starts = r.placements.map((p) => p.start).sort()
    expect(starts).toEqual([0, 0, 2])
  })

  it("unassigned_role_leaves_owner_null", () => {
    const r = level({ items: [item("a", 2, { role: "qa" }), item("b", 2, { role: null, order: 1 })], assign: { dev: ["u1"] }, capacity: fullTime, parallelCap: cap(2) })
    expect(r.placements.map((p) => p.owner)).toEqual([null, null])
  })

  it("split_suggested_only_when_it_finishes_earlier", () => {
    // A long critical item that would wait for u1's other work; u2 is free: splitting finishes earlier.
    const capacity = (u: string, d: number) => (u === "u1" && d < 4 ? 0 : 1)
    const r = level({ items: [item("big", 8)], assign: { dev: ["u1", "u2"] }, capacity: (u, d) => (u === "u2" && d < 6 ? 0 : capacity(u, d)), parallelCap: cap(1) })
    const big = r.placements[0]
    const single = 4 + 8 - 1 // u1 free from day 4
    expect(big.split).toHaveLength(2)
    expect(big.end).toBeLessThan(single)
    expect(new Set(big.split?.map((s) => s.owner)).size).toBe(2)
    expect(r.moves).toContainEqual(expect.objectContaining({ key: "big", reason: "split" }))
    // Both free from day 0: no reason to split (no delay beyond the latest start).
    const free = level({ items: [item("big", 8)], assign: { dev: ["u1", "u2"] }, capacity: fullTime, parallelCap: cap(1) })
    expect(free.placements[0].split).toBeUndefined()
  })

  it("split_suggested_only_when_it_finishes_earlier: a late item whose halves would not end earlier stays whole", () => {
    // u1 is free from day 2, u2 only from day 9. The single placement on u1 ends day 2 + 8 − 1 = 9 (later than its
    // latest start 0 → "late"); the halves (5 days each) would end max(2, 9) + 5 − 1 = 13 → not earlier → no split.
    const capacity = (u: string, d: number) => ((u === "u1" && d < 2) || (u === "u2" && d < 9) ? 0 : 1)
    const r = level({ items: [item("big", 8)], assign: { dev: ["u1", "u2"] }, capacity, parallelCap: cap(1) })
    expect(r.placements[0]).toMatchObject({ start: 2, end: 9, owner: "u1" })
    expect(r.placements[0].split).toBeUndefined()
  })

  it("a short item is split only with a split rule (D < 4 needs `splittable`)", () => {
    const capacity = (u: string, d: number) => (u === "u1" && d < 6 ? 0 : u === "u2" && d < 6 ? 0 : 1)
    const busy = (u: string, d: number) => (u === "u1" ? capacity(u, d) : u === "u2" && d < 1 ? 0 : 1)
    const plain = level({ items: [item("short", 3)], assign: { dev: ["u1", "u2"] }, capacity: busy, parallelCap: cap(1) })
    expect(plain.placements[0].split).toBeUndefined()
    const ruled = level({ items: [item("short", 3, { splittable: true })], assign: { dev: ["u1", "u2"] }, capacity: (u, d) => (u === "u1" && d < 1 ? 0 : u === "u2" && d < 1 ? 0 : 1), parallelCap: cap(1) })
    // Both free from day 1: whole = days 1..3; halves of ceil(1.5 × 1.1) = 2 days each end on day 2 → earlier.
    expect(ruled.placements[0].split).toHaveLength(2)
    expect(ruled.placements[0].end).toBe(2)
  })

  it("a half-time person can hold a full item (it takes all their time), and an FTE-0 day holds nothing", () => {
    // u1 works half-time; no one else. C = FTE = 0.5 and ℓ = 1: the item takes min(1, 0.5) = 0.5 → it fits.
    const half = level({ items: [item("a", 3)], assign: { dev: ["u1"] }, capacity: () => 0.5, fte: () => 0.5, parallelCap: cap(2) })
    expect(half.placements[0]).toMatchObject({ start: 0, owner: "u1" })
    expect(half.placements[0].overloaded).toBeUndefined()
    expect(half.after.u1).toEqual({ maxUtilization: 1, daysOverCapacity: 0 })
    // Two full items cannot run side by side for that person.
    const two = level({ items: [item("a", 3, { order: 0 }), item("b", 3, { order: 1 })], assign: { dev: ["u1"] }, capacity: () => 0.5, fte: () => 0.5, parallelCap: cap(2) })
    expect(two.placements.map((p) => p.start).sort()).toEqual([0, 3])
    // A day off (FTE 0) on day 1: the 2-day item starts on day 2.
    const off = level({ items: [item("a", 2)], assign: { dev: ["u1"] }, capacity: (_u, d) => (d === 1 ? 0 : 1), fte: (_u, d) => (d === 1 ? 0 : 1), parallelCap: cap(2) })
    expect(off.placements[0].start).toBe(2)
    // A waiting item (ℓ = 0) may sit on a day off.
    const wait = level({ items: [item("w", 2, { load: 0 })], assign: { dev: ["u1"] }, capacity: () => 0, fte: () => 0, parallelCap: cap(2) })
    expect(wait.placements[0]).toMatchObject({ start: 0, owner: "u1" })
  })

  it("an item that cannot fit is overloaded on the candidate given the least so far", () => {
    const r = level({ items: [item("a", 2, { order: 0 }), item("b", 2, { order: 1 })], assign: { dev: ["u1", "u2"] }, capacity: () => 0, parallelCap: cap(1) })
    expect(new Set(r.placements.map((p) => p.owner))).toEqual(new Set(["u1", "u2"]))
    expect(r.placements.every((p) => p.overloaded)).toBe(true)
  })

  it("an item that cannot fit within the horizon is placed at its earliest start and flagged", () => {
    const r = level({ items: [item("a", 2)], assign: { dev: ["u1"] }, capacity: () => 0, parallelCap: cap(1) })
    expect(r.placements[0]).toMatchObject({ start: 0, owner: "u1", overloaded: true })
  })

  it("is deterministic: the same input gives the same placement", () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`t${i}`, (i % 4) + 1, { order: i, predecessors: i > 2 ? [`t${i - 3}`] : [], load: (i % 3) / 2 }))
    const input: LevelInput = { items, assign: { dev: ["u3", "u1", "u2"] }, capacity: (u, d) => (u === "u2" && d % 5 === 0 ? 0.5 : 1), parallelCap: cap(2) }
    expect(level(input)).toEqual(level(input))
  })

  it("levels 500 items within 2 seconds", () => {
    const items = Array.from({ length: 500 }, (_, i) => item(`t${i}`, (i % 7) + 1, { order: i, predecessors: i % 10 && i > 0 ? [`t${i - 1}`] : [], load: i % 5 === 0 ? 0 : 0.5, role: i % 3 ? "dev" : "qa" }))
    const input: LevelInput = { items, assign: { dev: ["u1", "u2", "u3"], qa: ["u4"] }, capacity: (u, d) => (u === "u1" && d % 7 === 0 ? 0 : 1), parallelCap: cap(2) }
    const t = performance.now()
    const r = level(input)
    expect(performance.now() - t).toBeLessThan(2000)
    expect(r.placements).toHaveLength(500)
    expect(maxDailyUse(input, r)).toBeLessThanOrEqual(1e-9)
  })
})

describe("learnParallelCap (m_u)", () => {
  it("defaults to 2 without history and shrinks the 80th percentile toward it", () => {
    expect(learnParallelCap([])).toBe(2)
    // p80 of [4,4,4,4,4,4] = 4; α = 6 / 9 → 2 + 2 × 0.67 = 3.33 → 3.
    expect(learnParallelCap([4, 4, 4, 4, 4, 4])).toBe(3)
    expect(learnParallelCap([1])).toBe(2) // one observation barely moves it
    expect(learnParallelCap(Array.from({ length: 50 }, () => 9))).toBe(5) // capped
  })
})
