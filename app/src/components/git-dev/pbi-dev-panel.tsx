"use client"

import { useId, useMemo } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, IconButton, cn } from "@/components/ui"
import { Copy, GitBranch, RefreshCw, Terminal } from "lucide-react"
import { groupByRepository } from "./git-format"
import { RepositoryLinks } from "./git-link-list"
import { useCopyText, useGitSync } from "./use-git-actions"
import { usePbiGitPanel } from "./use-pbi-git-panel"
import type { PbiGitPanelDto } from "./git-client-state"

interface Props {
  projectId: string
  pbiId: string
  className?: string
}

/**
 * The Jira-style 「開発」 panel of a PBI: its key, a suggested branch name and
 * the linked merge requests / branches / commits per repository. Renders
 * nothing while loading, on error and when the project has Git off.
 */
export function PbiDevPanel({ projectId, pbiId, className }: Props) {
  const { panel, refetch } = usePbiGitPanel(projectId, pbiId)
  if (!panel) return null
  return <PanelBody projectId={projectId} panel={panel} refetch={refetch} className={className} />
}

function PanelBody({ projectId, panel, refetch, className }: { projectId: string; panel: PbiGitPanelDto; refetch: () => void; className?: string }) {
  const { t } = useLanguage()
  const headingId = useId()
  const copy = useCopyText()
  const { syncing, sync } = useGitSync(projectId, refetch)
  const groups = useMemo(() => groupByRepository(panel.links ?? []), [panel.links])
  const key = panel.pbiKey ?? ""

  return (
    <section aria-labelledby={headingId} className={cn("space-y-3 rounded-ui-md border border-border p-3", className)} data-pbi-dev-panel="">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-body font-semibold text-fg">{t.gitDevTitle}</h3>
        {key && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-sunken pl-2 font-mono text-caption text-fg">
            {key}
            <IconButton size="sm" label={t.gitDevCopyKey.replace("{key}", key)} icon={<Copy className="h-3.5 w-3.5" />}
              className="h-7 w-7 rounded-full" onClick={() => void copy(key)} />
          </span>
        )}
        <Button size="sm" variant="secondary" className="ml-auto" loading={syncing} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={() => void sync()}>
          {t.gitDevSync}
        </Button>
      </div>

      {panel.branchSuggestion && <BranchHelper branch={panel.branchSuggestion} onCopy={copy} />}

      {!panel.hasRepositories ? (
        <p className="rounded-ui-sm bg-surface-muted px-2 py-1.5 text-caption text-fg-muted">{t.gitDevNoRepos}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-ui-sm bg-surface-muted px-2 py-1.5 text-caption">
          <p className="text-fg-muted">{t.gitDevEmpty}</p>
          <p className="mt-0.5 text-fg-subtle">{t.gitDevEmptyHint.replace("{key}", key)}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => <RepositoryLinks key={g.repository.id} group={g} />)}
        </div>
      )}
    </section>
  )
}

/** Suggested branch name and the `git switch -c` command, each with a copy button. */
function BranchHelper({ branch, onCopy }: { branch: string; onCopy: (text: string) => Promise<boolean> }) {
  const { t } = useLanguage()
  const command = `git switch -c ${branch}`
  return (
    <div className="space-y-1">
      <p className="text-caption font-medium text-fg-muted">{t.gitDevBranchLabel}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="inline-flex min-w-0 max-w-full items-center gap-1.5 break-all rounded-ui-sm bg-surface-muted px-2 py-1 font-mono text-caption text-fg">
          <GitBranch aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          {branch}
        </code>
        <Button size="sm" variant="ghost" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => void onCopy(branch)}>
          {t.gitDevCopyBranch}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="inline-flex min-w-0 max-w-full items-center gap-1.5 break-all rounded-ui-sm bg-surface-muted px-2 py-1 font-mono text-caption text-fg">
          <Terminal aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          {command}
        </code>
        <IconButton size="sm" label={t.gitDevCopyCommand} icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void onCopy(command)} />
      </div>
    </div>
  )
}
