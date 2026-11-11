"use client"

import { useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject } from "react"
import { AlertTriangle, Check } from "lucide-react"
import { apiFetch } from "@/hooks"
import { compressImageFile } from "@/lib/image-compress"
import { isBox, isKnown, type KnownElement } from "@/lib/board/model"
import type { TemplateTexts } from "@/lib/board/templates"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, Spinner, VisuallyHidden, cn, useToast } from "@/components/ui"
import { boardFilesUrl, boardFileUrl, type BoardFileDto, type BoardSheetDto } from "./board-api"
import { BoardCanvas } from "./board-canvas"
import { BoardToolbar } from "./board-toolbar"
import { BoardRenderContextValue, type BoardRenderContext } from "./element-view"
import { downloadBlob, renderSheetPng } from "./export-png"
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
  ref?: Ref<SheetEditorHandle>
}

/** A file name without characters Windows or browsers refuse. */
function safeName(text: string): string {
  return text.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 80) || "board"
}

/** The editor of one sheet: toolbars, save state and canvas. Mount it with `key={sheet.id}`. */
export function SheetEditor({ projectId, boardId, boardTitle, sheet, canWrite, clipboard, userId, canAddToIcebox, ref }: SheetEditorProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const doc = useSheetDocument(projectId, boardId, sheet.id, canWrite)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const templateTexts: TemplateTexts = {
    keep: t.wbTplKeep,
    problem: t.wbTplProblem,
    tryNext: t.wbTplTry,
    zevaCurrent: t.wbTplZevaCurrent,
    zevaFuture: t.wbTplZevaFuture,
    zevaResult: t.wbTplZevaResult,
    zevaCause: t.wbTplZevaCause,
    zeva1: t.wbTplZeva1,
    zeva1Hint: t.wbTplZeva1Hint,
    zeva2: t.wbTplZeva2,
    zeva2Hint: t.wbTplZeva2Hint,
    zeva3: t.wbTplZeva3,
    zeva3Hint: t.wbTplZeva3Hint,
    zeva4: t.wbTplZeva4,
    zeva4Hint: t.wbTplZeva4Hint,
    zevaLoop: t.wbTplZevaLoop,
    minutesTitle: t.wbTplMinutesTitle,
    minutesMeta: t.wbTplMinutesMeta,
    agenda: t.wbTplAgenda,
    decisions: t.wbTplDecisions,
    actions: t.wbTplActions,
    reportTitle: t.wbTplReportTitle,
    summary: t.wbTplSummary,
    progress: t.wbTplProgress,
    issues: t.wbTplIssues,
    next: t.wbTplNext,
  }

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

  const editor = useBoardEditor(doc, !canWrite, clipboard, {
    userId,
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

  const linkOpenText = t.wbLinkOpenNewTab
  const imageAlt = t.wbImageAlt
  const renderContext = useMemo<BoardRenderContext>(
    () => ({ fileUrl: (fileId) => boardFileUrl(projectId, boardId, fileId), userId, linkLabel: (url) => linkOpenText.replace("{url}", url), imageAlt }),
    [projectId, boardId, userId, linkOpenText, imageAlt],
  )

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
              toIcebox: canAddToIcebox ? () => void toIcebox() : undefined,
            }}
          />
          {canWrite && <SaveState doc={doc} />}
        </div>
        <FormatBar editor={editor} onEditLink={() => setLinkOpen(true)} />
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
        <div className="relative min-h-0 flex-1">
          <BoardCanvas editor={editor} label={t.wbCanvasLabel.replace("{sheet}", sheet.name)} />
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
