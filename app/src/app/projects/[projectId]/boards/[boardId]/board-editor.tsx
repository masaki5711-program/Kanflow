"use client"

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { boardUrl, nextSheetName, sheetUrl, type BoardDto, type BoardSheetDto, type BoardWithPermissions, type SheetCreatedDto } from "@/components/board/board-api"
import { NameDialog } from "@/components/board/name-dialog"
import { SheetEditor, type SheetEditorHandle } from "@/components/board/sheet-editor"
import { SheetTabs } from "@/components/board/sheet-tabs"
import { Badge, Button, EmptyState, SkeletonCard, buttonClasses, useConfirm, useToast } from "@/components/ui"
import { apiFetch, isApiError, useApiQuery } from "@/hooks"
import { BOARD_LIMITS } from "@/lib/board/limits"
import type { KnownElement } from "@/lib/board/model"
import { useLanguage } from "@/lib/language-context"

interface Props {
  projectId: string
  boardId: string
  /** The signed-in user (votes on sticky notes are per person). */
  userId: string
  /** May add IceBox items (sticky notes can be sent there). */
  canAddToIcebox: boolean
}

type Dialog = { kind: "rename"; sheet: BoardSheetDto } | { kind: "duplicate"; sheet: BoardSheetDto }

/** The board editor page: title, the open sheet's editor and the sheet tabs at the bottom. */
export function BoardEditor({ projectId, boardId, userId, canAddToIcebox }: Props) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const toast = useToast()
  const url = boardUrl(projectId, boardId)
  const query = useApiQuery<BoardWithPermissions>(url, { toastOnError: false })
  const board = query.data
  useProjectDocumentTitle(board?.title ?? t.wbTitle)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)
  const editorRef = useRef<SheetEditorHandle>(null)
  // Copies live as long as the board is open, so they can be pasted on another sheet.
  const clipboard = useRef<KnownElement[]>([])
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const tabId = (sheetId: string) => `${baseId}-tab-${sheetId}`

  const listHref = `/projects/${projectId}/boards`
  const backLink = (
    <Link href={listHref} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2" })}>
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t.wbBackToList}
    </Link>
  )

  if (!board) {
    if (query.error) {
      const missing = isApiError(query.error) && query.error.status === 404
      return (
        <div>
          {backLink}
          <h1 className="sr-only">{t.wbTitle}</h1>
          <EmptyState
            title={missing ? t.wbNotFoundTitle : t.wbLoadFailed}
            description={missing ? t.wbNotFoundDescription : query.error.message}
            headingLevel={2}
            action={
              missing ? undefined : (
                <Button variant="secondary" onClick={() => void query.refetch()}>
                  {t.errorRetry}
                </Button>
              )
            }
          />
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {backLink}
        <SkeletonCard />
      </div>
    )
  }

  const { canWrite } = board.permissions
  const sheets = board.sheets
  const active = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0]

  function applyBoard(next: BoardDto) {
    query.mutate((prev) => (prev ? { ...prev, ...next } : prev))
  }

  /** Runs one sheet operation at a time; a failure is said in a toast (the tabs stay as they were). */
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t.errorRetry)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Before another sheet replaces the open one: save it. When the save does not go through, the user
   * decides — leaving drops what is unsaved, and that is never done without asking.
   */
  async function leaveSheet(): Promise<boolean> {
    const saved = (await editorRef.current?.flush()) ?? true
    if (saved) return true
    return confirm({
      title: t.wbSheetUnsavedTitle,
      message: t.wbSheetUnsavedMessage,
      confirmLabel: t.wbSheetUnsavedLeave,
      cancelLabel: t.cancel,
      variant: "danger",
    })
  }

  function select(sheetId: string) {
    if (sheetId === active?.id) return
    void run(async () => {
      if (await leaveSheet()) setActiveId(sheetId)
    })
  }

  function add() {
    void run(async () => {
      const name = nextSheetName(
        t.wbDefaultSheetName,
        sheets.map((sheet) => sheet.name),
      )
      const created = await apiFetch<SheetCreatedDto>(`${url}/sheets`, { method: "POST", json: { name } })
      applyBoard(created.board)
      if (await leaveSheet()) setActiveId(created.sheetId)
    })
  }

  async function rename(sheet: BoardSheetDto, name: string) {
    applyBoard(await apiFetch<BoardDto>(sheetUrl(projectId, boardId, sheet.id), { method: "PATCH", json: { name } }))
    setDialog(null)
  }

  async function duplicate(sheet: BoardSheetDto, name: string) {
    // The copy is made on the server from what is saved: the open sheet is saved first.
    if (sheet.id === active?.id && !((await editorRef.current?.flush()) ?? true)) throw new Error(t.wbSaveFailed)
    const created = await apiFetch<SheetCreatedDto>(`${sheetUrl(projectId, boardId, sheet.id)}/duplicate`, { method: "POST", json: { name } })
    applyBoard(created.board)
    setDialog(null)
    setActiveId(created.sheetId)
  }

  function move(sheet: BoardSheetDto, direction: -1 | 1) {
    const from = sheets.findIndex((s) => s.id === sheet.id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= sheets.length) return
    const sheetIds = sheets.map((s) => s.id)
    sheetIds.splice(to, 0, ...sheetIds.splice(from, 1))
    const openId = active?.id
    void run(async () => {
      applyBoard(await apiFetch<BoardDto>(`${url}/sheets/order`, { method: "PUT", json: { sheetIds } }))
      // Without this a board opened on its first sheet would switch to whichever sheet is first now.
      if (openId) setActiveId(openId)
    })
  }

  function remove(sheet: BoardSheetDto) {
    void run(async () => {
      const ok = await confirm({
        title: t.wbSheetDeleteConfirmTitle,
        message: t.wbSheetDeleteConfirmMessage.replace("{name}", sheet.name),
        confirmLabel: t.delete,
        cancelLabel: t.cancel,
        variant: "danger",
      })
      if (!ok) return
      const index = sheets.findIndex((s) => s.id === sheet.id)
      const next = await apiFetch<BoardDto>(sheetUrl(projectId, boardId, sheet.id), { method: "DELETE" })
      applyBoard(next)
      // The neighbour takes the place of a deleted open sheet.
      if (sheet.id === active?.id) setActiveId(next.sheets[Math.min(index, next.sheets.length - 1)]?.id ?? null)
    })
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[30rem] flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {backLink}
        <h1 className="min-w-0 break-words text-title font-semibold text-fg">{board.title}</h1>
        {!canWrite && <Badge tone="neutral">{t.wbReadOnly}</Badge>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-ui-lg border border-border bg-surface">
        <div role="tabpanel" id={panelId} aria-labelledby={active ? tabId(active.id) : undefined} className="flex min-h-0 flex-1 flex-col">
          {active && (
            <SheetEditor
              key={active.id}
              ref={editorRef}
              projectId={projectId}
              boardId={boardId}
              boardTitle={board.title}
              sheet={active}
              canWrite={canWrite}
              clipboard={clipboard}
              userId={userId}
              canAddToIcebox={canAddToIcebox}
            />
          )}
        </div>
        <SheetTabs
          sheets={sheets}
          activeId={active?.id ?? ""}
          tabId={tabId}
          panelId={panelId}
          readOnly={!canWrite}
          canAdd={sheets.length < BOARD_LIMITS.sheetsPerBoard}
          onSelect={select}
          onAdd={add}
          onRename={(sheet) => setDialog({ kind: "rename", sheet })}
          onDuplicate={(sheet) => setDialog({ kind: "duplicate", sheet })}
          onMove={move}
          onDelete={remove}
        />
      </div>

      {dialog?.kind === "rename" && (
        <NameDialog
          title={t.wbSheetRenameTitle}
          label={t.wbSheetNameLabel}
          initial={dialog.sheet.name}
          maxLength={BOARD_LIMITS.sheetNameLength}
          submitLabel={t.save}
          onSubmit={(name) => rename(dialog.sheet, name)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "duplicate" && (
        <NameDialog
          title={t.wbSheetDuplicateTitle}
          label={t.wbSheetNameLabel}
          initial={t.wbSheetCopyName.replace("{name}", dialog.sheet.name).slice(0, BOARD_LIMITS.sheetNameLength)}
          maxLength={BOARD_LIMITS.sheetNameLength}
          submitLabel={t.create}
          onSubmit={(name) => duplicate(dialog.sheet, name)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
