"use client"

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject } from "react"
import type { PaperSize } from "@/lib/board/pdf"
import { contextMenuEntries, type ContextMenuActions } from "./context-menu"
import { HelpDialog } from "./help-dialog"
import { PbiDraftPickerModal, type PbiDraft } from "@/components/pbi-draft-picker-modal"
import { pbiPatch } from "@/lib/board/ops"
import { CommentsPanel } from "./comments-panel"
import { HistoryDialog } from "./history-dialog"
import { PbiLinkDialog } from "./pbi-link-dialog"
import { useBoardComments, usePbiInfo, usePresence, viewerColor, type Viewer } from "./use-board-collab"
import { AlertTriangle, Check } from "lucide-react"
import { apiFetch } from "@/hooks"
import { compressImageFile } from "@/lib/image-compress"
import { isBox, isKnown, type BoxElement, type KnownElement } from "@/lib/board/model"
import { TEMPLATE_TEXT_KEYS, type TemplateTextKey, type TemplateTexts } from "@/lib/board/templates"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, Spinner, VisuallyHidden, cn, useToast } from "@/components/ui"
import { boardFilesUrl, boardFileUrl, type BoardFileDto, type BoardSheetDto } from "./board-api"
import { BoardCanvas } from "./board-canvas"
import { BoardToolbar } from "./board-toolbar"
import { BoardRenderContextValue, type BoardRenderContext } from "./element-view"
import { downloadBlob, renderSheetPdf, renderSheetPng } from "./export-png"
import { FormatBar } from "./format-bar"
import { LinkDialog } from "./link-dialog"
import { useBoardEditor, type EditorNotice } from "./use-board-editor"
import { useSheetDocument, type SheetDocument } from "./use-sheet-document"

export interface SheetEditorHandle {
  /** Saves what is unsaved now. Resolves true when nothing is left unsaved. */
  flush: () => Promise<boolean>
}

interface SheetEditorProps {
  projectId: string
  boardId: string
  boardTitle: string
  sheet: BoardSheetDto
  canWrite: boolean
  /** The board's clipboard (copies can be pasted on another sheet). */
  clipboard: RefObject<KnownElement[]>
  userId: string | null
  canAddToIcebox: boolean
  /** Opens the board's search (Ctrl+F, the toolbar). */
  onSearch?: () => void
  /** An element to select and show (a search result); a new nonce shows it again. */
  focus?: { id: string; nonce: number } | null
  /** May delete anyone's comment (board.manage). */
  canManage?: boolean
  /** May have the AI draft PBIs from a shape and its surroundings (ai.draftPbi). */
  canDraftPbi?: boolean
  /** Open the comments beside the canvas from the start (a notification's link). */
  openComments?: boolean
  ref?: Ref<SheetEditorHandle>
}

/** The template texts in the viewer's language: `key` → `wbTpl<Key>` (KPT's "Try" is `wbTplTry`). */
export function templateTextsOf(t: Translations): TemplateTexts {
  const out = {} as Record<TemplateTextKey, string>
  for (const key of TEMPLATE_TEXT_KEYS) {
    const name = (key === "tryNext" ? "wbTplTry" : `wbTpl${key[0].toUpperCase()}${key.slice(1)}`) as keyof Translations
    out[key] = String(t[name] ?? "")
  }
  return out
}

/** A file name without characters Windows or browsers refuse. */
function safeName(text: string): string {
  return text.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 80) || "board"
}

/** The editor of one sheet: toolbars, save state and canvas. Mount it with `key={sheet.id}`. */
export function SheetEditor({ projectId, boardId, boardTitle, sheet, canWrite, canManage = false, canDraftPbi = false, clipboard, userId, canAddToIcebox, onSearch, focus, openComments = false, ref }: SheetEditorProps) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const doc = useSheetDocument(projectId, boardId, sheet.id, canWrite)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(openComments)
  const [pbiOpen, setPbiOpen] = useState(false)
  /** The shape the AI is drafting PBIs from (the three-draft picker is open). */
  const [draftFor, setDraftFor] = useState<string | null>(null)
  const pbi = usePbiInfo(projectId, boardId, doc.elements, { missing: t.wbPbiMissing, confidential: t.wbPbiConfidential })
  const pbiInfo = pbi.info
  const comments = useBoardComments(projectId, boardId)

  const templateTexts = templateTextsOf(t)

  function notify(notice: EditorNotice) {
    if (notice.tone === "error") toast.error(notice.text)
    else toast.success(notice.text)
  }

  async function uploadImage(file: File): Promise<string> {
    const compressed = await compressImageFile(file, { maxEdge: 2560 })
    const form = new FormData()
    form.append("file", compressed, compressed.name || `image.${compressed.type.split("/")[1] ?? "png"}`)
    const dto = await apiFetch<BoardFileDto>(boardFilesUrl(projectId, boardId), { method: "POST", body: form })
    return dto.id
  }

  // Server time (from the presence answers): a timer started here ends at the same moment for everyone.
  const offsetRef = useRef(0)
  const now = useCallback(() => Date.now() + offsetRef.current, [])
  const editor = useBoardEditor(doc, !canWrite, clipboard, {
    userId,
    now,
    uploadImage,
    templateTexts,
    notify,
    messages: {
      imageNotImage: t.wbImageNotImage,
      imageTooLarge: t.wbImageTooLarge,
      imageFailed: t.wbImageFailed,
      formatTooLarge: t.wbFormatTooLarge,
      pastedTable: (rows, cols) => t.wbPastedTable.replace("{rows}", String(rows)).replace("{cols}", String(cols)),
    },
  })
  const flush = doc.flush
  useImperativeHandle(ref, () => ({ flush }), [flush])
  const { viewers, offset: clockOffset } = usePresence(projectId, boardId, sheet.id, editor.selection)
  useEffect(() => {
    offsetRef.current = clockOffset
  }, [clockOffset])
  const others = useMemo(() => viewers.map((v) => ({ userId: v.userId, name: v.name, color: viewerColor(v.userId), ids: v.selection })), [viewers])
  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of comments.comments) if (c.sheetId === sheet.id && c.elementId && !c.resolved) counts[c.elementId] = (counts[c.elementId] ?? 0) + 1
    return counts
  }, [comments.comments, sheet.id])
  const openCount = comments.comments.filter((c) => c.sheetId === sheet.id && !c.resolved).length

  const linkOpenText = t.wbLinkOpenNewTab
  const imageAlt = t.wbImageAlt
  const timerAria = t.wbTimerAria
  const timerDone = t.wbTimerDone
  const timerBudget = t.wbVoteBudget
  const timerDoneStatus = t.wbTimerDoneStatus
  const renderContext = useMemo<BoardRenderContext>(
    () => ({
      fileUrl: (fileId) => boardFileUrl(projectId, boardId, fileId),
      userId,
      linkLabel: (url) => linkOpenText.replace("{url}", url),
      imageAlt,
      timerLabels: { aria: timerAria, done: timerDone, budget: timerBudget },
      pbi: pbiInfo,
      now,
      timerDoneStatus,
    }),
    [projectId, boardId, userId, linkOpenText, imageAlt, timerAria, timerDone, timerBudget, pbiInfo, now, timerDoneStatus],
  )

  // A search result on this sheet: select it and bring it into view.
  const focusId = focus?.id
  const focusNonce = focus?.nonce
  const { select: selectIds, showElement } = editor
  useEffect(() => {
    if (!focusId || doc.load !== "ready") return
    selectIds([focusId])
    showElement(focusId)
    // Each search pick is acted on once (the nonce changes per pick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusNonce, doc.load])

  async function exportPdf(paper: PaperSize) {
    if (busy) return
    setBusy(true)
    try {
      const blob = await renderSheetPdf(doc.elements, renderContext.fileUrl, paper, sheet.name)
      if (!blob) throw new Error(t.wbExportFailed)
      downloadBlob(blob, `${safeName(boardTitle)}-${safeName(sheet.name)}.pdf`)
    } catch {
      toast.error(t.wbExportFailed)
    } finally {
      setBusy(false)
    }
  }

  /** The selected sticky notes' texts, in reading order (what the AI is given). */
  function selectedNotes(): { ids: string[]; texts: string[] } {
    const notes = editor.selection
      .map((id) => doc.elements[id])
      .filter((el): el is BoxElement => isBox(el) && el.text.trim() !== "" && (el.type === "sticky" || el.type === "rect" || el.type === "text" || el.type === "ellipse" || el.type === "shape"))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    return { ids: notes.map((n) => n.id), texts: notes.map((n) => n.text.trim().slice(0, 1000)) }
  }

  async function aiAssist(action: "summarize" | "group") {
    const { ids, texts } = selectedNotes()
    if (busy || texts.length < 2) return
    setBusy(true)
    toast.success(t.wbAiWorking)
    try {
      const body = await apiFetch<{ summary?: string; groups?: { title: string; items: number[] }[] }>(`/api/projects/${projectId}/boards/${boardId}/ai`, { method: "POST", json: { action, texts: texts.slice(0, 100), language } })
      if (action === "summarize" && body.summary) editor.placeSummary(ids, `${t.wbAiSummaryTitle}\n${body.summary}`)
      if (action === "group" && body.groups) editor.placeGroups(ids.slice(0, 100), body.groups)
      toast.success(t.wbAiDone)
    } catch (error) {
      toast.error(t.wbAiFailed.replace("{reason}", error instanceof Error && error.message ? error.message : ""))
    } finally {
      setBusy(false)
    }
  }

  /** The AI's three PBI drafts for a shape: the sheet is saved first, so the drafts read what is on it now. */
  async function draftPbis(elementId: string) {
    if (busy) return
    // The drafts read the stored sheet: if it cannot be saved now, they would read an older one.
    if (!(await doc.flush())) {
      toast.error(t.wbSaveFailed)
      return
    }
    setDraftFor(elementId)
  }

  /** The picked draft becomes a PBI, linked to the shape it was drafted from. */
  async function createFromDraft(elementId: string, draft: PbiDraft) {
    setBusy(true)
    try {
      const created = await apiFetch<{ id: string; displayId: number }>(`/api/projects/${projectId}/backlog`, {
        method: "POST",
        json: { initiative: draft.initiative, epic: draft.epic, userStory: draft.userStory, acceptanceCriteria: draft.acceptanceCriteria, workloadScore: draft.workloadScore },
      })
      const link = pbiPatch(doc.elements, elementId, created.id)
      setDraftFor(null)
      if (Object.keys(link).length === 0) {
        // Locked or deleted meanwhile: the PBI exists, it just could not be linked.
        toast.error(t.wbPbiCreatedNotLinked.replace("{n}", String(created.displayId)))
        return
      }
      editor.commit(link)
      toast.success(t.wbPbiCreated.replace("{n}", String(created.displayId)))
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t.wbPbiCreateFailed)
    } finally {
      setBusy(false)
    }
  }

  /** A new backlog item from the selected box's text, linked to the box. */
  async function createPbi() {
    const box = editor.selection.length === 1 ? doc.elements[editor.selection[0]] : undefined
    if (busy || !isBox(box) || !box.text.trim()) return
    setBusy(true)
    try {
      const created = await apiFetch<{ id: string; displayId: number }>(`/api/projects/${projectId}/backlog`, { method: "POST", json: { userStory: box.text.trim().slice(0, 5000) } })
      editor.setPbi(created.id)
      toast.success(t.wbPbiCreated.replace("{n}", String(created.displayId)))
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t.wbPbiCreateFailed)
    } finally {
      setBusy(false)
    }
  }

  async function exportPng() {
    if (busy) return
    setBusy(true)
    try {
      const blob = await renderSheetPng(doc.elements, renderContext.fileUrl)
      if (!blob) throw new Error(t.wbExportFailed)
      downloadBlob(blob, `${safeName(boardTitle)}-${safeName(sheet.name)}.png`)
    } catch {
      toast.error(t.wbExportFailed)
    } finally {
      setBusy(false)
    }
  }

  async function toIcebox() {
    const stickies = editor.selection.map((id) => doc.elements[id]).filter((el) => isBox(el) && el.type === "sticky" && el.text.trim() !== "")
    if (busy || stickies.length === 0) return
    setBusy(true)
    let added = 0
    try {
      for (const el of stickies) {
        if (!isBox(el)) continue
        await apiFetch(`/api/projects/${projectId}/icebox`, { method: "POST", json: { request: el.text.trim().slice(0, 5000) } })
        added += 1
      }
      toast.success(t.wbToIceboxDone.replace("{count}", String(added)))
    } catch (error) {
      // The API's message is already in the viewer's language; without one, the editor's own text is used.
      const reason = error instanceof Error && error.message ? error.message : null
      toast.error(added > 0 ? t.wbToIceboxPartial.replace("{count}", String(added)) : t.wbToIceboxFailed)
      if (reason) toast.error(reason)
    } finally {
      setBusy(false)
    }
  }

  if (doc.load === "loading") {
    return (
      <div role="status" className="flex min-h-0 flex-1 items-center justify-center gap-2 text-body text-fg-muted">
        <Spinner size="sm" />
        {t.loading}
      </div>
    )
  }
  if (doc.load === "error") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          title={t.wbSheetLoadFailed}
          description={doc.loadError ?? undefined}
          headingLevel={2}
          action={
            <Button variant="secondary" onClick={doc.reload}>
              {t.errorRetry}
            </Button>
          }
        />
      </div>
    )
  }

  const selectedBox = editor.selection.length === 1 ? doc.elements[editor.selection[0]] : undefined
  const linkedPbi = isBox(selectedBox) ? selectedBox.pbiId : undefined
  const notes = selectedNotes()
  const menuActions: ContextMenuActions = {
    editLink: () => setLinkOpen(true),
    toIcebox: canAddToIcebox ? () => void toIcebox() : undefined,
    comment: () => setCommentsOpen(true),
    linkPbi: () => setPbiOpen(true),
    createPbi: () => void createPbi(),
    pbiDrafts:
      canDraftPbi && canWrite && isBox(selectedBox) && selectedBox.text.trim() && !["table", "image", "timer"].includes(selectedBox.type)
        ? () => void draftPbis(selectedBox.id)
        : undefined,
    openPbi: linkedPbi ? () => window.open(`/projects/${encodeURIComponent(projectId)}/backlog?pbi=${encodeURIComponent(linkedPbi)}`, "_blank", "noopener,noreferrer") : undefined,
    aiSummarize: notes.texts.length >= 2 ? () => void aiAssist("summarize") : undefined,
    aiGroup: notes.texts.length >= 2 ? () => void aiAssist("group") : undefined,
  }

  const linkInitial = (() => {
    const links = editor.selection.map((id) => doc.elements[id]).filter(isKnown).map((el) => el.link ?? "")
    return links.length > 0 && links.every((l) => l === links[0]) ? links[0] : ""
  })()

  return (
    <BoardRenderContextValue.Provider value={renderContext}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-surface px-2 py-1">
          <BoardToolbar
            editor={editor}
            actions={{
              pickImage: () => fileInputRef.current?.click(),
              exportPng: () => void exportPng(),
              exportPdf: (paper) => void exportPdf(paper),
              toIcebox: canAddToIcebox ? () => void toIcebox() : undefined,
              search: onSearch,
              help: () => setHelpOpen(true),
              history: () => setHistoryOpen(true),
              comments: () => setCommentsOpen((open) => !open),
              commentsOpen,
              commentCount: openCount,
            }}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Viewers viewers={viewers} />
            {canWrite && <SaveState doc={doc} />}
          </div>
        </div>
        <VisuallyHidden>
          {/* A new node per update: each one is announced (re-setting the same text is not). */}
          <span key={doc.remoteUpdates} role="status">
            {doc.remoteUpdates > 0 ? t.wbRemoteUpdated : ""}
          </span>
        </VisuallyHidden>
        {doc.remoteFailing && (
          <p role="status" className="flex items-center gap-1.5 border-b border-border bg-warning-soft px-3 py-1 text-caption text-fg">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-strong" aria-hidden />
            {t.wbRemotePaused}
          </p>
        )}
        <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <FormatBar editor={editor} onEditLink={() => setLinkOpen(true)} />
          <BoardCanvas
            editor={editor}
            label={t.wbCanvasLabel.replace("{sheet}", sheet.name)}
            menuFor={(at) => contextMenuEntries(editor, t, at, menuActions)}
            onSearch={onSearch}
            onHelp={() => setHelpOpen(true)}
            others={others}
            commentCounts={commentCounts}
            onOpenComments={(id) => {
              editor.select([id])
              setCommentsOpen(true)
            }}
          />
        </div>
        {commentsOpen && (
          <CommentsPanel
            projectId={projectId}
            sheetId={sheet.id}
            elements={doc.elements}
            comments={comments.comments}
            target={editor.selection.length === 1 ? editor.selection[0] : null}
            userId={userId}
            canWrite={canWrite}
            canManage={canManage}
            add={comments.add}
            resolve={comments.resolve}
            remove={comments.remove}
            show={(id) => {
              editor.select([id])
              editor.showElement(id)
            }}
            onClose={() => setCommentsOpen(false)}
          />
        )}
        </div>
        {canWrite && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            data-testid="board-image-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ""
              if (files.length > 0) void editor.insertImages(files)
            }}
          />
        )}
        {linkOpen && (
          <LinkDialog
            initial={linkInitial}
            onSubmit={(link) => {
              editor.setLink(link)
              setLinkOpen(false)
            }}
            onClose={() => setLinkOpen(false)}
          />
        )}
        {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
        {draftFor && (
          <PbiDraftPickerModal
            key={draftFor}
            projectId={projectId}
            source={{ url: `/api/projects/${projectId}/boards/${boardId}/ai/pbi-drafts`, body: { sheetId: sheet.id, elementId: draftFor } }}
            pickLabel={t.wbPbiDraftUse}
            onPick={(draft) => void createFromDraft(draftFor, draft)}
            onClose={() => setDraftFor(null)}
          />
        )}
        {historyOpen && <HistoryDialog projectId={projectId} boardId={boardId} sheetId={sheet.id} canWrite={canWrite} onRestored={doc.reload} onClose={() => setHistoryOpen(false)} />}
        {pbiOpen && (
          <PbiLinkDialog
            projectId={projectId}
            boardId={boardId}
            linked={!!linkedPbi}
            onPick={(item) => {
              editor.setPbi(item.id)
              setPbiOpen(false)
              toast.success(t.wbPbiLinked.replace("{n}", String(item.displayId)))
            }}
            onUnlink={() => {
              editor.setPbi(null)
              setPbiOpen(false)
            }}
            onClose={() => setPbiOpen(false)}
          />
        )}
      </div>
    </BoardRenderContextValue.Provider>
  )
}

/** Saved / saving / failed, always visible: a failed save is said in words and can be retried at once. */
function SaveState({ doc }: { doc: SheetDocument }) {
  const { t } = useLanguage()
  const failed = doc.saveStatus === "failed"
  const text =
    doc.saveStatus === "saved" ? t.wbSaveSaved : doc.saveStatus === "saving" ? t.wbSaveSaving : failed ? t.wbSaveFailed : t.wbSavePending
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-save-status={doc.saveStatus}>
      {/* Read out only what matters: "saved" politely, a failure at once — not every pending / saving step while drawing. */}
      <VisuallyHidden>
        <span role="status">{doc.saveStatus === "saved" ? t.wbSaveSaved : ""}</span>
        <span role="alert">{failed ? [t.wbSaveFailed, doc.saveError].filter(Boolean).join(" ") : ""}</span>
      </VisuallyHidden>
      <p aria-hidden="true" className={cn("flex min-w-0 flex-wrap items-center gap-1.5 text-caption", failed ? "font-semibold text-danger-strong" : "text-fg-muted")}>
        {failed ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : doc.saveStatus === "saved" ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Spinner size="xs" />
        )}
        <span>{text}</span>
        {failed && (
          <span className="font-normal text-fg-muted">
            {doc.saveError ? `${doc.saveError} ` : ""}
            {doc.saveRetries ? t.wbSaveFailedHint : ""}
          </span>
        )}
      </p>
      {failed && (
        <Button variant="secondary" size="sm" onClick={() => void doc.flush()}>
          {t.wbSaveRetry}
        </Button>
      )}
    </div>
  )
}

/** The others on this sheet now: a dot in their colour and their initial, names on hover and for screen readers. */
function Viewers({ viewers }: { viewers: Viewer[] }) {
  const { t } = useLanguage()
  if (viewers.length === 0) return null
  const shown = viewers.slice(0, 5)
  const more = viewers.length - shown.length
  return (
    <div role="group" aria-label={t.wbViewersLabel} className="flex items-center -space-x-1.5" data-testid="board-viewers">
      {shown.map((v) => (
        <span
          key={v.userId}
          title={v.name}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 bg-surface text-caption font-semibold text-fg"
          style={{ borderColor: viewerColor(v.userId) }}
        >
          <span aria-hidden="true">{(v.name || "?").slice(0, 1)}</span>
          <VisuallyHidden>{v.name}</VisuallyHidden>
        </span>
      ))}
      {more > 0 && <span className="pl-2.5 text-caption text-fg-muted">{t.wbViewersMoreCount.replace("{n}", String(more))}</span>}
    </div>
  )
}
