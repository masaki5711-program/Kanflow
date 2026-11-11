import { describe, expect, it } from "vitest"
import type { ElementMap } from "./geometry"
import { guidedMove } from "./guides"
import { elementDataProblem, type BoxElement, type KnownElement, type LineElement } from "./model"
import { besidePatch, connectPatch, groupFramesPatch, newBox, pbiPatch, newShape, newTimer, sortByVotesPatch, timerLeft, timerPatch, voteBudgetOf, votePatch, votesUsed } from "./ops"
import { imagePdf, pdfLayout } from "./pdf"
import { SHAPE_KINDS, shapePath } from "./shapes"
import { TEMPLATE_KINDS, TEMPLATE_TEXT_KEYS, templatePatch, type TemplateTextKey } from "./templates"

const map = (...els: KnownElement[]): ElementMap => Object.fromEntries(els.map((el) => [el.id, el]))
const box = (id: string, x: number, y = 0, extra: Partial<BoxElement> = {}): BoxElement => ({ ...newBox("rect", { x, y, w: 100, h: 60 }, id, 1), ...extra })
const sticky = (id: string, x: number, voters: string[] = []): BoxElement => ({ ...newBox("sticky", { x, y: 0, w: 100, h: 100 }, id, 1), ...(voters.length ? { voters } : {}) })
const data = (el: KnownElement) => {
  const copy: Record<string, unknown> = { ...el }
  delete copy.id
  return copy
}

describe("B7 shape library (synthetic)", () => {
  it("every shape has an outline the server accepts", () => {
    for (const kind of SHAPE_KINDS) {
      const d = shapePath(kind, 10, 20, 140, 100)
      expect(d.length, kind).toBeGreaterThan(10)
      expect(d, kind).not.toMatch(/NaN|undefined/)
      expect(elementDataProblem(data(newShape(kind, { x: 0, y: 0 }, "shp-0001", 1))), kind).toBeNull()
    }
    expect(elementDataProblem({ ...data(newShape("diamond", { x: 0, y: 0 }, "shp-0001", 1)), shape: "unicorn" })).not.toBeNull()
  })
})

describe("B7 alignment guides", () => {
  it("a dragged shape catches the left edge and the middle of a shape nearby, and says so", () => {
    const els = map(box("box-0001", 0, 0), box("box-0002", 300, 200))
    // Moving box 2 left by 297 brings its left edge within 3 of box 1's left edge.
    const moved = guidedMove(els, ["box-0002"], -297, -150, 6)
    expect(moved.d).toEqual({ x: -300, y: -150 })
    expect(moved.guides).toEqual([{ axis: "x", x: 0, y1: 0, y2: 110 }])
    // Its middle comes within 4 of the other's middle (30): both axes line up.
    expect(guidedMove(els, ["box-0002"], -297, -166, 6).guides.map((g) => g.axis)).toEqual(["x", "y"])
    // Far from everything: unchanged.
    expect(guidedMove(els, ["box-0002"], 100, 100, 6)).toEqual({ d: { x: 100, y: 100 }, guides: [] })
  })
})

describe("B7 PDF", () => {
  it("is a one-page PDF with the picture fitted in a landscape page, and a correct cross-reference table", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const pdf = imagePdf(jpeg, 2000, 1000, "a4", "合成 sheet")
    const text = new TextDecoder("latin1").decode(pdf)
    expect(text.startsWith("%PDF-1.4")).toBe(true)
    expect(text).toContain("/MediaBox [0 0 841.89 595.28]")
    expect(text).toContain("/Title ( sheet)")
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1])
    expect(text.slice(xref, xref + 4)).toBe("xref")
    const offsets = [...text.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    offsets.forEach((offset, i) => expect(text.slice(offset, offset + 7)).toBe(`${i + 1} 0 obj`))
    const layout = pdfLayout("a3", 500, 1000)
    expect(layout.pageW).toBeLessThan(layout.pageH)
    expect(layout.h).toBeCloseTo(1190.55 - 48)
  })
})

describe("B7 timer and votes", () => {
  it("counts down to the same end for everyone; pauses, resumes, resets and changes length", () => {
    const timer = newTimer(5, { x: 0, y: 0 }, "tmr-0001", 1)
    expect(elementDataProblem(data(timer))).toBeNull()
    expect(timerLeft(timer, 0)).toBe(300)
    const started = timerPatch(map(timer), "tmr-0001", { kind: "start" }, 1_000_000)["tmr-0001"] as BoxElement
    expect(started.endsAt).toBe(1_300_000)
    expect(timerLeft(started, 1_100_000)).toBe(200)
    const paused = timerPatch(map(started), "tmr-0001", { kind: "pause" }, 1_100_000)["tmr-0001"] as BoxElement
    expect(paused.endsAt).toBeUndefined()
    expect(paused.remainingSec).toBe(200)
    const resumed = timerPatch(map(paused), "tmr-0001", { kind: "start" }, 2_000_000)["tmr-0001"] as BoxElement
    expect(resumed.endsAt).toBe(2_200_000)
    const longer = timerPatch(map(resumed), "tmr-0001", { kind: "duration", sec: 600 }, 2_000_000)["tmr-0001"] as BoxElement
    expect([longer.durationSec, longer.endsAt, longer.remainingSec]).toEqual([600, undefined, undefined])
    expect(elementDataProblem({ ...data(timer), durationSec: 5 })).not.toBeNull()
  })

  it("without a budget a person gives one vote per note and can take it back", () => {
    const els = map(sticky("stk-0001", 0))
    const voted = votePatch(els, "stk-0001", "u-synthetic-1")["stk-0001"] as BoxElement
    expect(voted.voters).toEqual(["u-synthetic-1"])
    expect(votePatch(map(voted), "stk-0001", "u-synthetic-1", "add")).toEqual({})
    expect((votePatch(map(voted), "stk-0001", "u-synthetic-1")["stk-0001"] as BoxElement).voters).toBeUndefined()
  })

  it("with a budget on the sheet's timer a person gives up to that many votes, several on one note", () => {
    const timer = { ...newTimer(5, { x: 0, y: 0 }, "tmr-0001", 1), voteBudget: 2 }
    let els = map(timer, sticky("stk-0001", 0), sticky("stk-0002", 200))
    expect(voteBudgetOf(els)).toBe(2)
    for (const id of ["stk-0001", "stk-0001", "stk-0002"]) els = { ...els, ...votePatch(els, id, "u-synthetic-1", "add") } as ElementMap
    expect(votesUsed(els, "u-synthetic-1")).toBe(2)
    expect((els["stk-0001"] as BoxElement).voters).toEqual(["u-synthetic-1", "u-synthetic-1"])
    expect((els["stk-0002"] as BoxElement).voters).toBeUndefined()
    els = { ...els, ...votePatch(els, "stk-0001", "u-synthetic-1", "remove") } as ElementMap
    expect(votesUsed(els, "u-synthetic-1")).toBe(1)
    // A toggle under a budget adds while votes are left, then takes one back.
    els = { ...els, ...votePatch(els, "stk-0001", "u-synthetic-1", "toggle") } as ElementMap
    expect(votesUsed(els, "u-synthetic-1")).toBe(2)
    els = { ...els, ...votePatch(els, "stk-0001", "u-synthetic-1", "toggle") } as ElementMap
    expect(votesUsed(els, "u-synthetic-1")).toBe(1)
  })

  it("sorts sticky notes by votes, most first, row by row", () => {
    const els = map(sticky("stk-0001", 0, ["a"]), sticky("stk-0002", 200, ["a", "b", "c"]), sticky("stk-0003", 400, ["a", "b"]), sticky("stk-0004", 600))
    const patch = sortByVotesPatch(els, ["stk-0001", "stk-0002", "stk-0003", "stk-0004"])
    const at = (id: string) => {
      const el = (patch[id] ?? els[id]) as BoxElement
      return [el.x, el.y]
    }
    expect([at("stk-0002"), at("stk-0003"), at("stk-0001"), at("stk-0004")]).toEqual([
      [0, 0],
      [116, 0],
      [0, 116],
      [116, 116],
    ])
  })
})

describe("B7 connect and templates", () => {
  it("connects exactly two shapes with an attached arrow", () => {
    const els = map(box("box-0001", 0), box("box-0002", 300))
    const made = connectPatch(els, ["box-0001", "box-0002"], () => "lin-0001")
    const line = made?.patch["lin-0001"] as LineElement
    expect([line.type, line.start.attach, line.end.attach]).toEqual(["arrow", "box-0001", "box-0002"])
    expect(connectPatch(els, ["box-0001"], () => "lin-0002")).toBeNull()
  })

  it("every template makes elements the server accepts; lines attached to its parts", () => {
    const texts = Object.fromEntries(TEMPLATE_TEXT_KEYS.map((k) => [k, `${k}（合成）`])) as Record<TemplateTextKey, string>
    for (const kind of TEMPLATE_KINDS) {
      let n = 0
      const { patch, ids } = templatePatch(kind, texts, { x: 0, y: 0 }, () => `t-${kind.slice(0, 3)}-${String(++n).padStart(4, "0")}`, 0)
      expect(ids.length, kind).toBeGreaterThan(2)
      for (const el of Object.values(patch)) expect(elementDataProblem(data(el as KnownElement)), `${kind} ${(el as KnownElement).type}`).toBeNull()
      for (const el of Object.values(patch)) {
        if (el?.type !== "arrow" && el?.type !== "line") continue
        for (const end of [el.start, el.end]) if (end.attach) expect(patch[end.attach], kind).toBeDefined()
      }
    }
  })

  it("the 5 whys run problem → why 1 … 5 → root cause, with the countermeasure beside it", () => {
    const texts = Object.fromEntries(TEMPLATE_TEXT_KEYS.map((k) => [k, k])) as Record<TemplateTextKey, string>
    texts.why5Why = "なぜ{n}"
    let n = 0
    const { patch } = templatePatch("why5", texts, { x: 0, y: 0 }, () => `w5-${String(++n).padStart(4, "0")}`, 0)
    const titles = Object.values(patch)
      .filter((el) => el?.type === "frame")
      .map((el) => (el as BoxElement).text)
    expect(titles).toEqual(["why5Problem", "なぜ1", "なぜ2", "なぜ3", "なぜ4", "なぜ5", "why5Root", "why5Action"])
    expect(Object.values(patch).filter((el) => el?.type === "arrow")).toHaveLength(7)
  })

  it("the fishbone has a bone per variation factor (7) and the effect at the head", () => {
    const texts = Object.fromEntries(TEMPLATE_TEXT_KEYS.map((k) => [k, k])) as Record<TemplateTextKey, string>
    let n = 0
    const { patch } = templatePatch("fishbone", texts, { x: 0, y: 0 }, () => `fb-${String(++n).padStart(4, "0")}`, 0)
    const all = Object.values(patch)
    const factors = all.filter((el) => el?.type === "rect").map((el) => (el as BoxElement).text)
    expect(factors).toEqual(["fishMan", "fishMachine", "fishMaterial", "fishMethod", "fishMeasurement", "fishManagement", "fishEnvironment"])
    expect(all.filter((el) => el?.type === "line")).toHaveLength(7)
    expect(all.filter((el) => el?.type === "arrow")).toHaveLength(1)
  })
})

describe("B7 PBI links and AI results", () => {
  it("links and unlinks a box to a PBI (only the id is kept)", () => {
    const els = map(box("box-0001", 0))
    const linked = pbiPatch(els, "box-0001", "pbi-abc")["box-0001"] as BoxElement
    expect(linked.pbiId).toBe("pbi-abc")
    expect((pbiPatch(map(linked), "box-0001", null)["box-0001"] as BoxElement).pbiId).toBeUndefined()
    expect(elementDataProblem(data(linked))).toBeNull()
    expect(elementDataProblem({ ...data(linked), pbiId: "../x" })).not.toBeNull()
  })

  it("puts a summary beside the notes and sorts notes into one frame per group", () => {
    const els = map(sticky("stk-0001", 0), sticky("stk-0002", 200), sticky("stk-0003", 400))
    const beside = besidePatch(els, ["stk-0001", "stk-0002"], "- a\n- b", () => "txt-0001")
    const text = beside?.patch["txt-0001"] as BoxElement
    expect([text.type, text.x, text.text]).toEqual(["text", 360, "- a\n- b"])
    let n = 0
    const grouped = groupFramesPatch(els, ["stk-0001", "stk-0002", "stk-0003"], [{ title: "A（合成）", items: [0, 2] }, { title: "B（合成）", items: [1] }], () => `frm-${String(++n).padStart(4, "0")}`)
    expect(grouped.frameIds).toEqual(["frm-0001", "frm-0002"])
    const frame = grouped.patch["frm-0001"] as BoxElement
    expect([frame.type, frame.text]).toEqual(["frame", "A（合成）"])
    for (const id of ["stk-0001", "stk-0003"]) {
      const note = grouped.patch[id] as BoxElement
      expect(note.x >= frame.x && note.x + note.w <= frame.x + frame.w && note.y >= frame.y && note.y + note.h <= frame.y + frame.h).toBe(true)
    }
  })
})
