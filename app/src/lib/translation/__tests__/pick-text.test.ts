import { describe, expect, test } from "vitest"
import { pickText } from "../pick-text"
import type { EntityI18n } from "../types"

const done: EntityI18n = {
  title: { ja: "改善提案", id: "Usulan kaizen", source: "ja", status: "done" },
}
const pending: EntityI18n = {
  title: { ja: "改善提案", id: null, source: "ja", status: "pending" },
}
const failed: EntityI18n = {
  title: { ja: "改善提案", id: null, source: "ja", status: "failed" },
}

describe("pickText", () => {
  test("no i18n → original, nothing pending", () => {
    expect(pickText(undefined, "title", "raw", "id")).toEqual({ text: "raw", translated: false, pending: false, failed: false, original: null })
    expect(pickText({}, "title", "raw", "id").text).toBe("raw")
  })

  test("viewer locale equals the source → original text", () => {
    const r = pickText(done, "title", "改善提案", "ja")
    expect(r).toMatchObject({ text: "改善提案", translated: false, pending: false })
  })

  test("viewer locale side exists → translated text with the original for hover", () => {
    const r = pickText(done, "title", "改善提案", "id")
    expect(r).toEqual({ text: "Usulan kaizen", translated: true, pending: false, failed: false, original: "改善提案" })
  })

  test("viewer locale side missing → original + pending", () => {
    const r = pickText(pending, "title", "改善提案", "id")
    expect(r).toMatchObject({ text: "改善提案", translated: false, pending: true, failed: false })
  })

  test("failed row → original + failed flag", () => {
    const r = pickText(failed, "title", "改善提案", "id")
    expect(r).toMatchObject({ text: "改善提案", pending: false, failed: true })
  })

  test("English UI → original, never pending", () => {
    expect(pickText(pending, "title", "改善提案", "en")).toMatchObject({ text: "改善提案", pending: false })
  })

  test("legacy pair rows show only the viewer's side even for the source locale", () => {
    const legacy: EntityI18n = { title: { ja: "治具交換", id: "Ganti jig", source: "ja", status: "done" } }
    expect(pickText(legacy, "title", "Ganti jig\n治具交換", "ja").text).toBe("治具交換")
    expect(pickText(legacy, "title", "Ganti jig\n治具交換", "id").text).toBe("Ganti jig")
  })

  test("null original is rendered as empty string", () => {
    expect(pickText(undefined, "title", null, "ja").text).toBe("")
  })
})
