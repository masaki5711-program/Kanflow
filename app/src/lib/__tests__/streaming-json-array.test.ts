import { describe, expect, it } from "vitest"
import { extractPartialArrayObjects, extractPartialObject } from "@/lib/streaming-json-array"

describe("extractPartialArrayObjects", () => {
  it("returns [] when the key is absent or the array is not objects", () => {
    expect(extractPartialArrayObjects('{"other": []}', "items")).toEqual([])
    expect(extractPartialArrayObjects('{"items": [1, 2]}', "items")).toEqual([])
    expect(extractPartialArrayObjects('{"items": [', "items")).toEqual([])
    expect(extractPartialArrayObjects('{"items": []}', "items")).toEqual([])
  })

  it("parses complete objects with all value kinds", () => {
    const buf = JSON.stringify({
      items: [
        { s: "a\"b\n", n: -1.5, t: true, f: false, z: null, arr: [1, "x", [2], { k: 1 }, null, true, false], obj: { q: [1] } },
        { s: "second" },
      ],
    })
    const out = extractPartialArrayObjects(buf, "items")
    expect(out).toEqual([
      {
        closed: true,
        fields: { s: "a\"b\n", n: -1.5, t: true, f: false, z: null, arr: [1, "x", [2], { k: 1 }, null, true, false], obj: { q: [1] } },
      },
      { closed: true, fields: { s: "second" } },
    ])
  })

  it("surfaces a partial string value and stops at the open object", () => {
    const out = extractPartialArrayObjects('{"items": [{"a": "done"}, {"title": "hel', "items")
    expect(out).toEqual([
      { closed: true, fields: { a: "done" } },
      { closed: false, fields: { title: "hel" } },
    ])
  })

  it("decodes escapes in partial strings, including incomplete ones", () => {
    const [o] = extractPartialArrayObjects('{"items":[{"t":"a\\tb\\r\\b\\f\\/\\\\\\"\\u0041\\x', "items")
    expect(o.fields.t).toBe('a\tb\r\b\f/\\"Ax')
    const [p] = extractPartialArrayObjects('{"items":[{"t":"ab\\u00', "items")
    expect(p.fields.t).toBe("ab")
    const [q] = extractPartialArrayObjects('{"items":[{"t":"ab\\', "items")
    expect(q.fields.t).toBe("ab")
  })

  it("stops on incomplete literals, keys, colons, nested values", () => {
    expect(extractPartialArrayObjects('{"items":[{"n": 12', "items")[0]).toEqual({ closed: false, fields: {} })
    expect(extractPartialArrayObjects('{"items":[{"ke', "items")[0]).toEqual({ closed: false, fields: {} })
    expect(extractPartialArrayObjects('{"items":[{"k"', "items")[0].fields).toEqual({})
    expect(extractPartialArrayObjects('{"items":[{"k":', "items")[0].fields).toEqual({})
    expect(extractPartialArrayObjects('{"items":[{"k": {"a": 1', "items")[0].fields).toEqual({})
    expect(extractPartialArrayObjects('{"items":[{"k": {"a": "x', "items")[0].fields).toEqual({})
    expect(extractPartialArrayObjects('{"items":[{', "items")[0]).toEqual({ closed: false, fields: {} })
    expect(extractPartialArrayObjects('{"items":[{ x', "items")[0]).toEqual({ closed: false, fields: {} })
  })

  it("returns partial arrays inside objects", () => {
    expect(extractPartialArrayObjects('{"items":[{"tags": ["a", "b', "items")[0].fields).toEqual({ tags: ["a", "b"] })
    expect(extractPartialArrayObjects('{"items":[{"tags": [1, [2, 3', "items")[0].fields).toEqual({ tags: [1, [2]] })
    expect(extractPartialArrayObjects('{"items":[{"tags": [{"a":1}, {"b"', "items")[0].fields).toEqual({ tags: [{ a: 1 }] })
    expect(extractPartialArrayObjects('{"items":[{"tags": [1, 2', "items")[0].fields).toEqual({ tags: [1] })
    expect(extractPartialArrayObjects('{"items":[{"tags": [', "items")[0].fields).toEqual({ tags: [] })
  })

  it("ignores unparseable tokens and malformed nested JSON", () => {
    const [o] = extractPartialArrayObjects('{"items":[{"a": nope, "b": {bad}, "c": [xx, {bad}, 1], "d": 2}]}', "items")
    expect(o.closed).toBe(true)
    expect(o.fields).toEqual({ c: [1], d: 2 })
  })
})

describe("extractPartialObject", () => {
  it("returns null without an object", () => {
    expect(extractPartialObject("no json here")).toBeNull()
  })

  it("parses the first top-level object partially", () => {
    expect(extractPartialObject('prefix {"headline": "Hi", "overview": "Wor')).toEqual({
      closed: false,
      fields: { headline: "Hi", overview: "Wor" },
    })
    expect(extractPartialObject('{"a": 1}')).toEqual({ closed: true, fields: { a: 1 } })
  })
})
