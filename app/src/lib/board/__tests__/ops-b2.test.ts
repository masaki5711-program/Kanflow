// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { boundCells, parseHtmlTable, parseTsv } from "../clipboard"
import { applyRemote, initialState } from "../doc"
import type { ElementMap } from "../geometry"
import { BOARD_LIMITS } from "../limits"
import { mindChildPatch, mindChildren, mindLayoutPatch, mindParent, mindSiblingPatch } from "../mindmap"
import { elementDataProblem, elementToData, isBox, isLine, type BoardElement, type BoxElement, type LineElement } from "../model"
import {
  alignPatch,
  cellAt,
  cellPatch,
  copyElements,
  deletePatch,
  distributePatch,
  formatPatch,
  labelPatch,
  lineEndPatch,
  linkPatch,
  lockPatch,
  movePatch,
  newBox,
  newImage,
  newLine,
  newTableFromCells,
  resizePatch,
  snapMove,
  tablePatch,
  votePatch,
  withFrameContents,
} from "../ops"
import { lineStyle, textStyle } from "../style"
import { templatePatch, type TemplateTexts } from "../templates"

// Synthetic elements only.
function box(id: string, x: number, y: number, w = 100, h = 50, extra: Partial<BoxElement> = {}): BoxElement {
  return { id, type: "rect", x, y, w, h, z: 1, text: "", fill: "white", stroke: "ink", ...extra }
}

function map(...els: BoardElement[]): ElementMap {
  return Object.fromEntries(els.map((el) => [el.id, el]))
}

function ids(prefix: string) {
  let n = 0
  return () => `${prefix}${String(++n).padStart(6, "0")}`
}

describe("format", () => {
  it("applies text settings to boxes and line settings to lines, clamped", () => {
    const b = box("b-000001", 0, 0)
    const l = newLine("arrow", { point: { x: 0, y: 0 }, attach: null }, { point: { x: 9, y: 9 }, attach: null }, "l-000001", 2)
    const els = map(b, l)
    const patch = formatPatch(els, ["b-000001", "l-000001"], { fontSize: 500, bold: true, strokeWidth: 0, route: "elbow", align: "right" })
    const nb = patch["b-000001"] as BoxElement
    const nl = patch["l-000001"] as LineElement
    expect(nb.fontSize).toBe(BOARD_LIMITS.fontSizeMax)
    expect(nb.bold).toBe(true)
    expect(nb.align).toBe("right")
    expect(nb.strokeWidth).toBe(0)
    expect(nb).not.toHaveProperty("route")
    expect(nl.route).toBe("elbow")
    // A line is never thinner than the minimum (0 = invisible).
    expect(nl.strokeWidth).toBe(BOARD_LIMITS.lineWidthMin)
    expect(nl).not.toHaveProperty("bold")
    // What was written passes the server's schema.
    expect(elementDataProblem(elementToData(nb))).toBeNull()
    expect(elementDataProblem(elementToData(nl))).toBeNull()
  })

  it("resolves defaults: shapes centre their text, text boxes start top left, arrows have an end head", () => {
    expect(textStyle(box("a", 0, 0)).align).toBe("center")
    expect(textStyle(box("a", 0, 0, 10, 10, { type: "text" })).valign).toBe("top")
    const arrow = newLine("arrow", { point: { x: 0, y: 0 }, attach: null }, { point: { x: 1, y: 1 }, attach: null }, "l", 1)
    expect(lineStyle(arrow)).toMatchObject({ arrowEnd: true, arrowStart: false, route: "straight" })
  })
})

describe("lock and link", () => {
  it("a locked element is not moved, resized, formatted or deleted; unlocking frees it", () => {
    const b = box("b-000001", 0, 0, 100, 50, { locked: true })
    const els = map(b)
    expect(movePatch(els, ["b-000001"], 10, 10)).toEqual({})
    expect(resizePatch(els, "b-000001", "se", 10, 10)).toEqual({})
    expect(formatPatch(els, ["b-000001"], { bold: true })).toEqual({})
    expect(deletePatch(els, ["b-000001"])).toEqual({})
    expect(lockPatch(els, ["b-000001"], false)["b-000001"]).not.toHaveProperty("locked")
    // A copy is never locked.
    expect(copyElements(els, ["b-000001"])[0]).not.toHaveProperty("locked")
  })

  it("only http(s) links are set; null removes", () => {
    const els = map(box("b-000001", 0, 0))
    expect(linkPatch(els, ["b-000001"], "javascript:alert(1)")).toEqual({})
    expect(linkPatch(els, ["b-000001"], "file:///c:/x")).toEqual({})
    const set = linkPatch(els, ["b-000001"], "https://example.test/a")
    expect((set["b-000001"] as BoxElement).link).toBe("https://example.test/a")
    expect(linkPatch(map(set["b-000001"] as BoxElement), ["b-000001"], null)["b-000001"]).not.toHaveProperty("link")
    expect(elementDataProblem({ ...elementToData(box("x", 0, 0)), link: "javascript:alert(1)" })).not.toBeNull()
  })
})

describe("line ends on side midpoints", () => {
  it("stores the side an end was dropped on", () => {
    const a = box("a-000001", 0, 0)
    const l = newLine("arrow", { point: { x: 100, y: 25 }, attach: "a-000001", side: "e" }, { point: { x: 300, y: 25 }, attach: null }, "l-000001", 2)
    expect(l.start).toEqual({ x: 100, y: 25, attach: "a-000001", side: "e" })
    const moved = lineEndPatch(map(a, l), "l-000001", "end", { x: 50, y: 50 }, "a-000001", "s")["l-000001"] as LineElement
    expect(moved.end).toEqual({ x: 50, y: 50, attach: "a-000001", side: "s" })
    // A free end keeps no side.
    expect((lineEndPatch(map(a, l), "l-000001", "end", { x: 9, y: 9 }, null, "s")["l-000001"] as LineElement).end).toEqual({ x: 9, y: 9 })
  })
})

describe("arrange and grid", () => {
  it("aligns and distributes boxes", () => {
    const els = map(box("a", 0, 0, 10, 10), box("b", 40, 30, 20, 10), box("c", 100, 5, 10, 10))
    const left = alignPatch(els, ["a", "b", "c"], "left")
    expect((left.b as BoxElement).x).toBe(0)
    const spread = distributePatch(els, ["a", "b", "c"], "horizontal")
    // Gaps: total 110 − widths 40 = 70 → 35 each; b starts at 10 + 35.
    expect((spread.b as BoxElement).x).toBe(45)
  })

  it("snaps a move so the top-left corner lands on the grid", () => {
    const els = map(box("a", 5, 7))
    expect(snapMove(els, ["a"], 30, 30, 24)).toEqual({ x: 19, y: 41 })
    expect(snapMove(els, ["a"], 30, 30, 0)).toEqual({ x: 30, y: 30 })
  })

  it("a frame carries the elements wholly inside it", () => {
    const frame = box("f", 0, 0, 300, 300, { type: "frame" })
    const inside = box("in", 10, 40, 50, 50)
    const across = box("across", 280, 10, 50, 50)
    expect(withFrameContents(map(frame, inside, across), ["f"]).sort()).toEqual(["f", "in"])
    // A locked frame stays, and so does what is in it.
    expect(withFrameContents(map({ ...frame, locked: true }, inside), ["f"])).toEqual(["f"])
  })

  it("an image keeps its proportions when resized with keepRatio", () => {
    const img = newImage("abcdef0123456789", { width: 400, height: 200 }, { x: 0, y: 0 }, "i-000001", 1)
    const r = resizePatch(map(img), "i-000001", "se", 100, 0, true)["i-000001"] as BoxElement
    expect(r.w / r.h).toBeCloseTo(2)
  })
})

describe("tables", () => {
  it("builds a table from pasted cells and edits cells, rows and columns", () => {
    const table = newTableFromCells([["名前", "数"], ["A", "1"]], { x: 0, y: 0 }, "t-000001", 1) as BoxElement
    expect(table.cells).toEqual([["名前", "数"], ["A", "1"]])
    expect(table.w).toBe((table.colWidths ?? []).reduce((s, w) => s + w, 0))
    expect(elementDataProblem(elementToData(table))).toBeNull()
    const els = map(table)
    expect((cellPatch(els, "t-000001", 1, 1, "2")["t-000001"] as BoxElement).cells?.[1][1]).toBe("2")
    const more = tablePatch(els, "t-000001", 0, 0, "row-below")["t-000001"] as BoxElement
    expect(more.cells).toHaveLength(3)
    expect(more.rowHeights).toHaveLength(3)
    const fewer = tablePatch(els, "t-000001", 0, 0, "col-delete")["t-000001"] as BoxElement
    expect(fewer.cells).toEqual([["数"], ["1"]])
    const first = (table.colWidths ?? [0])[0]
    expect(cellAt(table, { x: first + 1, y: 1 })).toEqual({ row: 0, col: 1 })
  })

  it("a new table drawn with the tool is 3 × 3", () => {
    const t = newBox("table", { x: 0, y: 0, w: 300, h: 120 }, "t-000002", 1)
    expect(t.cells).toHaveLength(3)
    expect(t.cells?.[0]).toHaveLength(3)
  })
})

describe("votes", () => {
  it("toggles the viewer's vote on a sticky note", () => {
    const s = box("s-000001", 0, 0, 100, 100, { type: "sticky" })
    const once = votePatch(map(s), "s-000001", "u-1")["s-000001"] as BoxElement
    expect(once.voters).toEqual(["u-1"])
    expect(votePatch(map(once), "s-000001", "u-1")["s-000001"]).not.toHaveProperty("voters")
    expect(votePatch(map(box("r", 0, 0)), "r", "u-1")).toEqual({})
  })
})

describe("clipboard", () => {
  it("reads an Excel range (tabs, CRLF, quoted line breaks) as a grid", () => {
    expect(parseTsv('a\tb\r\n"x\r\ny"\t"say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x\ny", 'say "hi"'],
    ])
    expect(parseTsv("plain text")).toBeNull()
  })

  it("pads short rows and cuts to the limits", () => {
    expect(boundCells([["a", "b"], ["c"]])).toEqual([
      ["a", "b"],
      ["c", ""],
    ])
    const huge = Array.from({ length: BOARD_LIMITS.tableRows + 5 }, () => Array.from({ length: BOARD_LIMITS.tableCols + 5 }, () => "x"))
    const cut = boundCells(huge) as string[][]
    expect(cut).toHaveLength(BOARD_LIMITS.tableRows)
    expect(cut[0]).toHaveLength(BOARD_LIMITS.tableCols)
    expect(boundCells([[""], [""]])).toBeNull()
  })

  it("reads the first HTML table", () => {
    const html = "<html><body><table><tr><td>a&nbsp;b</td><td>1</td></tr><tr><th>c</th><td>2</td></tr></table></body></html>"
    const cells = parseHtmlTable(html, (s) => new DOMParser().parseFromString(s, "text/html"))
    expect(cells).toEqual([
      ["a b", "1"],
      ["c", "2"],
    ])
    expect(parseHtmlTable("<p>no table</p>", () => new DOMParser().parseFromString("", "text/html"))).toBeNull()
  })
})

describe("mind map", () => {
  it("adds children and siblings joined by curved lines between side midpoints, and tidies the tree", () => {
    const root = box("r-000001", 0, 0, 120, 50)
    const makeId = ids("n-")
    const first = mindChildPatch(map(root), "r-000001", makeId)
    expect(first).not.toBeNull()
    let els: ElementMap = { ...map(root), ...(first?.patch as ElementMap) }
    const childId = first?.id as string
    expect(mindParent(els, childId)?.id).toBe("r-000001")
    const branch = Object.values(els).find(isLine) as LineElement
    expect(branch.start).toMatchObject({ attach: "r-000001", side: "e" })
    expect(branch.end).toMatchObject({ attach: childId, side: "w" })
    expect(branch.route).toBe("curve")

    const sibling = mindSiblingPatch(els, childId, makeId)
    els = { ...els, ...(sibling?.patch as ElementMap) }
    expect(mindChildren(els, "r-000001").map((c) => c.id)).toEqual([childId, sibling?.id])
    // A root has no parent: no sibling.
    expect(mindSiblingPatch(els, "r-000001", makeId)).toBeNull()

    // Mess the layout up, then tidy: children right of the root, stacked around its middle, the root stays.
    els = { ...els, [childId]: { ...(els[childId] as BoxElement), x: 900, y: -400 } }
    const tidy = mindLayoutPatch(els, childId)
    const after = { ...els, ...(tidy as ElementMap) }
    const kids = mindChildren(after, "r-000001")
    expect(tidy).not.toHaveProperty("r-000001")
    for (const k of kids) expect(k.x).toBe(120 + 60)
    const mid = (kids[0].y + kids[kids.length - 1].y + kids[kids.length - 1].h) / 2
    expect(mid).toBeCloseTo(25, 0)
  })
})

describe("templates", () => {
  it("places the template's frames centred, with the given texts", () => {
    const texts = Object.fromEntries(
      ["keep", "problem", "tryNext", "strengths", "weaknesses", "opportunities", "threats", "minutesTitle", "minutesMeta", "agenda", "decisions", "actions", "reportTitle", "summary", "progress", "issues", "next"].map((k) => [k, `T:${k}`]),
    ) as unknown as TemplateTexts
    const { patch, ids: created } = templatePatch("kpt", texts, { x: 0, y: 0 }, ids("k-"), 10)
    expect(created).toHaveLength(3)
    const boxes = Object.values(patch).filter(isBox)
    expect(boxes.map((b) => b.text)).toEqual(["T:keep", "T:problem", "T:tryNext"])
    expect(boxes.every((b) => b.type === "frame")).toBe(true)
    for (const b of boxes) expect(elementDataProblem(elementToData(b))).toBeNull()
    const minX = Math.min(...boxes.map((b) => b.x))
    const maxX = Math.max(...boxes.map((b) => b.x + b.w))
    expect(minX + maxX).toBeCloseTo(0, -1)
  })
})

describe("remote changes", () => {
  it("applies what others saved with a higher version and records it as saved", () => {
    const mine = box("b-000001", 0, 0)
    const state = initialState({ elements: map(mine), versions: { "b-000001": 2 } })
    const saved = { "b-000001": 2 }
    const remote = [
      { id: "b-000001", version: 3, deleted: false, data: elementToData({ ...mine, x: 50 }) },
      { id: "c-000001", version: 1, deleted: false, data: elementToData(box("c-000001", 9, 9)) },
    ]
    const next = applyRemote(state, saved, remote)
    expect(next.changed).toBe(true)
    expect((next.state.doc.elements["b-000001"] as BoxElement).x).toBe(50)
    expect(next.saved).toEqual({ "b-000001": 3, "c-000001": 1 })
    // Its own save coming back changes nothing.
    expect(applyRemote(next.state, next.saved, remote).changed).toBe(false)
    // A remote delete removes the element.
    const gone = applyRemote(next.state, next.saved, [{ id: "c-000001", version: 2, deleted: true, data: {} }])
    expect(gone.state.doc.elements).not.toHaveProperty("c-000001")
  })

  it("leaves an element with an unsaved local change alone, and drops undo steps of replaced elements", () => {
    const a = box("a-000001", 0, 0)
    const b = box("b-000001", 0, 0)
    // a: changed here, not saved yet (version 3, saved 2). b: saved; an undo step touches it.
    const state = { ...initialState({ elements: map(a, b), versions: { "a-000001": 3, "b-000001": 2 } }), undoStack: [{ undo: { "b-000001": b }, redo: { "b-000001": { ...b, x: 5 } } }] }
    const saved = { "a-000001": 2, "b-000001": 2 }
    const remote = [
      { id: "a-000001", version: 4, deleted: false, data: elementToData({ ...a, x: 99 }) },
      { id: "b-000001", version: 3, deleted: false, data: elementToData({ ...b, x: 77 }) },
    ]
    const next = applyRemote(state, saved, remote)
    expect((next.state.doc.elements["a-000001"] as BoxElement).x).toBe(0)
    expect(next.saved["a-000001"]).toBe(2)
    expect((next.state.doc.elements["b-000001"] as BoxElement).x).toBe(77)
    expect(next.state.undoStack).toHaveLength(0)
  })
})

describe("labels", () => {
  it("sets a one-line label on a line and removes an empty one", () => {
    const l = newLine("line", { point: { x: 0, y: 0 }, attach: null }, { point: { x: 9, y: 9 }, attach: null }, "l-000001", 1)
    const set = labelPatch(map(l), "l-000001", "  はい\nいいえ ")["l-000001"] as LineElement
    expect(set.label).toBe("はい いいえ")
    expect(labelPatch(map(set), "l-000001", "  ")["l-000001"]).not.toHaveProperty("label")
  })
})
