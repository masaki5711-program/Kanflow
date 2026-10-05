"use client"

import { createContext, useContext, type ReactNode } from "react"
import { GitCardBadge } from "./git-card-badge"
import { useGitSummaries } from "./use-git-summaries"
import type { PbiGitSummary } from "./git-client-state"

const GitSummariesContext = createContext<Record<string, PbiGitSummary> | null>(null)

interface ProviderProps {
  projectId: string
  /** PBIs listed under this provider (one summary request for all of them). */
  pbiIds: readonly string[]
  children: ReactNode
}

/**
 * Git card badges for a list (sprint board, backlog): one request for every
 * PBI shown; cards render `GitPbiBadge`, which reads this context — so the
 * memoized cards need no new props and nothing renders when the integration is off.
 */
export function GitSummariesProvider({ projectId, pbiIds, children }: ProviderProps) {
  const { summaries } = useGitSummaries(projectId, pbiIds)
  return <GitSummariesContext.Provider value={summaries}>{children}</GitSummariesContext.Provider>
}

/** Badge of one PBI (nothing outside a provider, without links or with the integration off). */
export function GitPbiBadge({ pbiId, className }: { pbiId: string; className?: string }) {
  const summaries = useContext(GitSummariesContext)
  return <GitCardBadge summary={summaries?.[pbiId]} className={className} />
}
