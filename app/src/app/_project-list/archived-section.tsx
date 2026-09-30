"use client"

import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { Button, EmptyState, SkeletonCard, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { Project } from "./types"

/** GET /api/projects/archived body. */
export interface ArchivedProjectsResponse {
  items: Project[]
}

export const ARCHIVED_PROJECTS_URL = "/api/projects/archived"

interface Props {
  count: number
  expanded: boolean
  onToggle: () => void
  projects: Project[] | undefined
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  renderItem: (project: Project) => ReactNode
}

/**
 * Collapsed "archived" section of the project list. The page only knows the
 * count; the projects themselves are fetched the first time it is expanded.
 */
export function ArchivedSection({ count, expanded, onToggle, projects, isLoading, error, onRetry, renderItem }: Props) {
  const { t } = useLanguage()
  if (count === 0) return null

  return (
    <section className="mt-8 border-t border-border pt-6" aria-label={t.projectArchivedSection}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="archived-projects"
        className="flex items-center gap-2 rounded-md text-body text-fg-muted transition-colors hover:text-fg"
      >
        <ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
        {t.sprintStatusArchived} ({count})
      </button>
      {expanded && (
        <div id="archived-projects" className="mt-4 grid gap-4" aria-busy={isLoading || undefined}>
          {isLoading ? (
            <SkeletonCard label={t.loading} />
          ) : error && !projects ? (
            <EmptyState
              compact
              headingLevel={3}
              title={t.topArchivedLoadFailed}
              description={error.message}
              action={<Button variant="secondary" size="sm" onClick={onRetry}>{t.topRetry}</Button>}
            />
          ) : (
            (projects ?? []).map((project) => (
              <div key={project.id} className="opacity-70">
                {renderItem(project)}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
