import { describe, expect, it } from "vitest"
import { buildBooleanQuery, isFulltextEnabled, isMissingFulltextIndex, NGRAM_TOKEN_SIZE } from "../boolean-query"

describe("buildBooleanQuery", () => {
  it("requires every term as a prefix/phrase match", () => {
    expect(buildBooleanQuery("login api")).toBe("+login* +api*")
  })

  it("keeps Japanese and mixed-script runs as one term", () => {
    expect(buildBooleanQuery("ログイン機能")).toBe("+ログイン機能*")
    expect(buildBooleanQuery("ログインAPI 改善")).toBe("+ログインAPI* +改善*")
  })

  it("strips every boolean-mode operator and quote (they become separators)", () => {
    expect(buildBooleanQuery(`+foo -bar <baz> (qux) ~quux* "corge" @grault`)).toBe(
      "+foo* +bar* +baz* +qux* +quux* +corge* +grault*"
    )
    expect(buildBooleanQuery("a&&b||c")).toBeNull() // 1-char terms after splitting
    expect(buildBooleanQuery("foo:bar")).toBe("+foo* +bar*")
  })

  it("splits on other punctuation and full-width spaces", () => {
    expect(buildBooleanQuery("user.story　受け入れ・基準")).toBe("+user* +story* +受け入れ* +基準*")
  })

  it("de-duplicates terms", () => {
    expect(buildBooleanQuery("abc abc ABC")).toBe("+abc* +ABC*")
  })

  it("returns null when any term is shorter than the ngram token size (LIKE handles those)", () => {
    expect(NGRAM_TOKEN_SIZE).toBe(2)
    expect(buildBooleanQuery("機")).toBeNull()
    expect(buildBooleanQuery("sprint 3")).toBeNull()
    expect(buildBooleanQuery("ab")).toBe("+ab*")
  })

  it("counts code points, not UTF-16 units", () => {
    expect(buildBooleanQuery("𠮷")).toBeNull()
    expect(buildBooleanQuery("𠮷野")).toBe("+𠮷野*")
  })

  it("returns null for input with no word characters", () => {
    expect(buildBooleanQuery("")).toBeNull()
    expect(buildBooleanQuery(" +-*\"() ")).toBeNull()
  })

  it("honours a custom minimum term length", () => {
    expect(buildBooleanQuery("ab cd", 3)).toBeNull()
    expect(buildBooleanQuery("abc", 3)).toBe("+abc*")
  })
})

describe("isFulltextEnabled", () => {
  it("defaults to on", () => {
    expect(isFulltextEnabled({})).toBe(true)
    expect(isFulltextEnabled({ SEARCH_FULLTEXT: "on" })).toBe(true)
    expect(isFulltextEnabled({ SEARCH_FULLTEXT: "" })).toBe(true)
  })

  it("is disabled by off / false / 0 (case and spaces ignored)", () => {
    for (const v of ["off", " OFF ", "false", "0"]) expect(isFulltextEnabled({ SEARCH_FULLTEXT: v })).toBe(false)
  })
})

describe("isMissingFulltextIndex", () => {
  it("detects MySQL 1191 through the driver-adapter error of a P2010", () => {
    const err = Object.assign(new Error("Raw query failed. Code: `1191`. Message: `Can't find FULLTEXT index matching the column list`"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { kind: "mysql", code: 1191, originalCode: "1191" } } },
    })
    expect(isMissingFulltextIndex(err)).toBe(true)
  })

  it("detects a bare driver error by errno or message", () => {
    expect(isMissingFulltextIndex(Object.assign(new Error("x"), { errno: 1191 }))).toBe(true)
    expect(isMissingFulltextIndex(new Error("(conn=5, no: 1191) Can't find FULLTEXT index matching the column list"))).toBe(true)
  })

  it("ignores other errors", () => {
    expect(isMissingFulltextIndex(new Error("Table 'x' doesn't exist"))).toBe(false)
    expect(isMissingFulltextIndex(Object.assign(new Error("dup"), { meta: { driverAdapterError: { cause: { code: 1062 } } } }))).toBe(false)
    expect(isMissingFulltextIndex(null)).toBe(false)
    expect(isMissingFulltextIndex("1191")).toBe(false)
  })
})
