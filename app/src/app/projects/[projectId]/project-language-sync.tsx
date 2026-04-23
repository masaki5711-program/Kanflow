"use client"

import { useEffect, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { type ProjectType } from "@/lib/project-type-labels"

export function ProjectLanguageSync({
  children,
  projectType,
}: {
  children: ReactNode
  projectType: ProjectType
}) {
  const { setProjectType } = useLanguage()

  useEffect(() => {
    setProjectType(projectType)
  }, [projectType, setProjectType])

  return <>{children}</>
}
