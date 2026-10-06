"use client"

import Link from "next/link"
import { useState } from "react"
import { ExternalLink, FolderGit2, RefreshCw } from "lucide-react"
import { Button, EmptyState, buttonClasses, useToast } from "@/components/ui"
import { apiFetch, isApiError, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { pollMinutes, type GitRepositoryDto } from "./git-labels"
import { RepoSyncStatus } from "./repo-sync-status"
import { RepoKnowledgeStatus, RepoReindexButton } from "./repo-knowledge-status"

interface SyncResponse {
  results: Array<{ repositoryId: string; ok: boolean; links: number; error?: string }>
}

interface Props {
  projectId: string
  repositories: readonly GitRepositoryDto[]
  pollIntervalSec: number
  /** Link to the settings section, or null for viewers who cannot configure. */
  settingsHref: string | null
  /** Reload the overview (after a sync, or when the integration turned out to be off). */
  onSynced: () => void
}

/** Repository health cards with 今すぐ同期 and the automatic sync interval. */
export function GitRepoStatus({ projectId, repositories, pollIntervalSec, settingsHref, onSynced }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [now, setNow] = useState(() => new Date())

  const sync = useApiMutation(() => apiFetch<SyncResponse>(`/api/projects/${projectId}/git/sync`, { method: "POST" }), {
    onSuccess: (r) => {
      const results = Array.isArray(r?.results) ? r.results : []
      if (results.some((x) => !x.ok)) toast.error(t.gitPageSyncPartial)
      else toast.success(fillTemplate(t.gitPageSyncDone, { n: results.reduce((sum, x) => sum + (x.links ?? 0), 0) }))
      setNow(new Date())
      onSynced()
    },
    onError: (e) => {
      // 429: someone synced seconds ago — not a failure, just wait. 409: the integration was switched off meanwhile.
      if (isApiError(e) && e.status === 429) toast.info(t.gitPageSyncTooSoon)
      else toast.error(t.gitPageSyncFailed)
      if (isApiError(e) && e.status === 409) onSynced()
    },
  })

  return (
    <section aria-labelledby="git-repos-heading" className="rounded-ui-md border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="git-repos-heading" className="text-title font-semibold text-fg">
            {t.gitPageRepos}
          </h2>
          <p className="text-caption text-fg-muted">{fillTemplate(t.gitPageAutoSync, { n: pollMinutes(pollIntervalSec) })}</p>
        </div>
        {repositories.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            loading={sync.isPending}
            leftIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
            onClick={() => void sync.mutate(undefined)}
          >
            {t.gitPageSyncNow}
          </Button>
        )}
      </div>

      {repositories.length === 0 ? (
        <EmptyState
          compact
          icon={<FolderGit2 className="h-6 w-6" />}
          title={t.gitPageNoRepos}
          description={settingsHref ? t.gitPageNoReposDesc : undefined}
          action={
            settingsHref && (
              <Link href={settingsHref} className={buttonClasses({ variant: "primary", size: "sm" })}>
                {t.gitPageOpenSettings}
              </Link>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {repositories.map((repo) => (
            <li key={repo.id} className="min-w-0 space-y-1 rounded-ui-md border border-border bg-surface-muted p-3">
              <a
                href={repo.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-body font-medium text-fg hover:text-primary hover:underline"
              >
                <span className="break-words">{repo.name}</span>
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="sr-only">{t.gitOpenInGitLab}</span>
              </a>
              <p className="break-all text-caption text-fg-muted">{repo.repoPath}</p>
              <RepoSyncStatus repo={repo} now={now} />
              {repo.aiKnowledge && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <RepoKnowledgeStatus repo={repo} now={now} />
                  <RepoReindexButton projectId={projectId} repo={repo} onStarted={onSynced} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
