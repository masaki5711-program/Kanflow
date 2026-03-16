"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { type Language, type Translations, getTranslations } from "./i18n"
import { type ProjectType, type ProjectTypeLabels, getProjectTypeLabels } from "./project-type-labels"

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translations
  projectType: ProjectType
  setProjectType: (type: ProjectType) => void
  pt: ProjectTypeLabels
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "ja",
  setLanguage: () => {},
  t: getTranslations("ja"),
  projectType: "software",
  setProjectType: () => {},
  pt: getProjectTypeLabels("software", "ja"),
})

export function LanguageProvider({
  children,
  initialLanguage = "ja",
  initialProjectType = "software",
}: {
  children: ReactNode
  initialLanguage?: Language
  initialProjectType?: ProjectType
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)
  const [projectType, setProjectTypeState] = useState<ProjectType>(initialProjectType)
  const t = getTranslations(language)
  const pt = getProjectTypeLabels(projectType, language)

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
  }, [])

  const setProjectType = useCallback((type: ProjectType) => {
    setProjectTypeState(type)
  }, [])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, projectType, setProjectType, pt }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
