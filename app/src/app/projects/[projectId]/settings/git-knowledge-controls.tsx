"use client"

import { useId, useState, type FormEvent } from "react"
import { Button, Field, Textarea, useConfirm, useToast } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { serverErrorText, type GitRepositoryDto } from "../git/git-labels"
import { RepoKnowledgeStatus, RepoReindexButton } from "../git/repo-knowledge-status"

type KnowledgePatch = { aiKnowledge?: boolean; aiPathFilter?: string | null }

interface Props {
  projectId: string
  repo: GitRepositoryDto
  now: Date
  /** PO / SM / admin ("git.configure"): switch and folder filter. */
  canConfigure: boolean
  onChanged: () => void
}

/**
 * "AI の参照資料として使う" of one repository: the switch (confirmation that
 * every project member will see the content through the AI), the optional
 * folder filter, the import status and 今すぐ取り込む.
 */
export function GitKnowledgeControls({ projectId, repo, now, canConfigure, onChanged }: Props) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const toast = useToast()
  const helpId = useId()
  const save = useApiMutation((patch: KnowledgePatch) => apiFetch(`/api/projects/${projectId}/git/repositories/${repo.id}`, { method: "PATCH", json: patch }), {
    onSuccess: onChanged,
    toastOnError: (e) => serverErrorText(e, t.gitKbSaveFailed),
  })

  async function toggle(next: boolean) {
    const ok = await confirm(
      next
        ? { title: fillTemplate(t.gitKbOnTitle, { name: repo.name }), message: t.gitKbOnMessage, confirmLabel: t.gitKbOnConfirm, variant: "warning" }
        : { title: t.gitKbOffTitle, message: t.gitKbOffMessage, confirmLabel: t.gitKbOffConfirm, variant: "warning" },
    )
    if (!ok) return
    if (await save.mutate({ aiKnowledge: next })) toast.success(next ? t.gitKbEnabledToast : t.gitKbDisabledToast)
  }

  // Only people who can switch it see the control; everyone else sees the status when it is on.
  if (!canConfigure && !repo.aiKnowledge) return null

  return (
    <div className="mt-2 space-y-2 rounded-ui-md border border-border bg-surface-muted p-3">
      {canConfigure && (
        <div className="space-y-1">
          <label className="flex items-center gap-3 text-body font-medium text-fg">
            <input
              type="checkbox"
              role="switch"
              checked={repo.aiKnowledge}
              disabled={save.isPending}
              onChange={(e) => void toggle(e.target.checked)}
              aria-describedby={helpId}
              className="h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
            />
            {t.gitKbSwitch}
          </label>
          <p id={helpId} className="pl-8 text-caption text-fg-muted">
            {t.gitKbSwitchHelp}
          </p>
        </div>
      )}
      {repo.aiKnowledge && (
        <div className={canConfigure ? "space-y-2 pl-8" : "space-y-2"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <RepoKnowledgeStatus repo={repo} now={now} />
            <RepoReindexButton projectId={projectId} repo={repo} onStarted={onChanged} />
          </div>
          {canConfigure && <PathFilterForm key={repo.aiPathFilter ?? ""} initial={repo.aiPathFilter} pending={save.isPending} onSave={(v) => save.mutateAsync({ aiPathFilter: v })} />}
        </div>
      )}
    </div>
  )
}

interface FilterProps {
  initial: string | null
  pending: boolean
  onSave: (value: string | null) => Promise<unknown>
}

function PathFilterForm({ initial, pending, onSave }: FilterProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const [value, setValue] = useState(initial ?? "")
  const dirty = value.trim() !== (initial ?? "")

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!dirty || pending) return
    try {
      await onSave(value.trim() || null)
      toast.success(t.gitKbFilterSaved)
    } catch {
      // The mutation already showed the server's explanation.
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-1">
      <Field label={t.gitKbFilter} hint={t.gitKbFilterHelp}>
        <Textarea value={value} rows={2} maxLength={1000} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!dirty}>
        {t.gitKbFilterSave}
      </Button>
    </form>
  )
}
