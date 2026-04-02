"use client"

import { useEffect, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { type Language } from "@/lib/i18n"
import { type ProjectType } from "@/lib/project-type-labels"

export function ProjectLanguageSync({
  children,
  language,
  projectType,
}: {
  children: ReactNode
  language: Language
  projectType: ProjectType
}) {
  const { setLanguageLocal, setProjectType } = useLanguage()

  useEffect(() => {
    setLanguageLocal(language)
  }, [language, setLanguageLocal])

  useEffect(() => {
    setProjectType(projectType)
  }, [projectType, setProjectType])

  return <>{children}</>
}
