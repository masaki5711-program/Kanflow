"use client"

import { type ReactNode } from "react"
import { ProjectTypeScope } from "@/lib/language-context"
import { type ProjectType } from "@/lib/project-type-labels"

/**
 * Project-type labels (PB / Sprint wording) for everything inside a project.
 * Rendered synchronously from the server's value — no post-hydration effect —
 * so server HTML and client hydration agree (C3-01).
 */
export function ProjectLanguageSync({ children, projectType }: { children: ReactNode; projectType: ProjectType }) {
  return <ProjectTypeScope projectType={projectType}>{children}</ProjectTypeScope>
}
