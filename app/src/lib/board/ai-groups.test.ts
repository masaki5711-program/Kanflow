import { describe, expect, it } from "vitest"
import { parseGroups } from "./ai-groups"

describe("reading the local LLM's grouping (synthetic)", () => {
  it("takes the JSON out of the answer, every note in one group, the left-out ones in a last group", () => {
    const raw = 'Here you go:\n[{"title": "設備", "items": [1, 3]}, {"title": "人", "items": [2, 3, 9]}]\nDone.'
    expect(parseGroups(raw, 4, "その他")).toEqual([
      { title: "設備", items: [0, 2] },
      { title: "人", items: [1] },
      { title: "その他", items: [3] },
    ])
  })

  it("answers null for an answer that is not usable", () => {
    expect(parseGroups("no json", 3, "x")).toBeNull()
    expect(parseGroups("[{]", 3, "x")).toBeNull()
    expect(parseGroups('[{"title": "", "items": [1]}]', 3, "x")).toBeNull()
  })
})
