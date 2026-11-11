import { describe, expect, it } from "vitest"
import { jsonEqual } from "../equal"
import { planMerge, type ExistingElement } from "../merge"
import type { ElementWrite } from "../model"

const data = (x: number) => ({ type: "rect", x, y: 0, w: 10, h: 10, z: 1, text: "", fill: "white", stroke: "ink" })

function existing(rows: Record<string, ExistingElement>) {
  return new Map(Object.entries(rows))
}

describe("planMerge (the higher version stays)", () => {
  it("stores a new element", () => {
    const write: ElementWrite = { id: "a", version: 1, data: data(1) }
    expect(planMerge(existing({}), [write])).toEqual({ apply: [write], unchanged: [], stale: [], liveDelta: 1 })
  })

  it("stores a higher version over the stored one", () => {
    const write: ElementWrite = { id: "a", version: 3, data: data(9) }
    const plan = planMerge(existing({ a: { version: 2, deleted: false, data: data(1) } }), [write])
    expect(plan).toEqual({ apply: [write], unchanged: [], stale: [], liveDelta: 0 })
  })

  it("keeps the stored row when the version sent is lower, or equal with other content", () => {
    const rows = existing({ a: { version: 5, deleted: false, data: data(1) }, b: { version: 5, deleted: false, data: data(1) } })
    const plan = planMerge(rows, [
      { id: "a", version: 4, data: data(9) },
      { id: "b", version: 5, data: data(9) },
    ])
    expect(plan).toEqual({ apply: [], unchanged: [], stale: ["a", "b"], liveDelta: 0 })
  })

  it("treats the same version with the same content as already stored (a repeated request)", () => {
    const rows = existing({
      a: { version: 5, deleted: false, data: { ...data(1), extra: { k: [1, 2] } } },
      b: { version: 2, deleted: true, data: {} },
    })
    const reordered = { extra: { k: [1, 2] }, stroke: "ink", fill: "white", text: "", z: 1, h: 10, w: 10, y: 0, x: 1, type: "rect" }
    const plan = planMerge(rows, [
      { id: "a", version: 5, data: reordered },
      { id: "b", version: 2, deleted: true },
    ])
    expect(plan).toEqual({ apply: [], unchanged: ["a", "b"], stale: [], liveDelta: 0 })
  })

  it("counts live elements: delete −1, restore +1, deleting what is deleted 0", () => {
    const rows = existing({
      live: { version: 1, deleted: false, data: data(1) },
      gone: { version: 1, deleted: true, data: {} },
      gone2: { version: 1, deleted: true, data: {} },
    })
    const plan = planMerge(rows, [
      { id: "live", version: 2, deleted: true },
      { id: "gone", version: 2, data: data(2) },
      { id: "gone2", version: 2, deleted: true },
      { id: "new1", version: 1, data: data(3) },
    ])
    expect(plan.apply.map((w) => w.id)).toEqual(["live", "gone", "gone2", "new1"])
    expect(plan.liveDelta).toBe(1)
  })

  it("deleting an element nobody stored is nothing to do", () => {
    expect(planMerge(existing({}), [{ id: "x", version: 3, deleted: true }])).toEqual({ apply: [], unchanged: ["x"], stale: [], liveDelta: 0 })
  })

  it("a live write against a stored tombstone of the same version is stale", () => {
    const plan = planMerge(existing({ a: { version: 2, deleted: true, data: {} } }), [{ id: "a", version: 2, data: data(1) }])
    expect(plan.stale).toEqual(["a"])
  })
})

describe("jsonEqual", () => {
  it("compares by structure, whatever the key order", () => {
    expect(jsonEqual({ a: 1, b: { c: [1, { d: 2 }] } }, { b: { c: [1, { d: 2 }] }, a: 1 })).toBe(true)
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true)
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(jsonEqual({ a: 1 }, { a: 1, b: null })).toBe(false)
    expect(jsonEqual([1, 2], [2, 1])).toBe(false)
    expect(jsonEqual([1], { 0: 1 })).toBe(false)
    expect(jsonEqual(null, {})).toBe(false)
    expect(jsonEqual("a", "a")).toBe(true)
  })
})
