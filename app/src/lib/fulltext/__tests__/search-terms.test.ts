import { describe, expect, it } from "vitest"
import { buildSearchTerms, isFulltextEnabled, isMissingTrigramSupport, MIN_TERM_LENGTH } from "../search-terms"

describe("buildSearchTerms", () => {
  it("returns every term (all are required by the trigram query)", () => {
    expect(buildSearchTerms("login api")).toEqual(["login", "api"])
  })

  it("keeps Japanese and mixed-script runs as one term", () => {
    expect(buildSearchTerms("ログイン機能")).toEqual(["ログイン機能"])
    expect(buildSearchTerms("ログインAPI 改善案")).toEqual(["ログインAPI", "改善案"])
  })

  it("strips operators, quotes and LIKE wildcards (they become separators)", () => {
    expect(buildSearchTerms(`+foo -bar <baz> (qux) ~quux* "corge" @grault`)).toEqual(["foo", "bar", "baz", "qux", "quux", "corge", "grault"])
    expect(buildSearchTerms("a&&b||c")).toBeNull() // 1-char terms after splitting
    expect(buildSearchTerms("foo:bar")).toEqual(["foo", "bar"])
    expect(buildSearchTerms("500%_off")).toEqual(["500", "off"])
    expect(buildSearchTerms("abc\\cde")).toEqual(["abc", "cde"])
  })

  it("splits on other punctuation and full-width spaces", () => {
    expect(buildSearchTerms("user.story　受け入れ・基準書")).toEqual(["user", "story", "受け入れ", "基準書"])
  })

  it("de-duplicates identical terms (case variants stay; matching is case-insensitive anyway)", () => {
    expect(buildSearchTerms("abc abc ABC")).toEqual(["abc", "ABC"])
  })

  it("returns null when any term is shorter than 3 characters (no usable trigram: the LIKE path handles those)", () => {
    expect(MIN_TERM_LENGTH).toBe(3)
    expect(buildSearchTerms("機")).toBeNull()
    expect(buildSearchTerms("機能")).toBeNull()
    expect(buildSearchTerms("sprint 3")).toBeNull()
    expect(buildSearchTerms("ab")).toBeNull()
    expect(buildSearchTerms("abc")).toEqual(["abc"])
  })

  it("counts code points, not UTF-16 units", () => {
    expect(buildSearchTerms("𠮷")).toBeNull()
    expect(buildSearchTerms("𠮷野")).toBeNull()
    expect(buildSearchTerms("𠮷野家")).toEqual(["𠮷野家"])
  })

  it("returns null for input with no word characters", () => {
    expect(buildSearchTerms("")).toBeNull()
    expect(buildSearchTerms(' +-*"() ')).toBeNull()
  })

  it("honours a custom minimum term length", () => {
    expect(buildSearchTerms("ab cd", 3)).toBeNull()
    expect(buildSearchTerms("abc", 3)).toEqual(["abc"])
    expect(buildSearchTerms("ab", 2)).toEqual(["ab"])
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

describe("isMissingTrigramSupport", () => {
  it("detects PostgreSQL 42883 (pg_trgm not installed) through the driver-adapter error of a P2010", () => {
    const err = Object.assign(new Error("Raw query failed. Code: `42883`. Message: `function word_similarity(unknown, text) does not exist`"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { kind: "postgres", code: "42883", originalCode: "42883" } } },
    })
    expect(isMissingTrigramSupport(err)).toBe(true)
  })

  it("detects a bare driver error by code or message", () => {
    expect(isMissingTrigramSupport(Object.assign(new Error("function word_similarity(text, text) does not exist"), { code: "42883" }))).toBe(true)
    expect(isMissingTrigramSupport(new Error("function similarity(text, unknown) does not exist"))).toBe(true)
  })

  it("ignores other errors, including other undefined functions", () => {
    expect(isMissingTrigramSupport(Object.assign(new Error("function foo(text) does not exist"), { code: "42883" }))).toBe(false)
    expect(isMissingTrigramSupport(new Error('relation "x" does not exist'))).toBe(false)
    expect(isMissingTrigramSupport(Object.assign(new Error("dup"), { meta: { driverAdapterError: { cause: { code: "23505" } } } }))).toBe(false)
    expect(isMissingTrigramSupport(null)).toBe(false)
    expect(isMissingTrigramSupport("42883")).toBe(false)
  })
})
