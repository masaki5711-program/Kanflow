import { describe, expect, it } from "vitest"
import { BOARD_LIMITS } from "../limits"
import { elementDataProblem, elementFromData, elementToData, isBox, isLine, type BoxElement } from "../model"
import { newElementId } from "../ids"

const RECT = { type: "rect", x: 10, y: 20, w: 100, h: 50, z: 1, text: "", fill: "white", stroke: "ink" }
const ARROW = { type: "arrow", z: 2, start: { x: 0, y: 0, attach: "box-000001" }, end: { x: 50, y: 60 }, stroke: "blue" }

describe("elementDataProblem", () => {
  it("accepts every known type", () => {
    for (const type of ["rect", "ellipse", "text", "sticky"]) expect(elementDataProblem({ ...RECT, type })).toBeNull()
    for (const type of ["line", "arrow"]) expect(elementDataProblem({ ...ARROW, type })).toBeNull()
  })

  it("refuses a known type with a bad field", () => {
    expect(elementDataProblem({ ...RECT, w: 0 })).toBe("invalid rect")
    expect(elementDataProblem({ ...RECT, x: BOARD_LIMITS.coordinate + 1 })).toBe("invalid rect")
    expect(elementDataProblem({ ...RECT, x: Number.NaN })).toBe("invalid rect")
    expect(elementDataProblem({ ...RECT, fill: "#ff0000" })).toBe("invalid rect")
    expect(elementDataProblem({ ...RECT, text: "x".repeat(BOARD_LIMITS.textLength + 1) })).toBe("invalid rect")
    expect(elementDataProblem({ ...ARROW, end: { x: 1 } })).toBe("invalid arrow")
    expect(elementDataProblem({ ...ARROW, start: { x: 0, y: 0, attach: "no" } })).toBe("invalid arrow")
  })

  it("accepts an unknown type by shape only, within the size limit", () => {
    expect(elementDataProblem({ type: "video", fileId: "f1", x: 1 })).toBeNull()
    expect(elementDataProblem({ type: "video", cells: "x".repeat(BOARD_LIMITS.elementJsonChars) })).toBe("data is too large")
  })

  it("refuses what is not an object with a type", () => {
    expect(elementDataProblem(null)).toBe("data must be an object with a type")
    expect(elementDataProblem("rect")).toBe("data must be an object with a type")
    expect(elementDataProblem({ x: 1 })).toBe("data must be an object with a type")
    expect(elementDataProblem({ type: "Not A Type" })).toBe("data must be an object with a type")
  })
})

describe("elementFromData / elementToData", () => {
  it("reads a known type as an editor element and writes the same data back", () => {
    const el = elementFromData("box-000001", RECT)
    expect(isBox(el)).toBe(true)
    expect(el).toEqual({ ...RECT, id: "box-000001" })
    expect(elementToData(el)).toEqual(RECT)
  })

  it("reads a line", () => {
    const el = elementFromData("line-00001", ARROW)
    expect(isLine(el)).toBe(true)
    expect(elementToData(el)).toEqual(ARROW)
  })

  it("keeps the keys of a known type that this build does not know", () => {
    const data = { ...RECT, shadow: { blur: 4 }, rotation: 15 }
    const el = elementFromData("box-000001", data) as BoxElement
    const moved = { ...el, x: 99 }
    expect(elementToData(moved)).toEqual({ ...data, x: 99 })
  })

  it("carries an unknown type untouched", () => {
    const data = { type: "video", fileId: "f1", x: 1, y: 2, nested: { a: [1, 2] } }
    const el = elementFromData("img-000001", data)
    expect(el.type).toBe("unknown")
    expect(elementToData(el)).toBe(data)
  })

  it("carries a known type that does not pass its schema as unknown (no repair, no loss)", () => {
    const data = { ...RECT, w: -5 }
    const el = elementFromData("box-000001", data)
    expect(el.type).toBe("unknown")
    expect(elementToData(el)).toEqual(data)
  })
})

describe("newElementId", () => {
  it("makes ids the server accepts, different each time", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newElementId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{20}$/)
  })
})
