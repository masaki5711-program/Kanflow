"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useI18nText, type EntityI18n } from "@/components/i18n-text"
import { useDocumentTitle } from "@/hooks/use-document-title"

interface ProjectTitleValue {
  projectName: string | null
  projectI18n: EntityI18n | null
}

const ProjectTitleContext = createContext<ProjectTitleValue>({ projectName: null, projectI18n: null })

/** Provides the current project's name to the pages below (for document titles). */
export function ProjectTitleProvider({
  projectName,
  projectI18n,
  children,
}: {
  projectName?: string | null
  projectI18n?: EntityI18n | null
  children: ReactNode
}) {
  return (
    <ProjectTitleContext.Provider value={{ projectName: projectName ?? null, projectI18n: projectI18n ?? null }}>
      {children}
    </ProjectTitleContext.Provider>
  )
}

/** Localized name of the current project ("" outside a project). */
export function useProjectName(): string {
  const { projectName, projectI18n } = useContext(ProjectTitleContext)
  return useI18nText(projectI18n, "name", projectName).text
}

/**
 * Set the document title of a project page: "<Page> · <Project> · Kanflow".
 * Outside a project it degrades to "<Page> · Kanflow".
 */
export function useProjectDocumentTitle(pageTitle: string | null | undefined): string {
  const projectName = useProjectName()
  return useDocumentTitle([pageTitle, projectName])
}
