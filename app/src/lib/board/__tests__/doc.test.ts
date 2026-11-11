import { describe, expect, it } from "vitest"
import {
  acknowledge,
  applyPatch,
  canRedo,
  canUndo,
  changedWrites,
  chunkWrites,
  commit,
  docFromStored,
  hasUnsavedChanges,
  HISTORY_LIMIT,
  initialState,
  markAttempted,
  rebaseStale,
  redo,
  undo,
  EMPTY_DOC,
} from "../doc"
import type { BoxElement, StoredElement } from "../model"

function box(id: string, x = 0, extra: Partial<BoxElement> = {}): BoxElement {
  return { id, type: "rect", x, y: 0, w: 100, h: 50, z: 1, text: "", fill: "white", stroke: "ink", ...extra }
}

function stored(el: BoxElement, version: number, deleted = false): StoredElement {
  const { id, ...data } = el
  return { id, version, deleted, data }
}

describe("docFromStored", () => {
  it("reads live elements and remembers the versions of deleted ones", () => {
    const { doc, saved } = docFromStored([stored(box("a"), 3), stored(box("b"), 5, true)])
    expect(Object.keys(doc.elements)).toEqual(["a"])
    expect(doc.versions).toEqual({ a: 3, b: 5 })
    expect(saved).toEqual({ a: 3, b: 5 })
    expect(hasUnsavedChanges(doc, saved)).toBe(false)
  })
})

describe("applyPatch", () => {
  it("adds, changes and deletes; the version grows by one per change; the inverse restores", () => {
    const first = applyPatch(EMPTY_DOC, { a: box("a"), b: box("b") })
    expect(first.doc.versions).toEqual({ a: 1, b: 1 })
    expect(first.inverse).toEqual({ a: null, b: null })

    const second = applyPatch(first.doc, { a: box("a", 50), b: null })
    expect(second.doc.elements).toEqual({ a: box("a", 50) })
    expect(second.doc.versions).toEqual({ a: 2, b: 2 })
    expect(second.inverse).toEqual({ a: box("a"), b: box("b") })

    const back = applyPatch(second.doc, second.inverse)
    expect(back.doc.elements).toEqual({ a: box("a"), b: box("b") })
    expect(back.doc.versions).toEqual({ a: 3, b: 3 })
  })

  it("skips entries that change nothing (no version bump)", () => {
    const { doc } = applyPatch(EMPTY_DOC, { a: box("a") })
    const same = applyPatch(doc, { a: { ...box("a") }, missing: null })
    expect(same.changed).toBe(false)
    expect(same.doc).toBe(doc)
  })

  it("never touches an element of an unknown type", () => {
    const { doc } = docFromStored([{ id: "img", version: 4, deleted: false, data: { type: "image", fileId: "f" } }])
    const result = applyPatch(doc, { img: null })
    expect(result.changed).toBe(false)
    expect(result.doc.elements.img).toBeDefined()
  })
})

describe("undo / redo", () => {
  it("undoes and redoes steps in order", () => {
    let state = initialState()
    state = commit(state, { a: box("a") })
    state = commit(state, { a: box("a", 40) })
    expect(canUndo(state)).toBe(true)
    expect(canRedo(state)).toBe(false)

    state = undo(state)
    expect(state.doc.elements.a).toEqual(box("a"))
    state = undo(state)
    expect(state.doc.elements.a).toBeUndefined()
    expect(canUndo(state)).toBe(false)
    expect(undo(state)).toBe(state)

    state = redo(state)
    state = redo(state)
    expect(state.doc.elements.a).toEqual(box("a", 40))
    expect(redo(state)).toBe(state)
  })

  it("a new change clears the redo stack", () => {
    let state = commit(initialState(), { a: box("a") })
    state = undo(state)
    state = commit(state, { b: box("b") })
    expect(canRedo(state)).toBe(false)
    expect(Object.keys(state.doc.elements)).toEqual(["b"])
  })

  it("a patch that changes nothing is not a step", () => {
    const state = commit(initialState(), { a: box("a") })
    expect(commit(state, { a: box("a") })).toBe(state)
    expect(commit(state, {})).toBe(state)
  })

  it("undo is a change like any other: the version keeps growing, so it is saved", () => {
    let state = commit(initialState(), { a: box("a") })
    const saved = acknowledge({}, changedWrites(state.doc, {}), [])
    state = commit(state, { a: box("a", 10) })
    state = undo(state)
    expect(state.doc.versions.a).toBe(3)
    expect(changedWrites(state.doc, saved)).toEqual([{ id: "a", version: 3, data: expect.objectContaining({ x: 0 }) }])
  })

  it("keeps a bounded number of steps", () => {
    let state = initialState()
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) state = commit(state, { a: box("a", i) })
    expect(state.undoStack).toHaveLength(HISTORY_LIMIT)
  })
})

describe("changed set", () => {
  it("sends only the elements whose version is above the saved one", () => {
    const { doc, saved } = docFromStored([stored(box("a"), 1), stored(box("b"), 1), stored(box("c"), 1)])
    const next = applyPatch(doc, { b: box("b", 77), c: null, d: box("d") }).doc
    const writes = changedWrites(next, saved)
    expect(writes).toEqual([
      { id: "b", version: 2, data: expect.objectContaining({ type: "rect", x: 77 }) },
      { id: "c", version: 2, deleted: true },
      { id: "d", version: 1, data: expect.objectContaining({ type: "rect" }) },
    ])
    expect(writes[0]).not.toHaveProperty("data.id")
  })

  it("does not send an element created and deleted before it was ever saved", () => {
    let doc = applyPatch(EMPTY_DOC, { a: box("a") }).doc
    doc = applyPatch(doc, { a: null }).doc
    expect(changedWrites(doc, {})).toEqual([])
    expect(hasUnsavedChanges(doc, {})).toBe(false)
  })

  it("after a request without an answer, a later delete of a sent element is still sent", () => {
    let doc = applyPatch(EMPTY_DOC, { a: box("a") }).doc
    const sent = changedWrites(doc, {})
    const saved = markAttempted({}, sent)
    expect(changedWrites(doc, saved)).toHaveLength(1)
    doc = applyPatch(doc, { a: null }).doc
    expect(changedWrites(doc, saved)).toEqual([{ id: "a", version: 2, deleted: true }])
  })

  it("acknowledge marks what was sent as saved; a change made meanwhile stays unsaved", () => {
    let doc = applyPatch(EMPTY_DOC, { a: box("a"), b: box("b") }).doc
    const sent = changedWrites(doc, {})
    doc = applyPatch(doc, { b: box("b", 5) }).doc
    const saved = acknowledge({}, sent, [])
    expect(saved).toEqual({ a: 1, b: 1 })
    expect(changedWrites(doc, saved).map((w) => w.id)).toEqual(["b"])
  })

  it("a stale write is rebased above the server's version and sent again (the later save wins)", () => {
    const { doc, saved } = docFromStored([stored(box("a"), 4)])
    const local = applyPatch(doc, { a: box("a", 99) }).doc
    const sent = changedWrites(local, saved)
    expect(sent[0].version).toBe(5)
    const serverRow = stored(box("a", 11), 7)

    const nextSaved = acknowledge(saved, sent, [serverRow])
    const rebased = rebaseStale(local, [serverRow])
    expect(nextSaved.a).toBe(7)
    expect(rebased.versions.a).toBe(8)
    expect(rebased.elements.a).toEqual(box("a", 99))
    expect(changedWrites(rebased, nextSaved)).toEqual([{ id: "a", version: 8, data: expect.objectContaining({ x: 99 }) }])
    expect(rebaseStale(local, [])).toBe(local)
  })

  it("splits a large change into requests", () => {
    const writes = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, version: 1, deleted: true as const }))
    expect(chunkWrites(writes, 2).map((c) => c.length)).toEqual([2, 2, 1])
    expect(chunkWrites([], 2)).toEqual([])
  })
})
