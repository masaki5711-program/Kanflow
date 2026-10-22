"use client"

import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { formatLongDate } from "@/lib/format-date"
import { GitBranch, Tag, TriangleAlert } from "lucide-react"
import type { VersionGit } from "./use-release-git"
import { VersionReleaseNote } from "./version-release-note"

const LISTED = 4

interface Props {
  projectId: string
  version: string
  git: VersionGit
  onMarkReleased: (version: string) => void
  marking: boolean
}

/**
 * Git facts of one plan version under its header: the tag, how many planned
 * PBIs are really merged, what is still open, work merged without a plan,
 * the one-click "mark as released" and the version release note.
 */
export function VersionGitRow({ projectId, version, git, onMarkReleased, marking }: Props) {
  const { t, language } = useLanguage()
  const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""))
  const pendingList = git.pending.slice(0, LISTED).map((p) => `#${p.displayId}`).join(", ") + (git.pending.length > LISTED ? ` +${git.pending.length - LISTED}` : "")

  return (
    <div role="group" aria-label={t.releaseGitLabel} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border bg-info-soft/40 px-5 py-2 text-caption text-fg-muted">
      <span className="flex items-center gap-1.5">
        {git.tag ? <Tag aria-hidden className="h-3.5 w-3.5 text-success" /> : <GitBranch aria-hidden className="h-3.5 w-3.5" />}
        {git.tag ? (
          <a href={git.tag.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {fill(t.releaseGitTagged, { tag: git.tag.tag, date: formatLongDate(git.tag.releasedAt, language) })}
          </a>
        ) : (
          t.releaseGitUntagged
        )}
      </span>
      {git.planned > 0 && <span>{fill(t.releaseGitProgress, { merged: git.merged, planned: git.planned })}</span>}
      {git.pending.length > 0 && (
        <span className="flex items-center gap-1 text-warning" title={git.pending.map((p) => `#${p.displayId} ${p.title}`).join("\n")}>
          <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
          {fill(t.releaseGitPending, { list: pendingList })}
        </span>
      )}
      {git.unplanned.length > 0 && (
        <span className="text-warning" title={git.unplanned.map((u) => `#${u.displayId} ${u.title} (!${u.ref})`).join("\n")}>
          {fill(t.releaseGitUnplanned, { n: git.unplanned.length })}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {git.canRelease && (
          <Button size="sm" variant="secondary" loading={marking} onClick={() => onMarkReleased(version)}>
            {t.releaseGitMarkReleased}
          </Button>
        )}
        <VersionReleaseNote projectId={projectId} version={version} />
      </span>
    </div>
  )
}
