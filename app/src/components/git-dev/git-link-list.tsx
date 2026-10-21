"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { formatDateTime, formatRelative } from "@/lib/format-date"
import { Badge, Button, cn } from "@/components/ui"
import { isOpenMr, KIND_ICON, mrStateInfo, pipelineInfo, TONE_TEXT, type RepositoryGroup } from "./git-format"
import type { GitLinkDto } from "./git-client-state"

/** Commits shown per repository before 「さらに表示」. */
export const COMMITS_SHOWN = 5

/** Pipeline icon + text (color is never the only signal). */
export function PipelineStatus({ status }: { status: string }) {
  const { t } = useLanguage()
  const info = pipelineInfo(status, t)
  return (
    <span className="inline-flex items-center gap-1 text-caption text-fg-muted" data-git-pipeline={status}>
      <info.Icon aria-hidden="true" className={cn("h-3.5 w-3.5", TONE_TEXT[info.tone], status === "running" && "motion-safe:animate-spin")} />
      {t.gitDevPipeline.replace("{status}", info.label)}
    </span>
  )
}

function Meta({ link }: { link: GitLinkDto }) {
  const { language } = useLanguage()
  return (
    <>
      {link.author && <span className="truncate">{link.author}</span>}
      <time dateTime={link.occurredAt} title={formatDateTime(link.occurredAt, language)} className="whitespace-nowrap">
        {formatRelative(link.occurredAt, new Date(), language)}
      </time>
    </>
  )
}

/** One MR / branch / commit: kind icon, link to GitLab (new tab), state, pipeline, author, time. */
function LinkRow({ link }: { link: GitLinkDto }) {
  const { t } = useLanguage()
  const Icon = KIND_ICON[link.kind] ?? KIND_ICON.commit
  const mr = link.kind === "mr" ? mrStateInfo(link.state, t) : null
  const text =
    link.kind === "mr" ? `!${link.ref} ${link.title}`
      : link.kind === "branch" ? link.ref
        : `${link.ref.slice(0, 8)} ${link.title}`
  return (
    <li data-git-link={link.kind}
      className={cn(
        "flex items-start gap-2 rounded-ui-sm px-2 py-1.5",
        link.kind === "mr" && isOpenMr(link.state) ? "bg-primary-soft ring-1 ring-primary/20" : "bg-surface-muted",
      )}>
      <Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", mr ? TONE_TEXT[mr.tone] : "text-fg-subtle")} />
      <div className="min-w-0 flex-1">
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          aria-label={t.gitDevOpenInGitLab.replace("{title}", text)}
          className={cn("block break-words text-body text-fg hover:text-primary-strong hover:underline", link.kind === "branch" && "font-mono")}>
          {link.kind === "commit" && <span className="mr-1 font-mono text-fg-muted">{link.ref.slice(0, 8)}</span>}
          {link.kind === "mr" && <span className="mr-1 font-mono text-fg-muted">!{link.ref}</span>}
          {link.kind === "branch" ? link.ref : link.title}
        </a>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-fg-muted">
          {mr && <Badge tone={mr.tone} size="sm">{mr.label}</Badge>}
          {link.kind === "mr" && link.sourceBranch && <span className="max-w-full truncate font-mono" title={link.sourceBranch}>{link.sourceBranch}</span>}
          {link.pipeline && <PipelineStatus status={link.pipeline} />}
          {link.kind === "branch" && link.title && link.title !== link.ref && <span className="truncate">{link.title}</span>}
          <Meta link={link} />
        </div>
      </div>
    </li>
  )
}

function KindList({ title, links, total = links.length }: { title: string; links: readonly GitLinkDto[]; total?: number }) {
  if (links.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-caption font-medium text-fg-muted">{title}<span className="ml-1 font-normal">({total})</span></p>
      <ul className="space-y-1">
        {links.map((l) => <LinkRow key={l.id} link={l} />)}
      </ul>
    </div>
  )
}

/** One repository: merge requests, then branches, then the latest commits. */
export function RepositoryLinks({ group }: { group: RepositoryGroup }) {
  const { t } = useLanguage()
  const [allCommits, setAllCommits] = useState(false)
  const hidden = allCommits ? 0 : Math.max(0, group.commits.length - COMMITS_SHOWN)
  const commits = hidden > 0 ? group.commits.slice(0, COMMITS_SHOWN) : group.commits
  return (
    <div className="space-y-2" data-git-repository={group.repository.name}>
      <h4 className="text-caption font-semibold text-fg">{group.repository.name}</h4>
      <KindList title={t.gitDevSectionMrs} links={group.mrs} />
      <KindList title={t.gitDevSectionBranches} links={group.branches} />
      {group.commits.length > 0 && (
        <div className="space-y-1">
          <KindList title={t.gitDevSectionCommits} links={commits} total={group.commits.length} />
          {hidden > 0 && (
            <Button variant="link" size="sm" onClick={() => setAllCommits(true)}>
              {t.gitDevShowMore.replace("{count}", String(hidden))}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
