"use client"

import { FolderX, RotateCcw, Trash2 } from "lucide-react"
import { I18nText, type EntityI18n } from "@/components/i18n-text"
import { deletedByLabel, formatTrashDate, type TrashUserRef } from "@/components/trash/trash-format"
import { Button, EmptyState, PageHeader, SkeletonCard, useConfirm } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

export interface TrashedProject {
  id: string
  name: string
  status: string
  deletedAt: string
  deletedBy: TrashUserRef | null
  purgeAt: string
  counts: { backlogItems: number; iceboxItems: number; sprints: number }
  i18n: EntityI18n
}

export interface AdminProjectTrash {
  retentionDays: number
  projects: TrashedProject[]
}

const URL_BASE = "/api/admin/trash/projects"

/** Admin project trash: every trashed project with restore / delete permanently. */
export function ProjectTrashManagement() {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const query = useApiQuery<AdminProjectTrash>(URL_BASE, { toastOnError: (e) => `${t.trashLoadFailed}: ${e.message}` })
  const { data, mutate: setData } = query

  const dropProject = (p: TrashedProject) => {
    const prev = data
    setData((d) => (d ? { ...d, projects: d.projects.filter((x) => x.id !== p.id) } : d))
    return prev
  }

  const restore = useApiMutation((p: TrashedProject) => apiFetch(`${URL_BASE}/${p.id}/restore`, { method: "POST" }), {
    onMutate: dropProject,
    rollback: (prev) => setData(prev),
    toastOnSuccess: t.trashRestored,
    toastOnError: (e) => `${t.trashRestoreFailed}: ${e.message}`,
  })

  const purge = useApiMutation((p: TrashedProject) => apiFetch(`${URL_BASE}/${p.id}`, { method: "DELETE" }), {
    onMutate: dropProject,
    rollback: (prev) => setData(prev),
    toastOnSuccess: t.trashPurged,
    toastOnError: (e) => `${t.trashPurgeFailed}: ${e.message}`,
  })

  async function handleRestore(p: TrashedProject) {
    const ok = await confirm({
      title: t.trashConfirmRestoreTitle,
      message: t.trashAdminConfirmRestoreMessage.replace("{name}", p.name),
      confirmLabel: t.trashRestore,
      cancelLabel: t.cancel,
      variant: "info",
    })
    if (ok) void restore.mutate(p)
  }

  async function handlePurge(p: TrashedProject) {
    const ok = await confirm({
      title: t.trashConfirmPurgeTitle,
      message: t.trashAdminConfirmPurgeMessage.replace("{name}", p.name),
      confirmLabel: t.trashDeleteForever,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) void purge.mutate(p)
  }

  const busy = restore.isPending || purge.isPending

  return (
    <div>
      <PageHeader
        title={t.trashAdminTitle}
        description={t.trashAdminDescription.replace("{days}", String(data?.retentionDays ?? 30))}
      />
      {query.isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !data || data.projects.length === 0 ? (
        <EmptyState
          icon={<FolderX className="h-6 w-6" />}
          title={t.trashAdminEmptyTitle}
          description={t.trashAdminEmptyDescription}
          headingLevel={2}
        />
      ) : (
        <ul aria-label={t.trashAdminTitle} className="divide-y divide-border rounded-ui-lg border border-border bg-surface">
          {data.projects.map((p) => (
            <ProjectRow key={p.id} project={p} busy={busy} onRestore={() => void handleRestore(p)} onPurge={() => void handlePurge(p)} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface RowProps {
  project: TrashedProject
  busy: boolean
  onRestore: () => void
  onPurge: () => void
}

function ProjectRow({ project: p, busy, onRestore, onPurge }: RowProps) {
  const { t, language } = useLanguage()
  const counts = t.trashAdminCounts
    .replace("{pbi}", String(p.counts.backlogItems))
    .replace("{icebox}", String(p.counts.iceboxItems))
    .replace("{sprints}", String(p.counts.sprints))
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <I18nText i18n={p.i18n} field="name" original={p.name} className="break-words text-body font-semibold text-fg" />
        <p className="mt-0.5 text-caption text-fg-muted">{counts}</p>
        <p className="mt-0.5 text-caption text-fg-muted">
          {deletedByLabel(t, p.deletedBy)}
          {" · "}
          <span>
            {t.trashDeletedAt}: <time dateTime={p.deletedAt}>{formatTrashDate(p.deletedAt, language)}</time>
          </span>
          {" · "}
          <time dateTime={p.purgeAt}>{t.trashPurgeAt.replace("{date}", formatTrashDate(p.purgeAt, language, false))}</time>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
          aria-label={`${t.trashRestore}: ${p.name}`}
          disabled={busy}
          onClick={onRestore}
        >
          {t.trashRestore}
        </Button>
        <Button
          variant="danger"
          size="sm"
          leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
          aria-label={`${t.trashDeleteForever}: ${p.name}`}
          disabled={busy}
          onClick={onPurge}
        >
          {t.trashDeleteForever}
        </Button>
      </div>
    </li>
  )
}
