"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PenTool, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { boardUrl, boardsUrl, type BoardDto, type BoardListDto, type BoardSummaryDto } from "@/components/board/board-api"
import { NameDialog } from "@/components/board/name-dialog"
import { deletedByLabel, formatTrashDate } from "@/components/trash/trash-format"
import { ActionMenu, Button, EmptyState, PageHeader, SkeletonCard, useConfirm, useToast, type ActionMenuItem } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { formatDateTime } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"

interface Props {
  projectId: string
}

type Dialog = { kind: "create" } | { kind: "rename"; board: BoardSummaryDto }

/** Board list of a project: open, create, rename, move to the trash; the board trash for PO / SM. */
export function BoardsContent({ projectId }: Props) {
  const { t } = useLanguage()
  useProjectDocumentTitle(t.wbTitle)
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const url = boardsUrl(projectId)
  const list = useApiQuery<BoardListDto>(url, { toastOnError: (e) => `${t.wbLoadFailed}: ${e.message}` })
  const canWrite = list.data?.permissions.canWrite ?? false
  const canManage = list.data?.permissions.canManage ?? false
  // The trash is a second request only PO / SM may make.
  const trash = useApiQuery<BoardListDto>(canManage ? `${url}?trashed=1` : null, {
    toastOnError: (e) => `${t.wbLoadFailed}: ${e.message}`,
  })

  function refresh() {
    void list.refetch()
    if (canManage) void trash.refetch()
  }

  const remove = useApiMutation((board: BoardSummaryDto) => apiFetch(boardUrl(projectId, board.id), { method: "DELETE" }), {
    onSuccess: refresh,
    toastOnSuccess: t.wbDeleted,
    toastOnError: (e) => e.message,
  })

  const restore = useApiMutation((board: BoardSummaryDto) => apiFetch(`${boardUrl(projectId, board.id)}/restore`, { method: "POST" }), {
    onSuccess: refresh,
    toastOnSuccess: t.wbRestored,
    toastOnError: (e) => e.message,
  })

  async function create(title: string) {
    const board = await apiFetch<BoardDto>(url, {
      method: "POST",
      json: { title, sheetName: t.wbDefaultSheetName.replace("{n}", "1") },
    })
    toast.success(t.wbCreated)
    setDialog(null)
    router.push(`/projects/${projectId}/boards/${board.id}`)
  }

  async function rename(board: BoardSummaryDto, title: string) {
    await apiFetch<BoardDto>(boardUrl(projectId, board.id), { method: "PATCH", json: { title } })
    toast.success(t.wbRenamed)
    setDialog(null)
    refresh()
  }

  async function handleDelete(board: BoardSummaryDto) {
    const ok = await confirm({
      title: t.wbDeleteConfirmTitle,
      message: t.wbDeleteConfirmMessage.replace("{name}", board.title),
      confirmLabel: t.trashMoveToTrash,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) void remove.mutate(board)
  }

  const boards = list.data?.boards ?? []
  const trashed = trash.data?.boards ?? []
  const createButton = canWrite ? (
    <Button leftIcon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setDialog({ kind: "create" })}>
      {t.wbNew}
    </Button>
  ) : null

  return (
    <div>
      <PageHeader
        title={t.wbTitle}
        description={t.wbDescription}
        icon={
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-ui-md bg-surface-sunken text-fg-muted">
            <PenTool className="h-4 w-4" />
          </span>
        }
        actions={boards.length > 0 ? createButton : undefined}
      />
      {list.isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : list.error && !list.data ? (
        <EmptyState
          title={t.wbLoadFailed}
          description={list.error.message}
          headingLevel={2}
          action={
            <Button variant="secondary" onClick={() => void list.refetch()}>
              {t.errorRetry}
            </Button>
          }
        />
      ) : boards.length === 0 ? (
        <EmptyState
          icon={<PenTool className="h-6 w-6" />}
          title={t.wbEmptyTitle}
          description={canWrite ? t.wbEmptyDescription : t.wbEmptyReadOnly}
          headingLevel={2}
          action={createButton ?? undefined}
        />
      ) : (
        <ul aria-label={t.wbListLabel} className="divide-y divide-border rounded-ui-lg border border-border bg-surface">
          {boards.map((board) => (
            <BoardRow
              key={board.id}
              href={`/projects/${projectId}/boards/${board.id}`}
              board={board}
              onRename={canWrite ? () => setDialog({ kind: "rename", board }) : undefined}
              onDelete={canManage ? () => void handleDelete(board) : undefined}
            />
          ))}
        </ul>
      )}

      {canManage && trashed.length > 0 && (
        <section aria-labelledby="wb-trash-heading" className="mt-8">
          <h2 id="wb-trash-heading" className="text-body font-semibold text-fg">
            {t.wbTrashHeading}
          </h2>
          <p className="mt-1 text-caption text-fg-muted">{t.wbTrashDescription}</p>
          <ul aria-label={t.wbTrashHeading} className="mt-3 divide-y divide-border rounded-ui-lg border border-border bg-surface">
            {trashed.map((board) => (
              <TrashedRow key={board.id} board={board} busy={restore.isPending} onRestore={() => void restore.mutate(board)} />
            ))}
          </ul>
        </section>
      )}

      {dialog?.kind === "create" && (
        <NameDialog
          title={t.wbCreateTitle}
          label={t.wbNameLabel}
          initial=""
          maxLength={BOARD_LIMITS.titleLength}
          submitLabel={t.create}
          onSubmit={create}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title={t.wbRenameTitle}
          label={t.wbNameLabel}
          initial={dialog.board.title}
          maxLength={BOARD_LIMITS.titleLength}
          submitLabel={t.save}
          onSubmit={(title) => rename(dialog.board, title)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

interface BoardRowProps {
  href: string
  board: BoardSummaryDto
  onRename?: () => void
  onDelete?: () => void
}

function BoardRow({ href, board, onRename, onDelete }: BoardRowProps) {
  const { t, language } = useLanguage()
  const items: ActionMenuItem[] = []
  if (onRename) items.push({ key: "rename", label: t.wbRename, icon: <Pencil className="h-4 w-4" aria-hidden />, onSelect: onRename })
  if (onDelete) {
    items.push({ key: "delete", label: t.trashMoveToTrash, icon: <Trash2 className="h-4 w-4" aria-hidden />, onSelect: onDelete, danger: true })
  }
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="break-words text-body font-medium text-fg underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {board.title}
        </Link>
        <p className="mt-1 text-caption text-fg-muted">
          {t.wbSheetCount.replace("{count}", String(board.sheetCount))}
          {" · "}
          <time dateTime={board.updatedAt}>{t.wbUpdatedAt.replace("{date}", formatDateTime(board.updatedAt, language))}</time>
        </p>
      </div>
      <ActionMenu label={t.wbActionsFor.replace("{name}", board.title)} items={items} />
    </li>
  )
}

function TrashedRow({ board, busy, onRestore }: { board: BoardSummaryDto; busy: boolean; onRestore: () => void }) {
  const { t, language } = useLanguage()
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <span className="break-words text-body font-medium text-fg">{board.title}</span>
        <p className="mt-1 text-caption text-fg-muted">
          {deletedByLabel(t, board.deletedBy)}
          {board.deletedAt && (
            <>
              {" · "}
              <span>
                {t.trashDeletedAt}: <time dateTime={board.deletedAt}>{formatTrashDate(board.deletedAt, language)}</time>
              </span>
            </>
          )}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
        aria-label={`${t.trashRestore}: ${board.title}`}
        disabled={busy}
        onClick={onRestore}
      >
        {t.trashRestore}
      </Button>
    </li>
  )
}
