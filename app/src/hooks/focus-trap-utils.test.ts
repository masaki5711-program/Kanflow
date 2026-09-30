import { describe, expect, it } from "vitest"
import { createLayerStack, isTabbable, nextTrappedFocus, type TabbableCandidate } from "./focus-trap-utils"

function candidate(overrides: Partial<TabbableCandidate> & { attrs?: Record<string, string> } = {}): TabbableCandidate {
  const { attrs = {}, ...rest } = overrides
  return { tabIndex: 0, disabled: false, hidden: false, getAttribute: (n) => attrs[n] ?? null, ...rest }
}

describe("isTabbable", () => {
  it("accepts a visible, enabled element", () => {
    expect(isTabbable(candidate(), true)).toBe(true)
  })

  it.each([
    ["invisible", candidate(), false],
    ["disabled", candidate({ disabled: true }), true],
    ["hidden", candidate({ hidden: true }), true],
    ["tabindex -1", candidate({ tabIndex: -1 }), true],
    ["aria-hidden", candidate({ attrs: { "aria-hidden": "true" } }), true],
    ["inert", candidate({ attrs: { inert: "" } }), true],
  ])("rejects %s elements", (_name, el, visible) => {
    expect(isTabbable(el, visible)).toBe(false)
  })
})

describe("nextTrappedFocus", () => {
  const items = ["a", "b", "c"]

  it("wraps forward from the last element to the first", () => {
    expect(nextTrappedFocus(items, "c", false)).toBe("a")
  })

  it("wraps backward from the first element to the last", () => {
    expect(nextTrappedFocus(items, "a", true)).toBe("c")
  })

  it("lets the browser move focus between middle elements", () => {
    expect(nextTrappedFocus(items, "a", false)).toBeNull()
    expect(nextTrappedFocus(items, "b", true)).toBeNull()
  })

  it("pulls focus back in when it is outside the trap", () => {
    expect(nextTrappedFocus(items, "outside", false)).toBe("a")
    expect(nextTrappedFocus(items, null, true)).toBe("c")
  })

  it("returns null when there is nothing to focus", () => {
    expect(nextTrappedFocus([], "a", false)).toBeNull()
  })

  it("keeps focus on a single element", () => {
    expect(nextTrappedFocus(["only"], "only", false)).toBe("only")
    expect(nextTrappedFocus(["only"], "only", true)).toBe("only")
  })
})

describe("createLayerStack", () => {
  it("tracks the top-most layer", () => {
    const stack = createLayerStack()
    stack.push("modal")
    stack.push("confirm")
    expect(stack.isTop("confirm")).toBe(true)
    expect(stack.isTop("modal")).toBe(false)
    stack.remove("confirm")
    expect(stack.isTop("modal")).toBe(true)
    stack.remove("modal")
    expect(stack.size()).toBe(0)
    expect(stack.isTop("modal")).toBe(false)
  })

  it("moves a re-pushed layer to the top without duplicating it", () => {
    const stack = createLayerStack()
    stack.push("a")
    stack.push("b")
    stack.push("a")
    expect(stack.size()).toBe(2)
    expect(stack.isTop("a")).toBe(true)
  })
})
