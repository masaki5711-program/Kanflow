"use client"

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { formatDateTime, formatRelative } from "@/lib/format-date"
import type { GitRepositoryDto } from "./git-labels"

/** Relative time with the absolute date-time as tooltip. */
export function GitTime({ iso, now }: { iso: string; now: Date }) {
  const { language } = useLanguage()
  return (
    <time dateTime={iso} title={formatDateTime(iso, language)}>
      {formatRelative(iso, now, language)}
    </time>
  )
}

/**
 * One line of repository health: the last error (red, with when it happened)
 * wins over the last successful sync; a never-synced repository says so.
 */
export function RepoSyncStatus({ repo, now }: { repo: Pick<GitRepositoryDto, "syncedAt" | "lastError" | "lastErrorAt">; now: Date }) {
  const { t } = useLanguage()
  if (repo.lastError) {
    const [before, after] = t.gitStatusError.split("{time}")
    return (
      <div className="flex min-w-0 items-start gap-1.5 text-caption text-danger">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="min-w-0 break-words">
          <span className="font-medium">
            {before}
            {repo.lastErrorAt ? <GitTime iso={repo.lastErrorAt} now={now} /> : "—"}
            {after}
          </span>{" "}
          {repo.lastError}
        </p>
      </div>
    )
  }
  if (!repo.syncedAt) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-fg-muted">
        <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {t.gitStatusNever}
      </p>
    )
  }
  const [before, after] = t.gitStatusSynced.split("{time}")
  return (
    <p className="flex items-center gap-1.5 text-caption text-fg-muted">
      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success" />
      <span>
        {before}
        <GitTime iso={repo.syncedAt} now={now} />
        {after}
      </span>
    </p>
  )
}
