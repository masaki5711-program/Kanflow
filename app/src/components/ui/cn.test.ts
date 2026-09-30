import { describe, expect, it } from "vitest"
import { cn } from "./cn"

describe("cn", () => {
  it("joins truthy class names and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b")
  })

  it("returns an empty string when nothing is truthy", () => {
    expect(cn(false, null, undefined)).toBe("")
  })

  it("lets the later conflicting Tailwind utility win", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4")
    expect(cn("bg-primary", "bg-danger")).toBe("bg-danger")
  })

  it("keeps a custom font-size token alongside a custom text color", () => {
    expect(cn("text-caption", "text-fg-muted")).toBe("text-caption text-fg-muted")
    expect(cn("text-fg-muted", "text-body-lg")).toBe("text-fg-muted text-body-lg")
  })

  it("merges conflicting custom font-size tokens", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption")
    expect(cn("text-sm", "text-title")).toBe("text-title")
  })

  it("merges conflicting custom text color tokens", () => {
    expect(cn("text-fg", "text-fg-subtle")).toBe("text-fg-subtle")
  })

  it("merges custom radius, shadow and ease tokens", () => {
    expect(cn("rounded-ui-sm", "rounded-ui-lg")).toBe("rounded-ui-lg")
    expect(cn("shadow-ui-sm", "shadow-ui-overlay")).toBe("shadow-ui-overlay")
    expect(cn("ease-ui", "ease-linear")).toBe("ease-linear")
  })

  it("does not merge a shadow size with a shadow color", () => {
    expect(cn("shadow-ui-md", "shadow-primary")).toBe("shadow-ui-md shadow-primary")
  })
})
