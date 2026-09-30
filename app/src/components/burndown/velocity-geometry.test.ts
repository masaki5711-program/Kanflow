import { describe, expect, it } from "vitest"
import { V_INNER_HEIGHT, V_INNER_WIDTH, V_PADDING, velocityScale, type VelocityPoint } from "./velocity-geometry"

const pt = (id: string, points: number, capacity = 0): VelocityPoint => ({ id, name: id, status: "done", points, capacity, endDate: "2026-01-01T00:00:00.000Z" })

describe("velocityScale", () => {
  it("scales to the highest of points, capacity and average (top tick = max)", () => {
    const s = velocityScale({ sprints: [pt("a", 4, 12), pt("b", 8)], average: 6 })
    expect(s.maxY).toBe(12)
    expect(s.ticks).toEqual([0, 5, 10, 12])
    expect(s.toY(0)).toBe(V_PADDING.top + V_INNER_HEIGHT)
    expect(s.toY(12)).toBe(V_PADDING.top)
    expect(s.toY(-3)).toBe(s.toY(0))
  })

  it("never divides by zero for empty or all-zero data", () => {
    const s = velocityScale({ sprints: [], average: null })
    expect(s.maxY).toBe(1)
    expect(Number.isFinite(s.toY(0))).toBe(true)
    expect(s.bar(0).center).toBe(V_PADDING.left + V_INNER_WIDTH / 2)
  })

  it("lays bars out in equal slots, centred, capped in width", () => {
    const eight = velocityScale({ sprints: Array.from({ length: 8 }, (_, i) => pt(`s${i}`, i)), average: 3 })
    const slot = V_INNER_WIDTH / 8
    expect(eight.bar(1).center - eight.bar(0).center).toBeCloseTo(slot)
    expect(eight.bar(0).width).toBeCloseTo(slot * 0.56)
    const one = velocityScale({ sprints: [pt("a", 1)], average: 1 })
    expect(one.bar(0).width).toBe(56)
    expect(one.bar(0).x + one.bar(0).width / 2).toBe(one.bar(0).center)
  })
})
