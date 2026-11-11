"use client"

import { useId } from "react"
import { CircleCheck, CircleHelp, CircleSlash, GitCompareArrows } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { formatDateTime, formatRelative } from "@/lib/format-date"
import { Badge } from "@/components/ui"
import type { GitMergeStateDto } from "./git-client-state"
import { blockerView, conflictView } from "./merge-state-model"

/**
 * N4 / N5: under an open GitStation merge request in the PBI's 開発 panel — what blocks the merge and who acts next,
 * then the predicted conflicts with other merge requests. Read by the sync (GitStation's status and trial merges),
 * so it is as current as the last sync (the time is shown). Everything is visible text: color and tooltips only
 * repeat it (a tooltip is out of reach for keyboard and touch).
 */
export function MergeState({ merge }: { merge: GitMergeStateDto }) {
  const { t, language } = useLanguage()
  const headingId = useId()
  const blockers = merge.blockers.map((b) => blockerView(b, t))
  const conflicts = conflictView(merge.conflicts, t)
  const ready = blockers.length === 0 && merge.mergeable === true
  return (
    <div className="mt-1.5 space-y-1 border-l-2 border-border pl-2" data-git-merge-state="">
      {blockers.length > 0 && (
        <div role="group" aria-labelledby={headingId}>
          <p id={headingId} className="text-caption font-medium text-fg">{t.gitMergeBlockedTitle}</p>
          <ul className="mt-0.5 space-y-0.5">
            {blockers.map((b, i) => (
              <li key={`${b.reason}-${i}`} data-git-blocker={b.reason} className="flex items-start gap-1.5 text-caption">
                <CircleSlash aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span className="min-w-0">
                  <span className="text-fg">{b.label}</span>
                  {b.fact && <span className="text-fg-muted">{t.gitMergeFact.replace("{fact}", b.fact)}</span>}
                  {b.unknown && b.detail && <span className="block break-all font-mono text-fg-muted">{b.detail}</span>}
                  {b.next && <span className="block text-fg-muted">{t.gitMergeNextPrefix}{b.next}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ready && (
        <p className="flex items-start gap-1.5 text-caption text-fg" data-git-merge-ready="">
          <CircleCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          {t.gitMergeReady}
        </p>
      )}
      {conflicts && (conflicts.peers.length > 0 || conflicts.note !== null) && (
        <div className="text-caption" data-git-conflicts={conflicts.peers.length}>
          <p className="flex items-start gap-1.5 font-medium text-fg">
            <GitCompareArrows aria-hidden="true" className={conflicts.peers.some((p) => !p.failed) ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" : "mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle"} />
            {t.gitConflictTitle}
          </p>
          {conflicts.peers.length > 0 && (
            <ul className="mt-0.5 flex flex-wrap gap-1">
              {conflicts.peers.map((p) => (
                <li key={p.iid} data-git-conflict-peer={p.iid} data-git-conflict-failed={p.failed ? "" : undefined}>
                  <Badge tone={p.failed ? "neutral" : "warning"} size="sm">
                    {p.failed && <CircleHelp aria-hidden="true" className="mr-1 inline h-3 w-3" />}
                    {p.text}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {conflicts.note === "none" && <p className="text-fg-muted">{t.gitConflictNone}</p>}
          {conflicts.note === "unchecked" && <p className="text-fg-muted">{t.gitConflictUnchecked}</p>}
          {conflicts.note === "partial" && <p className="text-fg-muted">{t.gitConflictPartial}</p>}
          {conflicts.stale && <p className="text-fg-muted">{t.gitConflictStale}</p>}
          <p className="text-fg-subtle">{t.gitConflictNote}</p>
        </div>
      )}
      <p className="text-caption text-fg-subtle">
        <time dateTime={merge.checkedAt} title={formatDateTime(merge.checkedAt, language)}>
          {t.gitMergeCheckedAt.replace("{time}", formatRelative(merge.checkedAt, new Date(), language))}
        </time>
      </p>
    </div>
  )
}
