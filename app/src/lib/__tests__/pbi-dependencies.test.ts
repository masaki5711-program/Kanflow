import { describe, expect, it } from "vitest"
import {
  dependencyOrder,
  edgesOf,
  isRefDone,
  moveBelow,
  openBlocking,
  orderConflict,
  pickBlocks,
  reachable,
  refLabel,
  waitingOn,
} from "@/lib/pbi-dependencies"
import type { PbiDependencyRefDto } from "@/types/api"

const ref = (id: string, status: string, over: Partial<PbiDependencyRefDto> = {}): PbiDependencyRefDto => ({
  dependencyId: `dep-${id}`,
  id,
  displayId: Number(id.replace(/\D/g, "")) || 1,
  initiative: `Initiative ${id}`,
  userStory: null,
  status,
  i18n: {},
  ...over,
})

describe("isRefDone", () => {
  it("true only for completed", () => {
    expect(isRefDone(ref("a", "completed"))).toBe(true)
    expect(isRefDone(ref("a", "ready"))).toBe(false)
    expect(isRefDone(ref("a", "not_ready"))).toBe(false)
  })
})

describe("waitingOn / openBlocking", () => {
  it("keeps only the not-yet-completed refs; defaults to empty without the field", () => {
    const item = { id: "x", blockedBy: [ref("a", "completed"), ref("b", "ready")], blocking: [ref("c", "not_ready")] }
    expect(waitingOn(item).map((r) => r.id)).toEqual(["b"])
    expect(openBlocking(item).map((r) => r.id)).toEqual(["c"])
    expect(waitingOn({ id: "y" })).toEqual([])
    expect(openBlocking({ id: "y" })).toEqual([])
  })

  it("a fully completed blockedBy list means nothing is waiting", () => {
    const item = { id: "x", blockedBy: [ref("a", "completed"), ref("b", "completed")] }
    expect(waitingOn(item)).toEqual([])
  })
})

describe("orderConflict", () => {
  it("returns the lowest-ranked (furthest down) open predecessor below the item", () => {
    const item = { id: "x", blockedBy: [ref("a", "ready"), ref("b", "ready")] }
    // order: x, a, b -- both predecessors below x; b is lower than a
    expect(orderConflict(item, ["x", "a", "b"])?.id).toBe("b")
    // order: x, b, a -- a is lower than b now
    expect(orderConflict(item, ["x", "b", "a"])?.id).toBe("a")
  })

  it("null when every open predecessor is already above the item", () => {
    const item = { id: "x", blockedBy: [ref("a", "ready")] }
    expect(orderConflict(item, ["a", "x"])).toBeNull()
  })

  it("null when the only predecessor is completed", () => {
    const item = { id: "x", blockedBy: [ref("a", "completed")] }
    expect(orderConflict(item, ["x", "a"])).toBeNull()
  })

  it("null when the item itself is not in the ordered list", () => {
    const item = { id: "zzz", blockedBy: [ref("a", "ready")] }
    expect(orderConflict(item, ["x", "a"])).toBeNull()
  })
})

describe("moveBelow", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }]

  it("places the item right after the anchor, returning a new array (and leaves the input alone)", () => {
    const out = moveBelow(list, "a", "c")
    expect(out).toEqual([{ id: "b" }, { id: "c" }, { id: "a" }])
    expect(out).not.toBe(list)
    expect(list).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }])
  })

  it("returns an unchanged copy when the item id is missing", () => {
    const out = moveBelow(list, "zzz", "b")
    expect(out).toEqual(list)
    expect(out).not.toBe(list)
  })

  it("returns an unchanged copy when the anchor id is missing", () => {
    expect(moveBelow(list, "a", "zzz")).toEqual(list)
  })

  it("returns an unchanged copy when item and anchor are the same", () => {
    expect(moveBelow(list, "a", "a")).toEqual(list)
  })
})

describe("edgesOf", () => {
  it("dedupes a link appearing on both ends (same dependencyId) into one edge", () => {
    const items = [
      { id: "a", blocking: [ref("b", "ready", { dependencyId: "d1" })] },
      { id: "b", blockedBy: [ref("a", "ready", { dependencyId: "d1" })] },
    ]
    expect(edgesOf(items)).toEqual([{ predecessorId: "a", successorId: "b" }])
  })

  it("collects every edge visible across the list", () => {
    const items = [
      { id: "a", blocking: [ref("b", "ready", { dependencyId: "d1" })] },
      { id: "b", blockedBy: [ref("a", "ready", { dependencyId: "d1" })], blocking: [ref("c", "ready", { dependencyId: "d2" })] },
      { id: "c", blockedBy: [ref("b", "ready", { dependencyId: "d2" })] },
    ]
    expect(edgesOf(items)).toEqual([
      { predecessorId: "a", successorId: "b" },
      { predecessorId: "b", successorId: "c" },
    ])
  })

  it("empty without any dependencies", () => {
    expect(edgesOf([{ id: "a" }])).toEqual([])
  })
})

describe("reachable", () => {
  const edges = [
    { predecessorId: "a", successorId: "b" },
    { predecessorId: "b", successorId: "c" },
  ]

  it("down follows predecessor -> successor; up follows the reverse", () => {
    expect([...reachable(edges, "a", "down")].sort()).toEqual(["b", "c"])
    expect([...reachable(edges, "c", "up")].sort()).toEqual(["a", "b"])
    expect([...reachable(edges, "c", "down")]).toEqual([])
  })

  it("survives a cycle", () => {
    const cyc = [...edges, { predecessorId: "c", successorId: "a" }]
    expect([...reachable(cyc, "a", "down")].sort()).toEqual(["a", "b", "c"])
  })
})

describe("pickBlocks", () => {
  const edges = [
    { predecessorId: "a", successorId: "b" },
    { predecessorId: "b", successorId: "c" },
  ]

  it("blockedBy mode: blocks downstream ids (cycle), the existing predecessor, and itself", () => {
    const blocks = pickBlocks(edges, "a", "blockedBy")
    expect(blocks.get("b")).toBe("cycle")
    expect(blocks.get("c")).toBe("cycle")
    expect(blocks.get("a")).toBe("self")
    expect(blocks.has("zzz")).toBe(false)

    const blocksC = pickBlocks(edges, "c", "blockedBy")
    expect(blocksC.get("b")).toBe("existing")
    expect(blocksC.get("c")).toBe("self")
    expect(blocksC.has("a")).toBe(false)
  })

  it("blocking mode: blocks upstream ids (cycle), the existing successor, and itself", () => {
    const blocks = pickBlocks(edges, "c", "blocking")
    expect(blocks.get("a")).toBe("cycle")
    expect(blocks.get("b")).toBe("cycle")
    expect(blocks.get("c")).toBe("self")

    const blocksA = pickBlocks(edges, "a", "blocking")
    expect(blocksA.get("b")).toBe("existing")
    expect(blocksA.get("a")).toBe("self")
    expect(blocksA.has("c")).toBe(false)
  })
})

describe("refLabel", () => {
  it("prefers the initiative's first line, falls back to the user story, else just the id", () => {
    expect(refLabel({ displayId: 7, initiative: "Login\nmore details", userStory: null, i18n: {} }, "ja")).toBe("#7 Login")
    expect(refLabel({ displayId: 7, initiative: null, userStory: "Story text", i18n: {} }, "ja")).toBe("#7 Story text")
    expect(refLabel({ displayId: 7, initiative: null, userStory: null, i18n: {} }, "ja")).toBe("#7")
    expect(refLabel({ displayId: 7, initiative: "  ", userStory: "  ", i18n: {} }, "ja")).toBe("#7")
  })

  it("uses the translated text in the viewer's language when present", () => {
    const out = refLabel({ displayId: 3, initiative: "Original", userStory: null, i18n: { initiative: { ja: "日本語", id: "Original", source: "id", status: "done" } } }, "ja")
    expect(out).toBe("#3 日本語")
  })
})

describe("dependencyOrder", () => {
  const ids = (list: { id: string }[]) => list.map((i) => i.id)
  const items = (...names: string[]) => names.map((id) => ({ id }))
  const edge = (predecessorId: string, successorId: string) => ({ predecessorId, successorId })

  it("keeps the given order when nothing depends on anything", () => {
    expect(ids(dependencyOrder(items("c", "a", "b"), []))).toEqual(["c", "a", "b"])
  })

  it("puts a prerequisite before the PBI that waits for it, moving as little as possible", () => {
    // a waits for c: c jumps ahead of a, b keeps its place after them.
    expect(ids(dependencyOrder(items("a", "b", "c"), [edge("c", "a")]))).toEqual(["c", "a", "b"])
  })

  it("orders a chain end to end", () => {
    expect(ids(dependencyOrder(items("c", "b", "a"), [edge("a", "b"), edge("b", "c")]))).toEqual(["a", "b", "c"])
  })

  it("ignores links to PBIs outside the list", () => {
    expect(ids(dependencyOrder(items("a", "b"), [edge("zzz", "a"), edge("b", "yyy")]))).toEqual(["a", "b"])
  })

  it("does not lose or duplicate items on a cycle", () => {
    expect(ids(dependencyOrder(items("a", "b", "c"), [edge("a", "b"), edge("b", "a")])).sort()).toEqual(["a", "b", "c"])
  })

  it("does not change its input", () => {
    const input = items("a", "b")
    dependencyOrder(input, [edge("b", "a")])
    expect(ids(input)).toEqual(["a", "b"])
  })
})
