import { describe, expect, it } from "vitest"
import { localizeLabel } from "@/lib/translation/localize-label"

const I18N = {
  name: { ja: "ISとの調整\n詳細", id: "Koordinasi dengan IS\nDetail", source: "id" as const, status: "done" as const },
}

describe("localizeLabel", () => {
  it("shows the viewer-language first line when the label is the source's first line", () => {
    expect(localizeLabel("Koordinasi dengan IS", I18N, ["name"], "ja")).toBe("ISとの調整")
    expect(localizeLabel("Koordinasi dengan IS", I18N, ["name"], "id")).toBe("Koordinasi dengan IS")
  })

  it("matches labels cut with an ellipsis and keeps a #N prefix", () => {
    expect(localizeLabel("#12 Koordinasi den…", I18N, ["name"], "ja")).toBe("#12 ISとの調整")
  })

  it("keeps renamed / untranslated labels and English viewers unchanged", () => {
    expect(localizeLabel("Old name", I18N, ["name"], "ja")).toBe("Old name")
    expect(localizeLabel("Koordinasi dengan IS", I18N, ["name"], "en")).toBe("Koordinasi dengan IS")
    expect(localizeLabel("Koordinasi dengan IS", undefined, ["name"], "ja")).toBe("Koordinasi dengan IS")
    const pending = { name: { ja: null, id: "Koordinasi dengan IS", source: "id" as const, status: "pending" as const } }
    expect(localizeLabel("Koordinasi dengan IS", pending, ["name"], "ja")).toBe("Koordinasi dengan IS")
  })
})
