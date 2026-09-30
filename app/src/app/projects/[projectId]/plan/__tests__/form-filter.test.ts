import { describe, expect, it } from "vitest"
import { EMPTY_FILTER, OWNER_NONE, dropTargetAt, gridWidth, isFilterActive, matchesFilter, visibleColumns, COLUMN_WIDTH, NAME_COLUMN_WIDTH, NAME_COLUMN_WIDTH_COMPACT } from "../lib/filter"
import {
  buildCreateInput,
  buildPatch,
  derivedFlags,
  formFromDraft,
  formFromItem,
  isSameForm,
  validateForm,
} from "../lib/plan-form"
import { PLAN_COLUMNS } from "../lib/prefs"
import { mkItem } from "./fixtures"

describe("plan form", () => {
  it("derived flags: parent → dates/status, linked leaf → status, manual leaf → nothing", () => {
    expect(derivedFlags(mkItem({ id: "p", hasChildren: true }), { progressMode: "manual" })).toEqual({ datesDerived: true, statusDerived: true })
    expect(derivedFlags(mkItem({ id: "l" }), { progressMode: "linked" })).toEqual({ datesDerived: false, statusDerived: true })
    expect(derivedFlags(null, { progressMode: "manual" })).toEqual({ datesDerived: false, statusDerived: false })
  })

  it("buildPatch sends only changed fields and never derived ones (parent)", () => {
    const parent = mkItem({ id: "p", hasChildren: true, name: "P", progressPct: 40, status: "in_progress" })
    const form = { ...formFromItem(parent), name: "P2", plannedStart: "2026-01-01", status: "done" as const, progressMode: "linked" as const }
    expect(buildPatch(parent, form)).toEqual({ name: "P2" })
  })

  it("buildPatch for a linked leaf drops progress/status but keeps dates", () => {
    const leaf = mkItem({ id: "l", progressMode: "linked" })
    const form = { ...formFromItem(leaf), plannedEnd: "2026-10-12", status: "done" as const, ownerId: "u1" }
    expect(buildPatch(leaf, form)).toEqual({ plannedEnd: "2026-10-12", ownerId: "u1" })
  })

  it("buildPatch for a manual leaf: status/mode/nulls (progress is never sent)", () => {
    const leaf = mkItem({ id: "l", description: "d", owner: { id: "u1", name: "U" } })
    const form = { ...formFromItem(leaf), status: "done" as const, description: " ", ownerId: "", progressMode: "linked" as const }
    expect(buildPatch(leaf, form)).toEqual({ description: null, ownerId: null, progressMode: "linked" })
    expect(buildPatch(leaf, { ...formFromItem(leaf), status: "done", actualStart: "2026-10-02" })).toEqual({ status: "done", actualStart: "2026-10-02" })
    expect(isSameForm(formFromItem(leaf), formFromItem(leaf))).toBe(true)
  })

  it("milestone uses one date", () => {
    const ms = mkItem({ id: "m", isMilestone: true, plannedStart: "2026-10-05", plannedEnd: "2026-10-05" })
    expect(buildPatch(ms, { ...formFromItem(ms), plannedStart: "2026-10-07" })).toEqual({ plannedStart: "2026-10-07", plannedEnd: "2026-10-07" })
  })

  it("draft → create input", () => {
    const form = { ...formFromDraft({ parentId: "A", isMilestone: false, plannedStart: "2026-10-01", plannedEnd: "2026-10-07" }), name: " Build " }
    expect(buildCreateInput(form)).toEqual({
      name: "Build",
      parentId: "A",
      plannedStart: "2026-10-01",
      plannedEnd: "2026-10-07",
      status: "not_started",
      description: null,
      notes: null,
      ownerId: null,
      isMilestone: false,
      progressMode: "manual",
    })
    const linked = buildCreateInput({ ...form, progressMode: "linked", actualStart: "2026-10-02" })
    expect(linked).not.toHaveProperty("status")
    expect(linked).not.toHaveProperty("actualStart")
  })

  it("validation", () => {
    const base = formFromDraft({ parentId: null, isMilestone: false, plannedStart: "2026-10-05", plannedEnd: "2026-10-01" })
    const flags = derivedFlags(null, base)
    expect(validateForm(base, flags)).toEqual({ name: true, plannedEnd: true })
    expect(validateForm({ ...base, name: "x", plannedStart: "" }, flags)).toEqual({ plannedStart: true })
    expect(validateForm({ ...base, name: "x", plannedEnd: "2026-10-05", actualStart: "2026-10-05", actualEnd: "2026-10-01" }, flags)).toEqual({ actualEnd: true })
    // derived dates are not validated
    expect(validateForm({ ...base, name: "x" }, { ...flags, datesDerived: true })).toEqual({})
  })
})

describe("filters and columns", () => {
  const a = mkItem({ id: "a", name: "Design", scheduleState: "delayed", owner: { id: "u1", name: "U" } })
  const b = mkItem({ id: "b", name: "Build", status: "on_hold", scheduleState: "delayed" })

  it("matches name (displayed or original), state and owner", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(matchesFilter(a, { ...EMPTY_FILTER, q: "sign" }, "Design")).toBe(true)
    expect(matchesFilter(a, { ...EMPTY_FILTER, q: "設計" }, "設計")).toBe(true)
    expect(matchesFilter(a, { ...EMPTY_FILTER, q: "zzz" }, "Design")).toBe(false)
    expect(matchesFilter(a, { ...EMPTY_FILTER, state: "delayed" }, "Design")).toBe(true)
    expect(matchesFilter(b, { ...EMPTY_FILTER, state: "delayed" }, "Build")).toBe(false)
    expect(matchesFilter(b, { ...EMPTY_FILTER, state: "on_hold" }, "Build")).toBe(true)
    expect(matchesFilter(a, { ...EMPTY_FILTER, state: "on_hold" }, "Design")).toBe(false)
    const c = mkItem({ id: "c", name: "Hold", status: "on_hold", scheduleState: "on_hold" })
    expect(matchesFilter(c, { ...EMPTY_FILTER, state: "on_hold" }, "Hold")).toBe(true)
    expect(matchesFilter(c, { ...EMPTY_FILTER, state: "not_started" }, "Hold")).toBe(false)
    expect(matchesFilter(a, { ...EMPTY_FILTER, owner: "u1" }, "Design")).toBe(true)
    expect(matchesFilter(b, { ...EMPTY_FILTER, owner: "u1" }, "Build")).toBe(false)
    expect(matchesFilter(b, { ...EMPTY_FILTER, owner: OWNER_NONE }, "Build")).toBe(true)
    expect(matchesFilter(a, { ...EMPTY_FILTER, owner: OWNER_NONE }, "Design")).toBe(false)
  })

  it("column visibility and grid width", () => {
    expect(visibleColumns(["owner"], false, PLAN_COLUMNS)).toEqual(["start", "end", "duration", "progress", "status"])
    expect(visibleColumns([], true, PLAN_COLUMNS)).toEqual([])
    expect(gridWidth([], true)).toBe(NAME_COLUMN_WIDTH_COMPACT)
    expect(gridWidth(["start", "end"], false)).toBe(NAME_COLUMN_WIDTH + COLUMN_WIDTH.start + COLUMN_WIDTH.end)
  })

  it("dropTargetAt picks the row half under the pointer", () => {
    const ids = ["a", "b", "c"]
    expect(dropTargetAt(5, ids, 40)).toEqual({ targetId: "a", position: "before" })
    expect(dropTargetAt(30, ids, 40)).toEqual({ targetId: "a", position: "after" })
    expect(dropTargetAt(85, ids, 40)).toEqual({ targetId: "c", position: "before" })
    expect(dropTargetAt(-20, ids, 40)).toEqual({ targetId: "a", position: "before" })
    expect(dropTargetAt(500, ids, 40)).toEqual({ targetId: "c", position: "after" })
    expect(dropTargetAt(10, [], 40)).toBeNull()
  })
})
