import { describe, expect, it } from "vitest"
import type { PlanTemplateContent } from "@/lib/plan-templates/schema"
import { planTemplateKeyBackfill, positionalKey, type BackfillRow } from "../template-key-backfill"

const CONTENT: PlanTemplateContent = {
  stages: [
    { key: "spec", name: "仕様", children: [{ name: "要求" }, { key: "rfq", name: "見積" }] },
    { name: "購入", children: [{ name: "発注" }, { name: "発注" }] }, // duplicate sibling names
    { name: "検収", isMilestone: true },
  ],
}

const row = (id: string, name: string, parentId: string | null = null, templateKey: string | null = null): BackfillRow => ({ id, parentId, name, templateKey })

const ROWS: BackfillRow[] = [
  row("r1", "仕様"),
  row("r2", "要求", "r1"),
  row("r3", " 見積 ", "r1"), // whitespace differences still match
  row("r4", "購入"),
  row("r5", "発注", "r4"),
  row("r6", "発注", "r4"),
  row("r7", "検収"),
]

const keyOf = (updates: { id: string; templateKey: string }[], id: string) => updates.find((u) => u.id === id)?.templateKey ?? null

describe("planTemplateKeyBackfill (plan 12 E0)", () => {
  it("matches rows by tree position + name: the stage's key, or its positional key when the stage has none", () => {
    const r = planTemplateKeyBackfill(CONTENT, ROWS)
    expect(keyOf(r.updates, "r1")).toBe("spec")
    expect(keyOf(r.updates, "r2")).toBe(positionalKey("0.0"))
    expect(keyOf(r.updates, "r3")).toBe("rfq")
    expect(keyOf(r.updates, "r4")).toBe(positionalKey("1"))
    expect(keyOf(r.updates, "r7")).toBe(positionalKey("2"))
    expect(positionalKey("0.2.1")).toBe("_pos-0-2-1")
  })

  it("backfill_leaves_ambiguous_rows_null: duplicate sibling names, renamed rows and rows under an unmatched parent stay null", () => {
    const renamed = ROWS.map((r) => (r.id === "r1" ? { ...r, name: "仕様（改）" } : r))
    const r = planTemplateKeyBackfill(CONTENT, renamed)
    for (const id of ["r1", "r2", "r3", "r5", "r6"]) expect(keyOf(r.updates, id)).toBeNull()
    expect(r.counts).toMatchObject({ matched: 2, ambiguous: 2, unmatched: 3, alreadySet: 0 })
  })

  it("a duplicate name among the template's siblings is ambiguous even when only one row carries it", () => {
    const r = planTemplateKeyBackfill(CONTENT, [row("r4", "購入"), row("r5", "発注", "r4")])
    expect(keyOf(r.updates, "r5")).toBeNull()
    expect(r.counts.ambiguous).toBe(1)
  })

  it("a positional key that collides with an explicit key of the template is left null", () => {
    const content: PlanTemplateContent = { stages: [{ name: "A" }, { key: "_pos-0", name: "B" }] }
    const r = planTemplateKeyBackfill(content, [row("a", "A"), row("b", "B")])
    expect(keyOf(r.updates, "a")).toBeNull()
    expect(keyOf(r.updates, "b")).toBe("_pos-0")
  })

  it("backfill_is_idempotent: applying the updates and running again changes nothing", () => {
    const first = planTemplateKeyBackfill(CONTENT, ROWS)
    expect(first.updates.length).toBeGreaterThan(0)
    const applied = ROWS.map((r) => ({ ...r, templateKey: keyOf(first.updates, r.id) ?? r.templateKey }))
    const second = planTemplateKeyBackfill(CONTENT, applied)
    expect(second.updates).toEqual([])
    expect(second.counts.alreadySet).toBe(first.updates.length)
  })

  it("never overwrites a key already set (even a different one), but still walks into its children", () => {
    const r = planTemplateKeyBackfill(CONTENT, ROWS.map((x) => (x.id === "r1" ? { ...x, templateKey: "hand-set" } : x)))
    expect(keyOf(r.updates, "r1")).toBeNull()
    expect(keyOf(r.updates, "r3")).toBe("rfq")
  })
})
