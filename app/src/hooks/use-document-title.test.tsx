import { afterEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { useDocumentTitle } from "./use-document-title"
import * as barrel from "./index"

describe("useDocumentTitle", () => {
  afterEach(() => {
    document.title = ""
  })

  it("sets the formatted title and returns it", () => {
    const { result } = renderHook(() => useDocumentTitle(["Backlog", "Alpha"]))
    expect(result.current).toBe("Backlog · Alpha · Kanflow")
    expect(document.title).toBe("Backlog · Alpha · Kanflow")
  })

  it("updates when the parts change (e.g. language switch)", () => {
    const { rerender } = renderHook(({ parts }) => useDocumentTitle(parts), {
      initialProps: { parts: ["バックログ", "Alpha"] as (string | null)[] },
    })
    expect(document.title).toBe("バックログ · Alpha · Kanflow")
    rerender({ parts: ["Backlog", null] })
    expect(document.title).toBe("Backlog · Kanflow")
  })

  it("restores the previous title on unmount", () => {
    document.title = "Before"
    const { unmount } = renderHook(() => useDocumentTitle(["Plan"]))
    expect(document.title).toBe("Plan · Kanflow")
    unmount()
    expect(document.title).toBe("Before")
  })

  it("is exported from the hooks barrel", () => {
    expect(barrel.useDocumentTitle).toBe(useDocumentTitle)
  })
})
