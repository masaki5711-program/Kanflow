"use client"

import { useEffect } from "react"
import type { Language } from "@/lib/i18n"
import { rememberLastLanguage } from "@/lib/last-language"

/**
 * Signed-in pages: keep the "last used language" cookie in sync with the
 * user's saved language, so the next login page starts in it.
 */
export function RememberLanguage({ language }: { language: Language }) {
  useEffect(() => {
    rememberLastLanguage(language)
  }, [language])
  return null
}
