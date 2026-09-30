"use client"

import { RotateCcw, Trash2 } from "lucide-react"
import { I18nText, type EntityI18n } from "@/components/i18n-text"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { deletedByLabel, formatTrashDate, type TrashUserRef } from "@/components/trash/trash-format"
import { Badge, Button, EmptyState, PageHeader, SkeletonCard, useConfirm } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

export interface TrashEntry {
  entityType: "backlog_item" | "icebox_item"
  id: string
  displayId: number
  title: string
  titleField: "initiative" | "userStory" | "request"
  status: string
  deletedAt: string
  deletedBy: TrashUserRef | null
  purgeAt: string
  i18n: EntityI18n
}

export interface ProjectTrash {
  retentionDays: number
  items: TrashEntry[]
}

interface Props {
  projectId: string
  /** PO / admin may delete permanently ("trash.purge"); SM may only restore. */
  canPurge: boolean
}

const sameEntry = (a: TrashEntry, b: TrashEntry) => a.id === b.id && a.entityType === b.entityType

export function TrashContent({ projectId, canPurge }: Props) {
  const { t } = useLanguage()
  useProjectDocumentTitle(t.trashTitle)
  const confirm = useConfirm()

  const url = `/api/projects/${projectId}/trash`
  const query = useApiQuery<ProjectTrash>(url, { toastOnError: (e) => `${t.trashLoadFailed}: ${e.message}` })
  const { data, mutate: setData } = query

  /** Optimistically drop the entry; the snapshot rolls back on failure. */
  const dropEntry = (entry: TrashEntry) => {
    const prev = data
    setData((d) => (d ? { ...d, items: d.items.filter((i) => !sameEntry(i, entry)) } : d))
    return prev
  }

  const restore = useApiMutation(
    (entry: TrashEntry) => apiFetch(`${url}/${entry.entityType}/${entry.id}/restore`, { method: "POST" }),
    {
      onMutate: dropEntry,
      rollback: (prev) => setData(prev),
      toastOnSuccess: t.trashRestored,
      toastOnError: (e) => `${t.trashRestoreFailed}: ${e.message}`,
    },
  )

  const purge = useApiMutation(
    (entry: TrashEntry) => apiFetch(`${url}/${entry.entityType}/${entry.id}`, { method: "DELETE" }),
    {
      onMutate: dropEntry,
      rollback: (prev) => setData(prev),
      toastOnSuccess: t.trashPurged,
      toastOnError: (e) => `${t.trashPurgeFailed}: ${e.message}`,
    },
  )

  async function handlePurge(entry: TrashEntry) {
    const name = `#${entry.displayId} ${entry.title || t.trashUntitled}`
    const ok = await confirm({
      title: t.trashConfirmPurgeTitle,
      message: t.trashConfirmPurgeMessage.replace("{name}", name),
      confirmLabel: t.trashDeleteForever,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) void purge.mutate(entry)
  }

  const days = String(data?.retentionDays ?? 30)

  return (
    <div>
      <PageHeader
        title={t.trashTitle}
        description={t.trashDescription.replace("{days}", days)}
        icon={
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-ui-md bg-surface-sunken text-fg-muted">
            <Trash2 className="h-4 w-4" />
          </span>
        }
      />
      {query.isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-6 w-6" />}
          title={t.trashEmptyTitle}
          description={t.trashEmptyDescription}
          headingLevel={2}
        />
      ) : (
        <ul aria-label={t.trashListLabel} className="divide-y divide-border rounded-ui-lg border border-border bg-surface">
          {data.items.map((entry) => (
            <TrashRow
              key={`${entry.entityType}:${entry.id}`}
              entry={entry}
              canPurge={canPurge}
              busy={restore.isPending || purge.isPending}
              onRestore={() => void restore.mutate(entry)}
              onPurge={() => void handlePurge(entry)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface RowProps {
  entry: TrashEntry
  canPurge: boolean
  busy: boolean
  onRestore: () => void
  onPurge: () => void
}

function TrashRow({ entry, canPurge, busy, onRestore, onPurge }: RowProps) {
  const { t, language } = useLanguage()
  const isPbi = entry.entityType === "backlog_item"
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isPbi ? "primary" : "info"}>{isPbi ? t.trashTypePbi : t.trashTypeIcebox}</Badge>
          <span className="font-mono text-caption text-fg-muted">#{entry.displayId}</span>
          <I18nText
            i18n={entry.i18n}
            field={entry.titleField}
            original={entry.title}
            className="min-w-0 break-words text-body font-medium text-fg"
            fallback={<span className="text-body text-fg-muted">{t.trashUntitled}</span>}
          />
        </div>
        <p className="mt-1 text-caption text-fg-muted">
          {deletedByLabel(t, entry.deletedBy)}
          {" · "}
          <span>
            {t.trashDeletedAt}: <time dateTime={entry.deletedAt}>{formatTrashDate(entry.deletedAt, language)}</time>
          </span>
          {" · "}
          <time dateTime={entry.purgeAt}>{t.trashPurgeAt.replace("{date}", formatTrashDate(entry.purgeAt, language, false))}</time>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
          aria-label={`${t.trashRestore}: #${entry.displayId}`}
          disabled={busy}
          onClick={onRestore}
        >
          {t.trashRestore}
        </Button>
        {canPurge && (
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
            aria-label={`${t.trashDeleteForever}: #${entry.displayId}`}
            disabled={busy}
            onClick={onPurge}
          >
            {t.trashDeleteForever}
          </Button>
        )}
      </div>
    </li>
  )
}
