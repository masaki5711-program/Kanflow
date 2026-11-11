"use client"

import { useImperativeHandle, type Ref, type RefObject } from "react"
import { AlertTriangle, Check } from "lucide-react"
import type { KnownElement } from "@/lib/board/model"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, Spinner, VisuallyHidden, cn } from "@/components/ui"
import type { BoardSheetDto } from "./board-api"
import { BoardCanvas } from "./board-canvas"
import { BoardToolbar } from "./board-toolbar"
import { useBoardEditor } from "./use-board-editor"
import { useSheetDocument, type SheetDocument } from "./use-sheet-document"

export interface SheetEditorHandle {
  /** Saves what is unsaved now. Resolves true when nothing is left unsaved. */
  flush: () => Promise<boolean>
}

interface SheetEditorProps {
  projectId: string
  boardId: string
  sheet: BoardSheetDto
  canWrite: boolean
  /** The board's clipboard (copies can be pasted on another sheet). */
  clipboard: RefObject<KnownElement[]>
  ref?: Ref<SheetEditorHandle>
}

/** The editor of one sheet: toolbar, save state and canvas. Mount it with `key={sheet.id}`. */
export function SheetEditor({ projectId, boardId, sheet, canWrite, clipboard, ref }: SheetEditorProps) {
  const { t } = useLanguage()
  const doc = useSheetDocument(projectId, boardId, sheet.id, canWrite)
  const editor = useBoardEditor(doc, !canWrite, clipboard)
  const flush = doc.flush
  useImperativeHandle(ref, () => ({ flush }), [flush])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-surface px-2 py-1">
        <BoardToolbar editor={editor} />
        {canWrite && <SaveState doc={doc} />}
      </div>
      <div className="relative min-h-0 flex-1">
        <BoardCanvas editor={editor} label={t.wbCanvasLabel.replace("{sheet}", sheet.name)} />
      </div>
    </div>
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
