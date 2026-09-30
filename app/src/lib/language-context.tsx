"use client"

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react"
import { type Language, type Translations, getTranslations } from "./i18n"
import { type ProjectType, type ProjectTypeLabels, getProjectTypeLabels } from "./project-type-labels"
import { apiFetch } from "@/hooks/api-client"
import { rememberLastLanguage } from "./last-language"

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
      // The next login page starts in the language the user chose last.
      rememberLastLanguage(lang)
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

/**
 * Project-type labels for one project's pages (C3-01). The type comes from the
 * server (project layout), so the server HTML and every hydration pass render
 * the same `pt` labels from the first paint. It used to be pushed into the
 * root provider from an effect after hydration, i.e. a context change that
 * could reach a page boundary still waiting to hydrate. `setProjectType`
 * (settings page) changes the scope until the server prop changes.
 */
export function ProjectTypeScope({ projectType, children }: { projectType: ProjectType; children: ReactNode }) {
  const { language, setLanguage, setLanguageLocal, t } = useContext(LanguageContext)
  const [local, setLocal] = useState({ from: projectType, value: projectType })
  let current = local
  if (local.from !== projectType) {
    current = { from: projectType, value: projectType }
    setLocal(current)
  }
  const activeType = current.value
  const setProjectType = useCallback((type: ProjectType) => setLocal((prev) => ({ ...prev, value: type })), [])
  const value = useMemo(
    () => ({ language, setLanguage, setLanguageLocal, t, projectType: activeType, setProjectType, pt: getProjectTypeLabels(activeType, language) }),
    [language, setLanguage, setLanguageLocal, t, activeType, setProjectType],
  )
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
