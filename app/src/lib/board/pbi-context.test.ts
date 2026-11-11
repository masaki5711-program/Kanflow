import { describe, expect, it } from "vitest"
import type { ElementMap } from "./geometry"
import type { BoxElement, KnownElement } from "./model"
import { newBox, newLine } from "./ops"
import { shapeContext, shapeContextLines } from "./pbi-context"

const map = (...els: KnownElement[]): ElementMap => Object.fromEntries(els.map((el) => [el.id, el]))
const note = (id: string, x: number, y: number, text: string, extra: Partial<BoxElement> = {}): BoxElement => ({ ...newBox("sticky", { x, y, w: 100, h: 80 }, id, 1), text, ...extra })

describe("a shape's surroundings for PBI drafts (synthetic)", () => {
  const frame: BoxElement = { ...newBox("frame", { x: 0, y: 0, w: 600, h: 400 }, "frm-0001", 0), text: "③ 新たなやり方", body: "②の弱点を克服する" }
  const els = map(
    frame,
    note("stk-0001", 20, 40, "金型を予熱する（合成）"),
    note("stk-0002", 200, 40, "温度を GPC バンドで監視（合成）"),
    note("stk-0003", 20, 200, "標準書を改訂（合成）", { groupId: "grp-0001" }),
    note("stk-0004", 700, 40, "ソリ不良 3.2%（合成）"),
    { ...note("stk-0001b", 20, 300, "同じグループ（合成）"), groupId: "grp-0001" },
    { ...newLine("arrow", { point: { x: 700, y: 80 }, attach: "stk-0004" }, { point: { x: 120, y: 80 }, attach: "stk-0001" }, "lin-0001", 2), label: "原因" },
    newLine("arrow", { point: { x: 120, y: 80 }, attach: "stk-0001" }, { point: { x: 250, y: 80 }, attach: "stk-0002" }, "lin-0002", 2),
  )

  it("reads the frame, the shapes arrows come from and go to (with labels), the same frame, and open comments", () => {
    const ctx = shapeContext(els, "stk-0001", [
      { elementId: "stk-0001", body: "@[合成花子] 予熱時間は？", resolved: false },
      { elementId: "stk-0001", body: "解決済み", resolved: true },
      { elementId: "stk-0002", body: "別の図形", resolved: false },
    ])
    expect(ctx).toEqual({
      text: "金型を予熱する（合成）",
      frame: { title: "③ 新たなやり方", body: "②の弱点を克服する" },
      connected: [
        { direction: "from", text: "ソリ不良 3.2%（合成）", label: "原因" },
        { direction: "to", text: "温度を GPC バンドで監視（合成）", label: "" },
      ],
      group: [],
      siblings: ["温度を GPC バンドで監視（合成）", "標準書を改訂（合成）", "同じグループ（合成）"],
      comments: ["@合成花子 予熱時間は？"],
    })
  })

  it("a grouped shape lists its group apart from the rest of the frame", () => {
    const ctx = shapeContext(els, "stk-0003", [])
    expect(ctx?.group).toEqual(["同じグループ（合成）"])
    expect(ctx?.siblings).not.toContain("同じグループ（合成）")
  })

  it("writes the prompt's source section; a shape that is not there has none", () => {
    const lines = shapeContextLines(shapeContext(els, "stk-0001", []) as NonNullable<ReturnType<typeof shapeContext>>, "構成図", "全体図").join("\n")
    expect(lines).toContain("## 図形の文字\n金型を予熱する（合成）")
    expect(lines).toContain("見出し: ③ 新たなやり方")
    expect(lines).toContain("- ソリ不良 3.2%（合成）（矢印の文字: 原因）")
    expect(lines).toContain("この図形から矢印が向かう図形")
    expect(shapeContext(els, "missing-0001", [])).toBeNull()
  })
})
