import { describe, expect, it } from "vitest"
import { domains, getTranslations, type Language } from "@/lib/i18n"

const LANGS: Language[] = ["ja", "en", "id"]

/** Recursively collect "a.b.c" key paths (arrays are indexed). */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix]
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort()
}

/** Recursively collect key paths whose string value is empty/whitespace. */
function emptyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return value.trim() === "" ? [prefix] : []
  if (value === null || typeof value !== "object") return []
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([k, v]) => emptyPaths(v, prefix ? `${prefix}.${k}` : k))
}

describe("i18n dictionaries", () => {
  it.each(Object.entries(domains))("domain %s has identical key sets in ja/en/id", (_name, mod) => {
    const [ja, en, id] = [mod.ja, mod.en, mod.id].map((d) => keyPaths(d))
    expect(en).toEqual(ja)
    expect(id).toEqual(ja)
  })

  it("full ja/en/id dictionaries have identical key sets", () => {
    const ja = keyPaths(getTranslations("ja"))
    expect(keyPaths(getTranslations("en"))).toEqual(ja)
    expect(keyPaths(getTranslations("id"))).toEqual(ja)
  })

  it.each(LANGS)("%s has no empty strings", (lang) => {
    expect(emptyPaths(getTranslations(lang))).toEqual([])
  })

  it("no key is defined in more than one domain file", () => {
    const owners = new Map<string, string[]>()
    for (const [name, mod] of Object.entries(domains)) {
      for (const key of Object.keys(mod.ja)) {
        owners.set(key, [...(owners.get(key) ?? []), name])
      }
    }
    const dupes = [...owners.entries()].filter(([, files]) => files.length > 1)
    expect(dupes).toEqual([])
  })

  it("keeps the IceBox product term and offers an explanatory label", () => {
    for (const lang of LANGS) {
      expect(getTranslations(lang).iceboxDescription).toContain("IceBox")
    }
    expect(getTranslations("id").navBacklog).toBe("Backlog Produk")
  })
})
