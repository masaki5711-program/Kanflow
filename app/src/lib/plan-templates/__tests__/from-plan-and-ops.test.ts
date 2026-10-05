import { describe, expect, it } from "vitest"
import { planToStages, type PlanSourceItem } from "../from-plan"
import { appendChild, indentNode, insertAfter, moveNode, nodeAt, outdentNode, removeNode, updateNode } from "../stage-ops"

const item = (id: string, over: Partial<PlanSourceItem> = {}): PlanSourceItem => ({
  id,
  parentId: null,
  name: id.toUpperCase(),
  description: null,
  notes: null,
  isMilestone: false,
  sortOrder: 1,
  plannedStart: null,
  plannedEnd: null,
  durationDays: null,
  ...over,
})

describe("planToStages (save the plan as a template)", () => {
  it("nests by parent, orders by sortOrder, durations from dates else durationDays, checklist from notes", () => {
    const res = planToStages([
      item("b", { sortOrder: 2, isMilestone: true, plannedStart: "2026-01-10", plannedEnd: "2026-01-10" }),
      item("a", { sortOrder: 1, plannedStart: "2026-01-01", plannedEnd: "2026-01-05", notes: "完了条件:\n- 承認" }),
      item("a2", { parentId: "a", sortOrder: 2, durationDays: 4 }),
      item("a1", { parentId: "a", sortOrder: 1 }),
      item("orphan", { parentId: "gone", sortOrder: 3 }),
    ])
    expect(res).toEqual({
      ok: true,
      stages: [
        { name: "A", durationDays: 5, checklist: ["承認"], children: [{ name: "A1" }, { name: "A2", durationDays: 4 }] },
        { name: "B", isMilestone: true },
        { name: "ORPHAN" },
      ],
    })
  })

  it("fails on an empty plan and on a plan deeper than three levels", () => {
    expect(planToStages([])).toEqual({ ok: false, reason: "empty" })
    const deep = [item("a"), item("b", { parentId: "a" }), item("c", { parentId: "b" }), item("d", { parentId: "c" })]
    expect(planToStages(deep)).toEqual({ ok: false, reason: "too_large" })
  })
})

type N = { name: string; children?: N[] }
const tree = (): N[] => [{ name: "a", children: [{ name: "a1" }, { name: "a2" }] }, { name: "b" }, { name: "c" }]

describe("stage-ops (editor)", () => {
  it("moves within siblings and refuses at the edges", () => {
    expect(moveNode(tree(), [1], -1)?.nodes.map((n) => n.name)).toEqual(["b", "a", "c"])
    expect(moveNode(tree(), [0], -1)).toBeNull()
    expect(moveNode(tree(), [0, 1], 1)).toBeNull()
  })

  it("indent makes the node the last child of the previous sibling; outdent puts it after the parent", () => {
    const ind = indentNode(tree(), [1])
    expect(ind?.focus).toEqual([0, 2])
    expect(nodeAt(ind?.nodes ?? [], [0, 2])?.name).toBe("b")
    expect(indentNode(tree(), [0])).toBeNull()
    const out = outdentNode(tree(), [0, 0])
    expect(out?.nodes.map((n) => n.name)).toEqual(["a", "a1", "b", "c"])
    expect(out?.focus).toEqual([1])
    expect(outdentNode(tree(), [1])).toBeNull()
  })

  it("respects the three-level limit on indent and add child", () => {
    const deep: N[] = [{ name: "x", children: [{ name: "y", children: [{ name: "z" }] }] }, { name: "w", children: [{ name: "v" }] }]
    expect(appendChild(deep, [0, 0, 0], { name: "too deep" })).toBeNull()
    expect(appendChild(deep, [0, 0], { name: "ok" })?.focus).toEqual([0, 0, 1])
    // w (2 levels) fits under x; w2 (3 levels) would reach a 4th level.
    expect(indentNode(deep, [1])?.focus).toEqual([0, 1])
    const deeper: N[] = [{ name: "x" }, { name: "w2", children: [{ name: "v", children: [{ name: "u" }] }] }]
    expect(indentNode(deeper, [1])).toBeNull()
  })

  it("insert / remove / update are immutable and return a focus path", () => {
    const original = tree()
    const ins = insertAfter(original, [0, 0], { name: "new" })
    expect(nodeAt(ins.nodes, [0, 1])?.name).toBe("new")
    expect(insertAfter(original, null, { name: "end" }).focus).toEqual([3])
    const rem = removeNode(original, [2])
    expect(rem.nodes.map((n) => n.name)).toEqual(["a", "b"])
    expect(rem.focus).toEqual([1])
    expect(removeNode<N>([{ name: "p", children: [{ name: "only" }] }], [0, 0]).focus).toEqual([0])
    expect(updateNode(original, [0, 1], (n) => ({ ...n, name: "renamed" }))[0].children?.[1].name).toBe("renamed")
    expect(original[0].children?.[1].name).toBe("a2")
  })
})
