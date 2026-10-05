import {
  CircleCheck,
  CircleHelp,
  CirclePause,
  CircleSlash,
  CircleX,
  Clock,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react"
import type { BadgeTone } from "@/components/ui"
import type { Translations } from "@/lib/i18n"
import type { GitLinkDto, PbiGitSummary } from "./git-client-state"

/** Pure display helpers of the Git development info (labels, tones, icons, grouping). */

export interface StatusInfo {
  tone: BadgeTone
  label: string
  Icon: LucideIcon
}

export const KIND_ICON: Record<string, LucideIcon> = { mr: GitPullRequest, branch: GitBranch, commit: GitCommitHorizontal }

/** GitLab "locked" is an MR in the middle of merging: still open for the user. */
export const isOpenMr = (state: string | null) => state === "opened" || state === "locked"

export function mrStateInfo(state: string | null, t: Translations): StatusInfo {
  if (state === "merged") return { tone: "success", label: t.gitDevMrMerged, Icon: GitMerge }
  if (state === "closed") return { tone: "neutral", label: t.gitDevMrClosed, Icon: GitPullRequestClosed }
  return { tone: "primary", label: t.gitDevMrOpened, Icon: GitPullRequest }
}

const WAITING = new Set(["pending", "created", "waiting_for_resource", "preparing", "scheduled"])

/** Pipeline status → tone / icon / label. Unknown statuses keep GitLab's word. */
export function pipelineInfo(status: string, t: Translations): StatusInfo {
  if (status === "success") return { tone: "success", label: t.gitDevPipelineSuccess, Icon: CircleCheck }
  if (status === "failed") return { tone: "danger", label: t.gitDevPipelineFailed, Icon: CircleX }
  if (status === "running") return { tone: "warning", label: t.gitDevPipelineRunning, Icon: LoaderCircle }
  if (WAITING.has(status)) return { tone: "warning", label: t.gitDevPipelinePending, Icon: Clock }
  if (status === "canceled") return { tone: "neutral", label: t.gitDevPipelineCanceled, Icon: CircleSlash }
  if (status === "skipped") return { tone: "neutral", label: t.gitDevPipelineSkipped, Icon: CircleSlash }
  if (status === "manual") return { tone: "neutral", label: t.gitDevPipelineManual, Icon: CirclePause }
  return { tone: "neutral", label: status, Icon: CircleHelp }
}

/** Text color per tone (icons and the card dot). */
export const TONE_TEXT: Record<BadgeTone, string> = {
  neutral: "text-fg-subtle",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
}

export const TONE_DOT: Record<BadgeTone, string> = {
  neutral: "bg-fg-subtle",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
}

export interface RepositoryGroup {
  repository: GitLinkDto["repository"]
  mrs: GitLinkDto[]
  branches: GitLinkDto[]
  commits: GitLinkDto[]
}

const MR_ORDER = (state: string | null) => (isOpenMr(state) ? 0 : state === "merged" ? 1 : 2)
const newestFirst = (a: GitLinkDto, b: GitLinkDto) => b.occurredAt.localeCompare(a.occurredAt)

/**
 * Links grouped by repository (most recently active repository first). Within
 * a group: open → merged → closed MRs, branches and commits newest first.
 */
export function groupByRepository(links: readonly GitLinkDto[]): RepositoryGroup[] {
  const sorted = [...links].sort(newestFirst)
  const order = [...new Map(sorted.map((l) => [l.repository.id, l.repository])).values()]
  return order.map((repository) => {
    const mine = sorted.filter((l) => l.repository.id === repository.id)
    return {
      repository,
      mrs: mine.filter((l) => l.kind === "mr").sort((a, b) => MR_ORDER(a.state) - MR_ORDER(b.state) || newestFirst(a, b)),
      branches: mine.filter((l) => l.kind === "branch"),
      commits: mine.filter((l) => l.kind === "commit"),
    }
  })
}

/** True when the card has something to show. */
export function hasGitActivity(s: PbiGitSummary | undefined): s is PbiGitSummary {
  return !!s && (s.openMrs > 0 || s.mergedMrs > 0 || s.branches > 0)
}

/** What the card badge shows first: open MRs, else "merged", else branches. */
export function badgeMain(s: PbiGitSummary): "open" | "merged" | "branches" {
  return s.openMrs > 0 ? "open" : s.mergedMrs > 0 ? "merged" : "branches"
}

/** Spoken / tooltip text of a card badge, e.g. 「マージリクエスト 2 件オープン、パイプライン: 失敗」. */
export function badgeLabel(s: PbiGitSummary, t: Translations): string {
  const main = badgeMain(s)
  const head =
    main === "open" ? t.gitDevBadgeOpenMrs.replace("{count}", String(s.openMrs))
      : main === "merged" ? t.gitDevBadgeMerged
        : t.gitDevBadgeBranches.replace("{count}", String(s.branches))
  const pipeline = s.pipeline ? t.gitDevPipeline.replace("{status}", pipelineInfo(s.pipeline, t).label) : null
  return pipeline ? `${head}${t.gitDevListSeparator}${pipeline}` : head
}
