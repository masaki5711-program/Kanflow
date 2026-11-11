import { describe, expect, it } from "vitest"
import { newBox } from "@/lib/board/ops"
import type { BoardElement } from "@/lib/board/model"
import { searchSheets, searchableText } from "./board-search"

const note = (id: string, text: string, extra: Record<string, unknown> = {}): BoardElement => ({ ...newBox("sticky", { x: 0, y: 0, w: 100, h: 100 }, id, 1), text, ...extra })

describe("board search (synthetic)", () => {
  const sheets = [
    { id: "s1", name: "全体図", elements: [note("e1", "金型温度（合成）"), note("e2", "段取り")] },
    { id: "s2", name: "詳細", elements: [{ ...newBox("frame", { x: 0, y: 0, w: 100, h: 100 }, "e3", 1), text: "要因", body: "ＣＴのばらつき" } as BoardElement] },
  ]

  it("finds every word in any text, folding case and full-width characters, across sheets", () => {
    expect(searchSheets("金型", sheets, () => "付箋").map((h) => h.elementId)).toEqual(["e1"])
    expect(searchSheets("ct ばらつき", sheets, () => "フレーム")).toEqual([{ sheetId: "s2", sheetName: "詳細", elementId: "e3", kind: "フレーム", excerpt: "要因 ＣＴのばらつき" }])
    expect(searchSheets("  ", sheets, () => "")).toEqual([])
    expect(searchSheets("無い言葉", sheets, () => "")).toEqual([])
  })

  it("reads table cells and a line's label", () => {
    const table = { ...newBox("table", { x: 0, y: 0, w: 100, h: 60 }, "t1", 1), cells: [["品目", "数量"]] } as BoardElement
    expect(searchableText(table)).toBe("品目 数量")
  })
})
