// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import {
  LAST_LANGUAGE_COOKIE,
  isLanguage,
  lastLanguageCookie,
  loginLanguageToPersist,
  parseAcceptLanguage,
  rememberLastLanguage,
  resolveAnonymousLanguage,
} from "../last-language"

describe("parseAcceptLanguage", () => {
  it.each([
    ["id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7", "id"],
    ["en-US,en;q=0.9", "en"],
    ["ja", "ja"],
    ["fr-FR,fr;q=0.9,en;q=0.5,ja;q=0.8", "ja"],
    ["de, EN-gb;q=0.4", "en"],
  ])("%s → %s", (header, expected) => {
    expect(parseAcceptLanguage(header)).toBe(expected)
  })

  it("returns null when nothing is supported, the header is empty or q=0", () => {
    expect(parseAcceptLanguage("fr,de;q=0.8")).toBeNull()
    expect(parseAcceptLanguage("")).toBeNull()
    expect(parseAcceptLanguage(null)).toBeNull()
    expect(parseAcceptLanguage("en;q=0")).toBeNull()
  })
})

describe("resolveAnonymousLanguage", () => {
  it("prefers the last-used cookie over Accept-Language", () => {
    expect(resolveAnonymousLanguage("id", "en-US")).toBe("id")
  })

  it("falls back to Accept-Language, then ja; ignores a bogus cookie", () => {
    expect(resolveAnonymousLanguage(undefined, "en-US,en;q=0.9")).toBe("en")
    expect(resolveAnonymousLanguage("xx", "id")).toBe("id")
    expect(resolveAnonymousLanguage(undefined, "fr")).toBe("ja")
  })
})

describe("loginLanguageToPersist", () => {
  it("persists only an explicit choice on the login page", () => {
    expect(loginLanguageToPersist("ja", false)).toBeNull()
    expect(loginLanguageToPersist("id", false)).toBeNull()
    expect(loginLanguageToPersist("en", true)).toBe("en")
  })
})

describe("last-language cookie", () => {
  afterEach(() => {
    document.cookie = `${LAST_LANGUAGE_COOKIE}=; Path=/; Max-Age=0`
  })

  it("builds a long-lived lax cookie for the whole site", () => {
    expect(lastLanguageCookie("id")).toBe(`${LAST_LANGUAGE_COOKIE}=id; Path=/; Max-Age=31536000; SameSite=Lax`)
  })

  it("rememberLastLanguage writes it in the browser", () => {
    rememberLastLanguage("en")
    expect(document.cookie).toContain(`${LAST_LANGUAGE_COOKIE}=en`)
  })

  it("isLanguage accepts only ja / en / id", () => {
    expect(isLanguage("ja")).toBe(true)
    expect(isLanguage("id")).toBe(true)
    expect(isLanguage("fr")).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
  })
})
