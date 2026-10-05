"use client"

import Link from "next/link"
import { useState } from "react"
import { GitBranch, GitCommitHorizontal, GitPullRequest, ExternalLink, type LucideIcon } from "lucide-react"
import { Badge, EmptyState, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { pbiKey } from "@/lib/git/pbi-keys"
import { kindLabel, mrStateLabel, pipelineLabel, type GitOverviewDto } from "./git-labels"
import { GitTime } from "./repo-sync-status"

type Activity = GitOverviewDto["recent"][number]

const KIND_ICON: Record<string, LucideIcon> = { mr: GitPullRequest, branch: GitBranch, commit: GitCommitHorizontal }

const DOT_TONE: Record<string, string> = {
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-info",
  warning: "bg-warning",
  neutral: "bg-fg-subtle",
  primary: "bg-primary",
}

interface Props {
  projectId: string
  items: readonly Activity[]
}

/** The latest Git activity linked to PBIs, newest first. */
export function GitActivityList({ projectId, items }: Props) {
  const { t } = useLanguage()
  const [now] = useState(() => new Date())

  return (
    <section aria-labelledby="git-recent-heading" className="rounded-ui-md border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <h2 id="git-recent-heading" className="mb-3 text-title font-semibold text-fg">
        {t.gitPageRecent}
      </h2>
      {items.length === 0 ? (
        <EmptyState compact icon={<GitPullRequest className="h-6 w-6" />} title={t.gitPageRecentEmpty} description={t.gitPageRecentEmptyDesc} />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <ActivityRow key={item.id} projectId={projectId} item={item} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ActivityRow({ projectId, item, now }: { projectId: string; item: Activity; now: Date }) {
  const { t } = useLanguage()
  const Icon = KIND_ICON[item.kind] ?? GitCommitHorizontal
  const kind = kindLabel(item.kind, t)
  const state = item.kind === "mr" ? mrStateLabel(item.state, t) : null
  const pipeline = pipelineLabel(item.pipeline, t)
  const key = pbiKey(item.pbi.displayId)

  return (
    <li className="flex gap-3 py-3">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-fg-muted"
        title={kind}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sr-only">{kind}:</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 break-words text-body font-medium text-fg hover:text-primary hover:underline"
          >
            {item.title || item.ref}
            <ExternalLink aria-hidden="true" className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />
            <span className="sr-only"> ({t.gitOpenInGitLab})</span>
          </a>
          {state && <Badge tone={state.tone}>{state.label}</Badge>}
          {pipeline && (
            <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
              <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", DOT_TONE[pipeline.tone])} />
              {pipeline.label}
            </span>
          )}
        </div>
        <Link
          href={`/projects/${projectId}/backlog?pbi=${item.pbi.displayId}`}
          aria-label={`${fillTemplate(t.gitPageOpenPbi, { key })}: ${item.pbi.title}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-ui-sm bg-primary-soft px-2 py-0.5 text-caption text-primary-active hover:underline"
        >
          <span className="shrink-0 font-semibold">{key}</span>
          <span className="truncate">{item.pbi.title}</span>
        </Link>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-fg-muted">
          <span className="break-all">{item.repository.name}</span>
          {item.author && (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.author}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <GitTime iso={item.occurredAt} now={now} />
        </p>
      </div>
    </li>
  )
}
