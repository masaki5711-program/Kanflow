import { describe, expect, it } from "vitest"
import { DRAG_THRESHOLD_PX, IDLE, dndReducer, dropResultOf, type DndState } from "./board-dnd-reducer"

const down = { type: "pointerDown", taskId: "t1", from: "todo", laneKey: "all", x: 100, y: 100 } as const

function run(...actions: Parameters<typeof dndReducer>[1][]): DndState {
  return actions.reduce<DndState>((s, a) => dndReducer(s, a), IDLE)
}

describe("dndReducer — pointer", () => {
  it("stays pending until the pointer moved past the threshold (a plain click is not a drag)", () => {
    const s = run(down, { type: "pointerMove", x: 100 + DRAG_THRESHOLD_PX - 1, y: 100, over: "todo", overLane: "all" })
    expect(s.phase).toBe("pending")
    expect(dropResultOf(s)).toBeNull()
  })

  it("starts dragging past the threshold and tracks offset and target column", () => {
    const s = run(down, { type: "pointerMove", x: 160, y: 90, over: "in_progress", overLane: "all" })
    expect(s).toMatchObject({ phase: "dragging", source: "pointer", taskId: "t1", from: "todo", over: "in_progress", dx: 60, dy: -10 })
    expect(dropResultOf(s)).toEqual({ taskId: "t1", from: "todo", to: "in_progress" })
  })

  it("has no drop result over the source column or outside any column", () => {
    expect(dropResultOf(run(down, { type: "pointerMove", x: 120, y: 140, over: "todo", overLane: "all" }))).toBeNull()
    expect(dropResultOf(run(down, { type: "pointerMove", x: 120, y: 140, over: null, overLane: null }))).toBeNull()
  })

  it("cancel and reset return to idle", () => {
    const dragging = run(down, { type: "pointerMove", x: 160, y: 90, over: "done", overLane: "all" })
    expect(dndReducer(dragging, { type: "cancel" })).toBe(IDLE)
    expect(dndReducer(dragging, { type: "reset" })).toBe(IDLE)
  })

  it("ignores pointer moves while idle or during a keyboard drag", () => {
    expect(dndReducer(IDLE, { type: "pointerMove", x: 1, y: 1, over: "done", overLane: null })).toBe(IDLE)
    const kb = run({ type: "keyboardPickUp", taskId: "t1", from: "todo", laneKey: "all" })
    expect(dndReducer(kb, { type: "pointerMove", x: 999, y: 1, over: "done", overLane: null })).toBe(kb)
  })

  it("ignores a second pointer down while a drag is in progress", () => {
    const dragging = run(down, { type: "pointerMove", x: 160, y: 90, over: "done", overLane: "all" })
    expect(dndReducer(dragging, { ...down, taskId: "t2" })).toBe(dragging)
  })
})

describe("dndReducer — keyboard", () => {
  const pick = { type: "keyboardPickUp", taskId: "t1", from: "in_progress", laneKey: "u1" } as const

  it("picks the card up over its own column", () => {
    const s = run(pick)
    expect(s).toMatchObject({ phase: "dragging", source: "keyboard", over: "in_progress", overLane: "u1" })
    expect(dropResultOf(s)).toBeNull()
  })

  it("moves one column per arrow press and clamps at the edges", () => {
    expect(run(pick, { type: "keyboardMove", delta: 1 })).toMatchObject({ over: "done" })
    expect(run(pick, { type: "keyboardMove", delta: 1 }, { type: "keyboardMove", delta: 1 })).toMatchObject({ over: "done" })
    expect(run(pick, { type: "keyboardMove", delta: -1 }, { type: "keyboardMove", delta: -1 })).toMatchObject({ over: "todo" })
    expect(dropResultOf(run(pick, { type: "keyboardMove", delta: -1 }))).toEqual({ taskId: "t1", from: "in_progress", to: "todo" })
  })

  it("ignores arrow moves when not dragging", () => {
    expect(dndReducer(IDLE, { type: "keyboardMove", delta: 1 })).toBe(IDLE)
  })
})
