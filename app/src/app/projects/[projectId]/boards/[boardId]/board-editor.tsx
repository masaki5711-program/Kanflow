"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, Maximize2, Minimize2 } from "lucide-react"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { boardUrl, nextSheetName, sheetUrl, type BoardDto, type BoardSheetDto, type BoardWithPermissions, type SheetCreatedDto } from "@/components/board/board-api"
import { BoardSearch } from "@/components/board/board-search"
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
  /** May have the AI draft PBIs (from a shape and its surroundings), as from an IceBox item. */
  canDraftPbi?: boolean
}

type Dialog = { kind: "rename"; sheet: BoardSheetDto } | { kind: "duplicate"; sheet: BoardSheetDto }

/** The board editor page: title, the open sheet's editor and the sheet tabs at the bottom. */
export function BoardEditor({ projectId, boardId, userId, canAddToIcebox, canDraftPbi = false }: Props) {
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
  /** Full screen: the board covers the app (and the browser goes full screen where it allows). */
  const [full, setFull] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  /** The element a search picked (shown once the sheet is open). */
  const [focus, setFocus] = useState<{ sheetId: string; id: string; nonce: number } | null>(null)
  /** A link into the board (a mention's notification, a PBI's linked boards): ?sheet=…&element=…&comments=1. */
  const [deepLink] = useState(() => {
    if (typeof window === "undefined") return null
    const q = new URLSearchParams(window.location.search)
    const sheet = q.get("sheet")
    return sheet ? { sheetId: sheet, elementId: q.get("element"), comments: q.get("comments") === "1" } : null
  })
  useEffect(() => {
    if (!deepLink) return
    setActiveId(deepLink.sheetId)
    if (deepLink.elementId) setFocus({ sheetId: deepLink.sheetId, id: deepLink.elementId, nonce: Date.now() })
  }, [deepLink])
  const editorRef = useRef<SheetEditorHandle>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof document === "undefined") return
    if (!full) {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return
    }
    // The whole page, so dialogs and messages (rendered at the page's root) stay visible.
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    // What the board covers (menu, header …) can be neither reached with Tab nor read out meanwhile. Dialogs and
    // messages are rendered directly under <body>: they stay usable.
    const covered: HTMLElement[] = []
    for (let node: HTMLElement | null = rootRef.current; node && node.parentElement && node.parentElement !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true
          covered.push(sibling)
        }
      }
    }
    return () => {
      for (const el of covered) el.inert = false
    }
  }, [full])

  useEffect(() => {
    if (typeof document === "undefined") return
    // Esc ends the browser's full screen (also when it ends a text edit): the board keeps covering the app until its
    // own button is used, so editing is not thrown out of the full view.
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])
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

  /** The search reads what is saved: the open sheet is saved first (best effort — it searches either way). */
  function openSearch() {
    void editorRef.current?.flush().finally(() => setSearchOpen(true))
    if (!editorRef.current) setSearchOpen(true)
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
    <div
      ref={rootRef}
      className={full ? "fixed inset-0 z-[60] flex flex-col bg-surface-sunken p-2 sm:p-3" : "flex h-[calc(100dvh-7rem)] min-h-[30rem] flex-col"}
      data-fullscreen={full ? "" : undefined}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {!full && backLink}
        <h1 className="min-w-0 break-words text-title font-semibold text-fg">{board.title}</h1>
        {!canWrite && <Badge tone="neutral">{t.wbReadOnly}</Badge>}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFull((on) => !on)} data-testid="board-fullscreen">
          {full ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          {full ? t.wbFullscreenExit : t.wbFullscreen}
        </Button>
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
              canDraftPbi={canDraftPbi}
              onSearch={openSearch}
              focus={focus?.sheetId === active.id ? focus : null}
              canManage={board.permissions.canManage}
              openComments={!!deepLink?.comments && deepLink.sheetId === active.id}
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

      {searchOpen && (
        <BoardSearch
          sheets={sheets}
          elementsUrl={(sheetId) => `${sheetUrl(projectId, boardId, sheetId)}/elements`}
          onClose={() => setSearchOpen(false)}
          onPick={(hit) => {
            setSearchOpen(false)
            void run(async () => {
              if (hit.sheetId !== active?.id && !(await leaveSheet())) return
              setActiveId(hit.sheetId)
              setFocus({ sheetId: hit.sheetId, id: hit.elementId, nonce: Date.now() })
            })
          }}
        />
      )}
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
