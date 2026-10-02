import { describe, expect, test } from "vitest"
import { textOf } from "../types"

describe("textOf", () => {
  test("returns the ja side", () => {
    expect(textOf({ ja: "改善提案", id: "Usulan", en: "Proposal" }, "ja")).toBe("改善提案")
  })

  test("returns the id side", () => {
    expect(textOf({ ja: "改善提案", id: "Usulan", en: "Proposal" }, "id")).toBe("Usulan")
  })

  test("returns the en side", () => {
    expect(textOf({ ja: "改善提案", id: "Usulan", en: "Proposal" }, "en")).toBe("Proposal")
  })

  test("returns null when the en side is null", () => {
    expect(textOf({ ja: "改善提案", id: "Usulan", en: null }, "en")).toBeNull()
  })

  test("returns null (not undefined-as-is) for old rows with no en column at all", () => {
    expect(textOf({ ja: "改善提案", id: "Usulan" }, "en")).toBeNull()
  })
})
