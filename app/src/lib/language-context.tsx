"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { type Language, type Translations, getTranslations } from "./i18n"
import { type ProjectType, type ProjectTypeLabels, getProjectTypeLabels } from "./project-type-labels"
import { apiFetch } from "@/hooks/api-client"

interface LanguageContextValue {
  language: Language
  /** Sets language and persists to user DB if persistToUser is enabled */
  setLanguage: (lang: Language) => void
  /** Sets language locally only (no DB save) — used for project-level override */
  setLanguageLocal: (lang: Language) => void
  t: Translations
  projectType: ProjectType
  setProjectType: (type: ProjectType) => void
  pt: ProjectTypeLabels
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "ja",
  setLanguage: () => {},
  setLanguageLocal: () => {},
  t: getTranslations("ja"),
  projectType: "software",
  setProjectType: () => {},
  pt: getProjectTypeLabels("software", "ja"),
})

export function LanguageProvider({
  children,
  initialLanguage = "ja",
  initialProjectType = "software",
  persistToUser = false,
}: {
  children: ReactNode
  initialLanguage?: Language
  initialProjectType?: ProjectType
  persistToUser?: boolean
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)
  const [projectType, setProjectTypeState] = useState<ProjectType>(initialProjectType)
  // Re-sync only when the prop actually changes. A mount-time effect would run
  // AFTER children's effects (e.g. ProjectLanguageSync) and reset their value
  // on a hard page load.
  const [prevInitialProjectType, setPrevInitialProjectType] = useState(initialProjectType)
  if (prevInitialProjectType !== initialProjectType) {
    setPrevInitialProjectType(initialProjectType)
    setProjectTypeState(initialProjectType)
  }
  const t = getTranslations(language)
  const pt = getProjectTypeLabels(projectType, language)

  useEffect(() => {
    setLanguageState(initialLanguage)
  }, [initialLanguage])

  // <html lang> follows the active language (user switch, project override,
  // login switch) so screen readers pick the right voice (WCAG 3.1.1).
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = language
  }, [language])

  const setLanguageLocal = useCallback((lang: Language) => {
    setLanguageState(lang)
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    if (persistToUser) {
      // Best-effort: the UI already switched; a failed save must not surface.
      apiFetch("/api/user/language", { method: "PATCH", json: { language: lang } }).catch(() => {})
    }
  }, [persistToUser])

  const setProjectType = useCallback((type: ProjectType) => {
    setProjectTypeState(type)
  }, [])

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, setLanguageLocal, t, projectType, setProjectType, pt }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
