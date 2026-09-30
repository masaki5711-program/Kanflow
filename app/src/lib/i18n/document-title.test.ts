import { describe, expect, it } from "vitest"
import { APP_TITLE, formatDocumentTitle } from "./document-title"

describe("formatDocumentTitle", () => {
  it("joins page, project and app name with a middle dot", () => {
    expect(formatDocumentTitle(["Backlog", "Alpha"])).toBe("Backlog · Alpha · Kanflow")
  })

  it("skips empty, whitespace-only and missing parts", () => {
    expect(formatDocumentTitle(["Plan", "", "  ", null, undefined])).toBe("Plan · Kanflow")
  })

  it("returns only the app name when nothing is given", () => {
    expect(formatDocumentTitle([])).toBe(APP_TITLE)
  })

  it("trims parts and does not duplicate the app name", () => {
    expect(formatDocumentTitle(["  Guide ", "Kanflow"])).toBe("Guide · Kanflow")
  })
})
