"use client"

import { useState, type FormEvent } from "react"
import { ExternalLink, Pencil, Trash2 } from "lucide-react"
import { Badge, Button, Field, IconButton, Input, useConfirm } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { serverErrorText, type GitRepositoryDto } from "../git/git-labels"
import { RepoSyncStatus } from "../git/repo-sync-status"

interface Props {
  projectId: string
  repositories: readonly GitRepositoryDto[]
  canConfigure: boolean
  /** Reload the settings after a rename / removal. */
  onChanged: () => void
}

/** Registered repositories with their sync health; PO / SM / admin can rename and remove. */
export function GitRepositoryList({ projectId, repositories, canConfigure, onChanged }: Props) {
  const { t } = useLanguage()
  const [now] = useState(() => new Date())

  return (
    <div className="space-y-2">
      <h3 className="text-body font-semibold text-fg">
        {t.gitSetRepos}
        {repositories.length > 0 && <span className="ml-2 text-caption font-normal text-fg-muted">{repositories.length}</span>}
      </h3>
      {repositories.length === 0 ? (
        <p className="text-caption text-fg-muted">{canConfigure ? t.gitSetReposEmpty : t.gitPageNoRepos}</p>
      ) : (
        <ul className="divide-y divide-border rounded-ui-md border border-border">
          {repositories.map((repo) => (
            <RepositoryRow key={repo.id} projectId={projectId} repo={repo} now={now} canConfigure={canConfigure} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface RowProps {
  projectId: string
  repo: GitRepositoryDto
  now: Date
  canConfigure: boolean
  onChanged: () => void
}

function RepositoryRow({ projectId, repo, now, canConfigure, onChanged }: RowProps) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(repo.name)
  const url = `/api/projects/${projectId}/git/repositories/${repo.id}`

  const rename = useApiMutation((next: string) => apiFetch(url, { method: "PATCH", json: { name: next } }), {
    onSuccess: () => {
      setRenaming(false)
      onChanged()
    },
    toastOnSuccess: t.gitSetRepoRenamed,
    toastOnError: (e) => serverErrorText(e, t.gitSetRepoUpdateFailed),
  })
  const remove = useApiMutation(() => apiFetch(url, { method: "DELETE" }), {
    onSuccess: onChanged,
    toastOnSuccess: t.gitSetRepoRemoved,
    toastOnError: (e) => serverErrorText(e, t.gitSetRepoUpdateFailed),
  })

  function submitRename(e: FormEvent) {
    e.preventDefault()
    const next = name.trim()
    if (!next || rename.isPending) return
    if (next === repo.name) {
      setRenaming(false)
      return
    }
    void rename.mutate(next)
  }

  async function confirmRemove() {
    const ok = await confirm({
      title: fillTemplate(t.gitSetRepoRemoveTitle, { name: repo.name }),
      message: t.gitSetRepoRemoveMessage,
      confirmLabel: t.delete,
      variant: "danger",
    })
    if (ok) void remove.mutate(undefined)
  }

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        {renaming ? (
          <form onSubmit={submitRename} className="flex flex-wrap items-end gap-2">
            <Field label={t.gitSetRepoName} className="min-w-0 flex-1">
              <Input value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" size="sm" loading={rename.isPending} disabled={!name.trim()}>
              {t.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRenaming(false)
                setName(repo.name)
              }}
            >
              {t.cancel}
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-words text-body font-medium text-fg">{repo.name}</span>
            {repo.hasOwnToken && <Badge tone="info">{t.gitOwnToken}</Badge>}
          </div>
        )}
        <a
          href={repo.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-caption text-primary hover:underline"
        >
          <span className="break-all">{repo.repoPath || repo.webUrl}</span>
          <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span className="sr-only">{t.gitOpenInGitLab}</span>
        </a>
        <RepoSyncStatus repo={repo} now={now} />
      </div>
      {canConfigure && !renaming && (
        <div className="flex shrink-0 gap-1">
          <IconButton
            size="sm"
            label={fillTemplate(t.gitSetRepoRenameOf, { name: repo.name })}
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => setRenaming(true)}
          />
          <IconButton
            size="sm"
            label={fillTemplate(t.gitSetRepoRemoveOf, { name: repo.name })}
            icon={<Trash2 className="h-4 w-4" />}
            loading={remove.isPending}
            onClick={() => void confirmRemove()}
            className="text-danger hover:text-danger"
          />
        </div>
      )}
    </li>
  )
}
