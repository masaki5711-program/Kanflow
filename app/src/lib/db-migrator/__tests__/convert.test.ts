import { describe, expect, it } from "vitest"
import {
  canonicalRow,
  canonicalValue,
  ConversionError,
  jsonHasNul,
  stableStringify,
  targetKindOf,
  toTargetText,
  type ColumnMapping,
  type TargetKind,
} from "../convert"

function col(kind: TargetKind, sourceType = "varchar", sourceColumnType = sourceType): ColumnMapping {
  return { name: "c", kind, pgType: kind, sourceType, sourceColumnType, nullable: true }
}

function convCode(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof ConversionError ? e.code : String(e)
  }
  return undefined
}

describe("targetKindOf", () => {
  it("maps PostgreSQL types to conversion kinds", () => {
    expect(targetKindOf("bool", "b")).toBe("boolean")
    expect(targetKindOf("int4", "b")).toBe("integer")
    expect(targetKindOf("int8", "b")).toBe("integer")
    expect(targetKindOf("float8", "b")).toBe("float")
    expect(targetKindOf("numeric", "b")).toBe("numeric")
    expect(targetKindOf("text", "b")).toBe("text")
    expect(targetKindOf("varchar", "b")).toBe("text")
    expect(targetKindOf("citext", "b")).toBe("text")
    expect(targetKindOf("bpchar", "b")).toBe("char")
    expect(targetKindOf("timestamp", "b")).toBe("timestamp")
    expect(targetKindOf("timestamptz", "b")).toBe("timestamptz")
    expect(targetKindOf("date", "b")).toBe("date")
    expect(targetKindOf("jsonb", "b")).toBe("jsonb")
    expect(targetKindOf("json", "b")).toBe("json")
    expect(targetKindOf("bytea", "b")).toBe("bytea")
    expect(targetKindOf("TaskStatus", "e")).toBe("enum")
    expect(targetKindOf("tsvector", "b")).toBeNull()
  })
})

describe("toTargetText", () => {
  it("tinyint(1) -> boolean, strictly 0 / 1", () => {
    const c = col("boolean", "tinyint", "tinyint(1)")
    expect(toTargetText("0", c)).toBe("false")
    expect(toTargetText("1", c)).toBe("true")
    expect(toTargetText(null, c)).toBeNull()
    expect(convCode(() => toTargetText("2", c))).toBe("BOOLEAN_DOMAIN")
  })

  it("DATETIME(3) is copied as the same wall-clock value (UTC by the Prisma convention), never shifted", () => {
    const c = col("timestamp", "datetime", "datetime(3)")
    expect(toTargetText("2026-03-10 07:42:36.123", c)).toBe("2026-03-10 07:42:36.123")
    expect(toTargetText("2026-03-10 07:42:36", c)).toBe("2026-03-10 07:42:36")
    expect(convCode(() => toTargetText("0000-00-00 00:00:00.000", c))).toBe("INVALID_DATETIME")
    expect(convCode(() => toTargetText("2026-00-10 00:00:00.000", c))).toBe("INVALID_DATETIME")
    expect(convCode(() => toTargetText("garbage", c))).toBe("INVALID_DATETIME")
  })

  it("DATETIME into timestamptz is read as UTC", () => {
    expect(toTargetText("2026-03-10 07:42:36.123", col("timestamptz", "datetime"))).toBe("2026-03-10 07:42:36.123+00")
  })

  it("text with a NUL byte is refused (PostgreSQL text cannot hold 0x00)", () => {
    expect(convCode(() => toTargetText("a\u0000b", col("text")))).toBe("NUL_BYTE")
    expect(toTargetText("日本語 🚀 Ⱥ", col("text"))).toBe("日本語 🚀 Ⱥ")
    expect(toTargetText("", col("text"))).toBe("")
  })

  it("JSON must parse and must not carry \\u0000 (jsonb rejects it)", () => {
    const c = col("jsonb", "json")
    expect(toTargetText('{"b":1,"a":[1,2]}', c)).toBe('{"b":1,"a":[1,2]}')
    expect(toTargetText("null", c)).toBe("null")
    expect(convCode(() => toTargetText("{not json", col("jsonb", "text")))).toBe("INVALID_JSON")
    expect(convCode(() => toTargetText('{"a":"x\\u0000y"}', c))).toBe("INVALID_JSON")
    expect(convCode(() => toTargetText('{"k\\u0000":1}', c))).toBe("INVALID_JSON")
  })

  it("integers and floats are validated, not reformatted", () => {
    expect(toTargetText("-42", col("integer", "int"))).toBe("-42")
    expect(convCode(() => toTargetText("4.2", col("integer", "int")))).toBe("INVALID_NUMBER")
    expect(toTargetText("1e-300", col("float", "double"))).toBe("1e-300")
    expect(toTargetText("0.1", col("float", "double"))).toBe("0.1")
    expect(convCode(() => toTargetText("abc", col("float", "double")))).toBe("INVALID_NUMBER")
  })

  it("binary -> bytea hex", () => {
    expect(toTargetText(Buffer.from([0, 255, 16]), col("bytea", "blob"))).toBe("\\x00ff10")
  })
})

describe("canonicalValue", () => {
  it("normalizes both sides to one representation", () => {
    expect(canonicalValue("boolean", "t")).toBe("true")
    expect(canonicalValue("boolean", "false")).toBe("false")
    expect(canonicalValue("integer", "007")).toBe("7")
    expect(canonicalValue("float", "1e-300")).toBe(canonicalValue("float", "1.0e-300"))
    expect(canonicalValue("timestamp", "2026-03-10 07:42:36")).toBe(canonicalValue("timestamp", "2026-03-10 07:42:36.000"))
    expect(canonicalValue("timestamp", "2026-03-10 07:42:36.12")).toBe("2026-03-10 07:42:36.120000")
    expect(canonicalValue("timestamptz", "2026-03-10 14:42:36.5+07")).toBe(canonicalValue("timestamptz", "2026-03-10 07:42:36.500+00"))
    expect(canonicalValue("jsonb", '{"b":1, "a":{"y":2,"x":[3]}}')).toBe('{"a":{"x":[3],"y":2},"b":1}')
    expect(canonicalValue("char", "ja")).toBe(canonicalValue("char", "ja   "))
    expect(canonicalValue("text", "Ab ")).toBe("Ab ")
    expect(canonicalValue("text", null)).toBeNull()
  })

  it("keeps SQL NULL and JSON null distinct", () => {
    expect(canonicalRow(["jsonb"], [null])).not.toBe(canonicalRow(["jsonb"], ["null"]))
  })

  it("keeps a NULL distinct from the string 'null' and an empty string", () => {
    const a = canonicalRow(["text"], [null])
    expect(a).not.toBe(canonicalRow(["text"], ["null"]))
    expect(a).not.toBe(canonicalRow(["text"], [""]))
  })
})

describe("stableStringify / jsonHasNul", () => {
  it("sorts keys recursively", () => {
    expect(stableStringify({ b: [{ d: 1, c: 2 }], a: null })).toBe('{"a":null,"b":[{"c":2,"d":1}]}')
  })
  it("finds NUL in nested strings and keys", () => {
    expect(jsonHasNul({ a: ["x", { b: "\u0000" }] })).toBe(true)
    expect(jsonHasNul({ "\u0000": 1 })).toBe(true)
    expect(jsonHasNul({ a: ["x", 1, true, null] })).toBe(false)
  })
})

describe("review follow-ups: exact JSON numbers, date-only timestamps, value-free errors", () => {
  it("compares JSON numbers exactly as decimals (no double rounding, exponent forms equal)", () => {
    expect(canonicalValue("jsonb", '{"a":1e300}')).toBe(canonicalValue("jsonb", `{"a":1${"0".repeat(300)}}`))
    expect(canonicalValue("jsonb", "[0.1]")).toBe(canonicalValue("jsonb", "[0.10]"))
    expect(canonicalValue("jsonb", "[1.5e3]")).toBe(canonicalValue("jsonb", "[1500]"))
    expect(canonicalValue("jsonb", "[-0.0]")).toBe(canonicalValue("jsonb", "[0]"))
    expect(canonicalValue("jsonb", "[12345678901234567890]")).not.toBe(canonicalValue("jsonb", "[12345678901234567891]"))
    expect(canonicalValue("jsonb", '{"b":"x","a":{"d":[1,{"z":null}],"c":true}}')).toBe('{"a":{"c":true,"d":[1,{"z":null}]},"b":"x"}')
    expect(canonicalValue("jsonb", '{"a":1,"a":2}')).toBe('{"a":2}')
    expect(canonicalValue("jsonb", '"\u00e9\n"')).toBe(canonicalValue("jsonb", '"é\n"'))
  })

  it("a DATE copied into a timestamp column canonicalizes like PostgreSQL's midnight output", () => {
    expect(canonicalValue("timestamp", "2026-01-01")).toBe(canonicalValue("timestamp", "2026-01-01 00:00:00"))
  })

  it("conversion errors never carry the offending value", () => {
    const secret = "alice@example.test"
    for (const [kind, v] of [
      ["boolean", secret],
      ["integer", secret],
      ["float", secret],
      ["timestamp", secret],
      ["jsonb", secret],
    ] as const) {
      try {
        toTargetText(v, col(kind))
        expect.unreachable()
      } catch (e) {
        expect((e as Error).message).not.toContain(secret)
      }
    }
  })
})
