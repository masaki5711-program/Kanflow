import { describe, expect, it } from "vitest"
import { getTranslations, type Language } from "@/lib/i18n"

const LANGUAGES: Language[] = ["ja", "en", "id"]

describe("app-shell texts", () => {
  it.each(LANGUAGES)("chat subtitle no longer says the history resets (P-08, %s)", (lang) => {
    const t = getTranslations(lang)
    expect(t.chatContextNote).not.toMatch(/リセット|resets|terhapus/)
    // Points to the persisted chat history by its visible name.
    expect(t.chatContextNote).toContain(t.chatThreadsTitle)
  })

  it.each(LANGUAGES)("API help text no longer points to a repository file (P-09, %s)", (lang) => {
    expect(getTranslations(lang).apiTokenDocsLink).not.toContain("docs/")
  })

  it.each(LANGUAGES)("403 view texts exist (%s)", (lang) => {
    const t = getTranslations(lang)
    expect(t.forbiddenTitle.length).toBeGreaterThan(0)
    expect(t.forbiddenMessage.length).toBeGreaterThan(0)
  })
})
