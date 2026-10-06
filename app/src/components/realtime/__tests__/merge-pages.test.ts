import { describe, expect, it } from "vitest"
import { mergeNewestFirst } from "../merge-pages"
import { changedByOthers } from "@/components/pbi-form/use-live-pbi"

const page = (ids: string[], nextCursor: string | null = null) => ({ items: ids.map((id) => ({ id })), nextCursor })

describe("mergeNewestFirst", () => {
  it("puts new entries on top and keeps the pages already loaded (and their cursor)", () => {
    const out = mergeNewestFirst(page(["c", "b", "a"], "cur-a"), page(["e", "d", "c"], "cur-c"))
    expect(out.items.map((i) => i.id)).toEqual(["e", "d", "c", "b", "a"])
    expect(out.nextCursor).toBe("cur-a")
  })

  it("replaces the list when the fresh page shares nothing with it (no silent gap)", () => {
    const fresh = page(["z", "y"], "cur-y")
    expect(mergeNewestFirst(page(["b", "a"]), fresh)).toBe(fresh)
  })

  it("uses the fresh page when nothing was shown yet", () => {
    const fresh = page(["a"])
    expect(mergeNewestFirst(undefined, fresh)).toBe(fresh)
    expect(mergeNewestFirst(page([]), fresh).items).toEqual([{ id: "a" }])
  })
})

describe("changedByOthers", () => {
  it("true only for a real event by someone else (a catch-up proves nothing)", () => {
    expect(changedByOthers([{ type: "activity", actorId: "u2", at: "t" }], "u1")).toBe(true)
    expect(changedByOthers([{ type: "activity", actorId: "u1", at: "t" }], "u1")).toBe(false)
    expect(changedByOthers([{ type: "resync" }], "u1")).toBe(false)
    expect(changedByOthers([{ type: "activity", at: "t" }], "u1")).toBe(true)
  })
})
