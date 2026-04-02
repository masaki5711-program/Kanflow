"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { type Language, type Translations, getTranslations } from "./i18n"
import { type ProjectType, type ProjectTypeLabels, getProjectTypeLabels } from "./project-type-labels"

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
  const t = getTranslations(language)
  const pt = getProjectTypeLabels(projectType, language)

  useEffect(() => {
    setLanguageState(initialLanguage)
  }, [initialLanguage])

  useEffect(() => {
    setProjectTypeState(initialProjectType)
  }, [initialProjectType])

  const setLanguageLocal = useCallback((lang: Language) => {
    setLanguageState(lang)
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    if (persistToUser) {
      fetch("/api/user/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
      }).catch(() => {})
    }
  }, [persistToUser])

  const setProjectType = useCallback((type: ProjectType) => {
    setProjectTypeState(type)
  }, [])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, setLanguageLocal, t, projectType, setProjectType, pt }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
