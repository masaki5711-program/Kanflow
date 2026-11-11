import { describe, expect, it } from "vitest"
import type { ElementMap } from "./geometry"
import { elementDataProblem, elementFromData, type BoxElement, type KnownElement } from "./model"
import {
  bodyPatch,
  cellPatch,
  copyElements,
  deletePatch,
  expandGroups,
  formatDropped,
  groupPatch,
  newBox,
  newLine,
  pastePatch,
  slotContent,
  tableBorderAt,
  tablePatch,
  tableTrackPatch,
  textPatch,
  ungroupPatch,
} from "./ops"
import { templatePatch, type TemplateTexts } from "./templates"

const box = (id: string, x = 0, extra: Partial<BoxElement> = {}): BoxElement => ({ ...newBox("rect", { x, y: 0, w: 100, h: 60 }, id, 1), ...extra })
const map = (...els: KnownElement[]): ElementMap => Object.fromEntries(els.map((el) => [el.id, el]))
const table = (): BoxElement => ({
  ...newBox("table", { x: 0, y: 0, w: 200, h: 60 }, "tbl-0001", 1),
  cells: [
    ["a", "b"],
    ["c", "d"],
  ],
  colWidths: [100, 100],
  rowHeights: [30, 30],
  w: 200,
  h: 60,
})

describe("B6 ops: formatted text (synthetic)", () => {
  it("stores runs with the text, and drops them when they do not fit it", () => {
    const els = map(box("box-0001"))
    const withRuns = textPatch(els, "box-0001", "abcd", [{ text: "ab", bold: true }, { text: "cd" }])["box-0001"] as BoxElement
    expect(withRuns.runs).toEqual([{ text: "ab", bold: true }, { text: "cd" }])
    const plain = textPatch(map(withRuns), "box-0001", "abcde")["box-0001"] as BoxElement
    expect(plain.runs).toBeUndefined()
    // Runs that add up to another text are not stored.
    expect((textPatch(els, "box-0001", "xyz", [{ text: "ab", bold: true }])["box-0001"] as BoxElement).runs).toBeUndefined()
  })

  it("formatting too large to store is dropped (the text stays) and the editor can tell", () => {
    const text = "x".repeat(400)
    const runs = Array.from({ length: 400 }, (_, i) => ({ text: "x", fontSize: 10 + (i % 2), color: "red" as const, fontFamily: "serif" as const }))
    const frame = { ...newBox("frame", { x: 0, y: 0, w: 300, h: 200 }, "frm-0001", 1), body: "y", bodyRuns: [{ text: "y", bold: true }] }
    const stored = textPatch(map(frame), "frm-0001", text, runs)["frm-0001"] as BoxElement
    expect(stored.text).toBe(text)
    expect(stored.runs).toBeUndefined()
    expect(JSON.stringify(stored).length).toBeLessThanOrEqual(16 * 1024)
    expect(formatDropped(runs, stored, { kind: "text" })).toBe(true)
    expect(formatDropped([{ text: "ab", bold: true }], { ...box("box-0001"), text: "ab", runs: [{ text: "ab", bold: true }] }, { kind: "text" })).toBe(false)
  })

  it("a frame's body is written apart from its title", () => {
    const frame = newBox("frame", { x: 0, y: 0, w: 300, h: 200 }, "frm-0001", 1)
    const next = bodyPatch(map({ ...frame, text: "① 現状の値" }), "frm-0001", "合成", [{ text: "合成", color: "red" }])["frm-0001"] as BoxElement
    expect(next.text).toBe("① 現状の値")
    expect(next.body).toBe("合成")
    expect(slotContent(next, { kind: "body" })).toEqual({ text: "合成", runs: [{ text: "合成", color: "red" }] })
    const cleared = bodyPatch(map(next), "frm-0001", "")["frm-0001"] as BoxElement
    expect(cleared.body).toBeUndefined()
    expect(cleared.bodyRuns).toBeUndefined()
    // Not a frame: nothing.
    expect(bodyPatch(map(box("box-0001")), "box-0001", "x")).toEqual({})
  })

  it("cell runs follow the cells when rows and columns are added or removed", () => {
    const formatted = cellPatch(map(table()), "tbl-0001", 1, 1, "d", [{ text: "d", bold: true }])["tbl-0001"] as BoxElement
    expect(formatted.cellRuns).toEqual([
      [null, null],
      [null, [{ text: "d", bold: true }]],
    ])
    const moreRows = tablePatch(map(formatted), "tbl-0001", 0, 0, "row-above")["tbl-0001"] as BoxElement
    expect(moreRows.cellRuns?.[2]?.[1]).toEqual([{ text: "d", bold: true }])
    const lessCols = tablePatch(map(formatted), "tbl-0001", 0, 0, "col-delete")["tbl-0001"] as BoxElement
    expect(lessCols.cellRuns?.[1]?.[0]).toEqual([{ text: "d", bold: true }])
    // The formatted cell gone: no runs left.
    const gone = tablePatch(map(formatted), "tbl-0001", 1, 1, "row-delete")["tbl-0001"] as BoxElement
    expect(gone.cellRuns).toBeUndefined()
  })
})

describe("B6 ops: table columns and rows", () => {
  it("sets one column's width / one row's height and the table's size follows", () => {
    const wider = tableTrackPatch(map(table()), "tbl-0001", "col", 0, 160)["tbl-0001"] as BoxElement
    expect(wider.colWidths).toEqual([160, 100])
    expect(wider.w).toBe(260)
    const taller = tableTrackPatch(map(table()), "tbl-0001", "row", 1, 52.4)["tbl-0001"] as BoxElement
    expect(taller.rowHeights).toEqual([30, 52])
    expect(taller.h).toBe(82)
    // Never below the smallest cell; nothing for an unchanged size or an unknown index.
    expect((tableTrackPatch(map(table()), "tbl-0001", "col", 1, -50)["tbl-0001"] as BoxElement).colWidths).toEqual([100, 8])
    expect(tableTrackPatch(map(table()), "tbl-0001", "col", 0, 100)).toEqual({})
    expect(tableTrackPatch(map(table()), "tbl-0001", "col", 5, 100)).toEqual({})
    expect(tableTrackPatch(map({ ...table(), locked: true }), "tbl-0001", "col", 0, 120)).toEqual({})
  })

  it("finds the ruling under the pointer", () => {
    expect(tableBorderAt(table(), { x: 101, y: 10 }, 3)).toEqual({ axis: "col", index: 0, start: 100 })
    expect(tableBorderAt(table(), { x: 199, y: 10 }, 3)).toEqual({ axis: "col", index: 1, start: 100 })
    expect(tableBorderAt(table(), { x: 50, y: 31 }, 3)).toEqual({ axis: "row", index: 0, start: 30 })
    expect(tableBorderAt(table(), { x: 50, y: 15 }, 3)).toBeNull()
    expect(tableBorderAt(table(), { x: 400, y: 15 }, 3)).toBeNull()
  })
})

describe("B6 ops: groups", () => {
  it("groups, expands a member to its group, and ungroups", () => {
    const els = map(box("box-0001"), box("box-0002", 200), box("box-0003", 400))
    const grouped = groupPatch(els, ["box-0001", "box-0002"], "grp-0001")
    expect(Object.keys(grouped).sort()).toEqual(["box-0001", "box-0002"])
    const after = { ...els, ...grouped } as ElementMap
    expect(expandGroups(after, ["box-0001"]).sort()).toEqual(["box-0001", "box-0002"])
    expect(expandGroups(after, ["box-0003"])).toEqual(["box-0003"])
    const apart = ungroupPatch(after, ["box-0002"])
    expect(Object.values(apart).every((el) => el && !(el as BoxElement).groupId)).toBe(true)
    expect(groupPatch(els, ["box-0001"], "grp-0002")).toEqual({})
  })

  it("a group left with one member after regrouping is no group", () => {
    const els = map(box("box-0001", 0, { groupId: "grp-0001" }), box("box-0002", 200, { groupId: "grp-0001" }), box("box-0003", 400))
    const patch = groupPatch(els, ["box-0002", "box-0003"], "grp-0002")
    expect((patch["box-0001"] as BoxElement).groupId).toBeUndefined()
    expect((patch["box-0002"] as BoxElement).groupId).toBe("grp-0002")
  })

  it("deleting all but one member of a group leaves that one in no group", () => {
    const els = map(box("box-0001", 0, { groupId: "grp-0001" }), box("box-0002", 200, { groupId: "grp-0001" }))
    const patch = deletePatch(els, ["box-0001"])
    expect(patch["box-0001"]).toBeNull()
    expect((patch["box-0002"] as BoxElement).groupId).toBeUndefined()
    // The member left is a line attached to the deleted box: it is detached and leaves the group.
    const line = { ...newLine("line", { point: { x: 100, y: 30 }, attach: "box-0001", side: "e" }, { point: { x: 300, y: 30 }, attach: null }, "lin-0001", 2), groupId: "grp-0001" }
    const both = deletePatch(map(box("box-0001", 0, { groupId: "grp-0001" }), line), ["box-0001"])
    const kept = both["lin-0001"] as { groupId?: string; start: { attach?: string } }
    expect(kept.groupId).toBeUndefined()
    expect(kept.start.attach).toBeUndefined()
  })

  it("a pasted group is a new group; a lone member pasted is in none", () => {
    const els = map(box("box-0001", 0, { groupId: "grp-0001" }), box("box-0002", 200, { groupId: "grp-0001" }))
    let n = 0
    const both = pastePatch(els, copyElements(els, ["box-0001", "box-0002"]), () => `new-${String(++n).padStart(4, "0")}`, { x: 10, y: 10 })
    const groups = Object.values(both.patch).map((el) => (el as BoxElement).groupId)
    expect(groups[0]).toBeDefined()
    expect(groups[0]).not.toBe("grp-0001")
    expect(groups[0]).toBe(groups[1])
    const one = pastePatch(els, copyElements(els, ["box-0001"]), () => `one-${String(++n).padStart(4, "0")}`, { x: 10, y: 10 })
    expect((Object.values(one.patch)[0] as BoxElement).groupId).toBeUndefined()
  })
})

describe("B6 model: what the server accepts", () => {
  const base = { type: "rect", x: 0, y: 0, w: 10, h: 10, z: 1, text: "ab", fill: "white", stroke: "ink" }
  it("accepts runs, a frame's body and hint, and a group id", () => {
    expect(elementDataProblem({ ...base, runs: [{ text: "a", bold: true, fontSize: 20, color: "red", underline: true }, { text: "b" }], groupId: "grp-0001" })).toBeNull()
    expect(elementDataProblem({ ...base, type: "frame", body: "合成", bodyRuns: [{ text: "合成", italic: true }], hint: "ヒント" })).toBeNull()
  })

  it("refuses runs with an unknown colour or size out of range, and a malformed group id", () => {
    expect(elementDataProblem({ ...base, runs: [{ text: "a", color: "#ff0000" }] })).not.toBeNull()
    expect(elementDataProblem({ ...base, runs: [{ text: "a", fontSize: 500 }] })).not.toBeNull()
    expect(elementDataProblem({ ...base, groupId: "../x" })).not.toBeNull()
    expect(elementDataProblem({ ...base, type: "frame", hint: "x".repeat(501) })).not.toBeNull()
  })

  it("reads back what it stores", () => {
    const el = elementFromData("box-0001", { ...base, runs: [{ text: "ab", bold: true }] })
    expect((el as BoxElement).runs).toEqual([{ text: "ab", bold: true }])
  })
})

describe("B6 templates", () => {
  const texts: TemplateTexts = {
    keep: "K",
    problem: "P",
    tryNext: "T",
    zevaCurrent: "現状",
    zevaFuture: "ありたい姿",
    zevaResult: "結果系",
    zevaCause: "要因系",
    zeva1: "① 現状の値",
    zeva1Hint: "h1",
    zeva2: "② 現状のやり方",
    zeva2Hint: "h2",
    zeva3: "③ 新たなやり方",
    zeva3Hint: "h3",
    zeva4: "④ 目標の値",
    zeva4Hint: "h4",
    zevaLoop: "loop",
    minutesTitle: "M",
    minutesMeta: "m",
    agenda: "a",
    decisions: "d",
    actions: "ac",
    reportTitle: "報告",
    summary: "背景／目的",
    progress: "報告課題",
    issues: "結論",
    next: "次の予定",
  }

  it("ZEVA: ① top left, ④ top right, ② bottom left, ③ bottom right; arrows ①→②→③→④ and ①→④ between side middles", () => {
    let n = 0
    const { patch } = templatePatch("zeva", texts, { x: 0, y: 0 }, () => `tpl-${String(++n).padStart(4, "0")}`, 0)
    const els = Object.values(patch) as KnownElement[]
    const frame = (title: string) => els.find((el) => el.type === "frame" && (el as BoxElement).text === title) as BoxElement
    const [b1, b2, b3, b4] = [frame("① 現状の値"), frame("② 現状のやり方"), frame("③ 新たなやり方"), frame("④ 目標の値")]
    expect(b1.x).toBeLessThan(b4.x)
    expect(b1.y).toBe(b4.y)
    expect(b2.x).toBe(b1.x)
    expect(b2.y).toBeGreaterThan(b1.y)
    expect(b3.x).toBe(b4.x)
    expect([b1.fill, b2.fill, b3.fill, b4.fill]).toEqual(["blue", "red", "amber", "green"])
    expect([b1.hint, b2.hint, b3.hint, b4.hint]).toEqual(["h1", "h2", "h3", "h4"])
    const arrows = els.filter((el) => el.type === "arrow") as { start: { attach: string; side: string }; end: { attach: string; side: string }; dash?: string }[]
    const route = arrows.map((a) => `${a.start.attach}:${a.start.side}>${a.end.attach}:${a.end.side}${a.dash ? "~" : ""}`)
    expect(route).toEqual([`${b1.id}:s>${b2.id}:n`, `${b2.id}:e>${b3.id}:w`, `${b3.id}:n>${b4.id}:s`, `${b1.id}:e>${b4.id}:w~`])
    for (const el of els) expect(elementDataProblem({ ...el, id: undefined })).toBeNull()
  })

  it("report: background / purpose, topics reported, conclusion, next steps", () => {
    let n = 0
    const { patch } = templatePatch("report", texts, { x: 0, y: 0 }, () => `rep-${String(++n).padStart(4, "0")}`, 0)
    const titles = Object.values(patch)
      .filter((el) => el && el.type === "frame")
      .map((el) => (el as BoxElement).text)
    expect(titles).toEqual(["背景／目的", "報告課題", "結論", "次の予定"])
  })
})
