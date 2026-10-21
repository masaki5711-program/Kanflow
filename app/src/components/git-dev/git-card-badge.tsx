"use client"

import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import { GitBranch, GitMerge, GitPullRequest } from "lucide-react"
import { badgeLabel, badgeMain, hasGitActivity, pipelineInfo, TONE_DOT } from "./git-format"
import type { PbiGitSummary } from "./git-client-state"

interface Props {
  /** Undefined (no links / integration off) → renders nothing. */
  summary: PbiGitSummary | undefined
  className?: string
}

/**
 * Compact Git badge for a task / PBI card: open MR count (or "merged", or
 * the branch count) plus a pipeline dot. The full text is in the tooltip and
 * for screen readers; color is never the only signal.
 */
export function GitCardBadge({ summary, className }: Props) {
  const { t } = useLanguage()
  if (!hasGitActivity(summary)) return null
  const label = badgeLabel(summary, t)
  const main = badgeMain(summary)
  const pipeline = summary.pipeline ? pipelineInfo(summary.pipeline, t) : null
  const short =
    main === "open" ? t.gitDevBadgeShortOpen.replace("{count}", String(summary.openMrs))
      : main === "merged" ? t.gitDevBadgeShortMerged
        : t.gitDevBadgeShortBranches.replace("{count}", String(summary.branches))

  return (
    <span title={label} data-git-badge={main}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-caption font-medium",
        main === "open" ? "bg-primary-soft text-primary-active" : main === "merged" ? "bg-success-soft text-success-hover" : "bg-surface-sunken text-fg-muted",
        className,
      )}>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {main === "open" && <GitPullRequest className="h-3.5 w-3.5" />}
        {main === "merged" && <GitMerge className="h-3.5 w-3.5" />}
        {main === "branches" && <GitBranch className="h-3.5 w-3.5" />}
        {short}
        {pipeline && <span className={cn("h-2 w-2 rounded-full", TONE_DOT[pipeline.tone])} />}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
