"use client"

import { AlertTriangle, BookOpen, Clock, Loader2, RefreshCw } from "lucide-react"
import { Button, useToast } from "@/components/ui"
import { apiFetch, isApiError, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import type { GitRepositoryDto } from "./git-labels"
import { GitTime } from "./repo-sync-status"

type KnowledgeFields = Pick<GitRepositoryDto, "aiKnowledge" | "indexedAt" | "indexedFiles" | "indexError" | "indexErrorAt" | "indexing" | "indexPending">

/**
 * One line of "AI の参照資料" health: importing now > last error (red) >
 * waiting to import > indexed files and time. Nothing for a repository that
 * is not used as AI reference material.
 */
export function RepoKnowledgeStatus({ repo, now }: { repo: KnowledgeFields; now: Date }) {
  const { t } = useLanguage()
  if (!repo.aiKnowledge) return null
  if (repo.indexing) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-info" role="status">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        {t.gitKbStatusIndexing}
      </p>
    )
  }
  if (repo.indexError) {
    const [before, after] = t.gitKbStatusError.split("{time}")
    return (
      <div className="flex min-w-0 items-start gap-1.5 text-caption text-danger">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="min-w-0 break-words">
          <span className="font-medium">
            {before}
            {repo.indexErrorAt ? <GitTime iso={repo.indexErrorAt} now={now} /> : "—"}
            {after}
          </span>{" "}
          {repo.indexError}
        </p>
      </div>
    )
  }
  if (repo.indexPending || !repo.indexedAt) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-fg-muted">
        <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {t.gitKbStatusPending}
      </p>
    )
  }
  const [before, after] = fillTemplate(t.gitKbStatusIndexed, { n: repo.indexedFiles }).split("{time}")
  return (
    <p className="flex items-center gap-1.5 text-caption text-fg-muted">
      <BookOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span>
        {before}
        <GitTime iso={repo.indexedAt} now={now} />
        {after}
      </span>
    </p>
  )
}

interface ReindexProps {
  projectId: string
  repo: Pick<GitRepositoryDto, "id" | "name" | "indexing">
  /** Reload after the run started (the status turns into "取り込み中…"). */
  onStarted: () => void
}

/** 今すぐ取り込む (any member, "git.sync"): starts a background run; the page updates live when it ends. */
export function RepoReindexButton({ projectId, repo, onStarted }: ReindexProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const run = useApiMutation(() => apiFetch(`/api/projects/${projectId}/git/repositories/${repo.id}/index`, { method: "POST" }), {
    onSuccess: () => {
      toast.success(t.gitKbReindexStarted)
      onStarted()
    },
    onError: (e) => {
      // 429: someone ran it seconds ago; 409: another repository is being imported — both just mean "wait".
      if (isApiError(e) && e.status === 429) toast.info(t.gitKbReindexTooSoon)
      else if (isApiError(e) && e.status === 409) toast.info(t.gitKbReindexBusy)
      else toast.error(t.gitKbReindexFailed)
    },
  })
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={run.isPending}
      disabled={repo.indexing}
      aria-label={fillTemplate(t.gitKbReindexOf, { name: repo.name })}
      leftIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
      onClick={() => void run.mutate(undefined)}
    >
      {t.gitKbReindex}
    </Button>
  )
}
