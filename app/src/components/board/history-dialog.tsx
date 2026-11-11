"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { History, RotateCcw } from "lucide-react"
import { apiFetch } from "@/hooks"
import type { ElementMap } from "@/lib/board/geometry"
import { elementFromData, type BoardElement } from "@/lib/board/model"
import { useLanguage } from "@/lib/language-context"
import { Button, Field, Input, Modal, Spinner, useConfirm, useToast } from "@/components/ui"
import { sheetUrl } from "./board-api"
import { SheetPreview } from "./sheet-preview"

interface VersionItem {
  id: string
  label: string
  auto: boolean
  elementCount: number
  createdAt: string
  createdBy: string
}

interface HistoryDialogProps {
  projectId: string
  boardId: string
  sheetId: string
  canWrite: boolean
  /** The sheet was put back to a version: the editor reads it again. */
  onRestored: () => void
  onClose: () => void
}

/** The sheet's saved versions: who saved each and when, a look at one, putting the sheet back to it, saving now. */
export function HistoryDialog({ projectId, boardId, sheetId, canWrite, onRestored, onClose }: HistoryDialogProps) {
  const { t, language } = useLanguage()
  const confirm = useConfirm()
  const toast = useToast()
  const url = `${sheetUrl(projectId, boardId, sheetId)}/versions`
  const [versions, setVersions] = useState<VersionItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [label, setLabel] = useState("")
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ version: VersionItem; elements: ElementMap } | null>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  // "View" takes the focus to what it shows.
  useEffect(() => {
    if (preview) previewHeading.current?.focus()
  }, [preview])
  const nameOf = (v: VersionItem) => `${v.label || t.wbHistoryAuto} ${when(v.createdAt)}`
  const when = (iso: string) => new Date(iso).toLocaleString(language === "id" ? "id-ID" : language === "en" ? "en-GB" : "ja-JP", { dateStyle: "medium", timeStyle: "short" })

  const load = useCallback(async () => {
    try {
      setVersions((await apiFetch<{ versions: VersionItem[] }>(url)).versions)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!label.trim() || busy) return
    setBusy(true)
    try {
      await apiFetch(url, { method: "POST", json: { label: label.trim() } })
      setLabel("")
      toast.success(t.wbHistorySaved)
      await load()
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t.wbHistoryFailed)
    } finally {
      setBusy(false)
    }
  }

  async function view(version: VersionItem) {
    try {
      const body = await apiFetch<{ elements: { id: string; data: unknown }[] }>(`${url}/${version.id}`)
      const elements: Record<string, BoardElement> = {}
      for (const e of body.elements) elements[e.id] = elementFromData(e.id, e.data)
      setPreview({ version, elements })
    } catch {
      toast.error(t.wbHistoryFailed)
    }
  }

  async function restore(version: VersionItem) {
    const ok = await confirm({
      title: t.wbHistoryRestoreTitle,
      message: t.wbHistoryRestoreMessage.replace("{time}", when(version.createdAt)),
      confirmLabel: t.wbHistoryRestore,
      cancelLabel: t.cancel,
    })
    if (!ok) return
    setBusy(true)
    try {
      await apiFetch(`${url}/${version.id}/restore`, { method: "POST" })
      toast.success(t.wbHistoryRestored.replace("{time}", when(version.createdAt)))
      onRestored()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t.wbHistoryFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t.wbHistoryTitle} size="lg">
      <div className="space-y-4" data-testid="board-history">
        {canWrite && (
          <form onSubmit={save} className="flex flex-wrap items-end gap-2">
            <Field label={t.wbHistorySaveNow} className="min-w-0 flex-1">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t.wbHistoryLabel} />
            </Field>
            <Button type="submit" disabled={!label.trim() || busy}>
              {t.wbHistorySave}
            </Button>
          </form>
        )}
        {failed ? (
          <p role="alert" className="text-body text-danger-strong">
            {t.wbHistoryFailed}
          </p>
        ) : !versions ? (
          <p role="status" className="flex items-center gap-2 text-body text-fg-muted">
            <Spinner size="xs" />
            {t.loading}
          </p>
        ) : versions.length === 0 ? (
          <p className="text-body text-fg-muted">{t.wbHistoryEmpty}</p>
        ) : (
          <ol className="max-h-[45dvh] divide-y divide-border overflow-y-auto rounded-ui-md border border-border">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-version-id={v.id}>
                <History aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-fg">{v.label || t.wbHistoryAuto}</p>
                  <p className="text-caption text-fg-muted">
                    {when(v.createdAt)} · {v.createdBy || "—"} · {t.wbHistoryElements.replace("{n}", String(v.elementCount))}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void view(v)} aria-label={t.wbHistoryViewOf.replace("{name}", nameOf(v))}>
                  {t.wbHistoryView}
                </Button>
                {canWrite && (
                  <Button variant="secondary" size="sm" onClick={() => void restore(v)} disabled={busy} aria-label={t.wbHistoryRestoreOf.replace("{name}", nameOf(v))}>
                    <RotateCcw aria-hidden className="h-4 w-4" />
                    {t.wbHistoryRestore}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
        {preview && (
          <section aria-label={t.wbHistoryPreview.replace("{time}", when(preview.version.createdAt))} className="space-y-2">
            <h3 ref={previewHeading} tabIndex={-1} className="text-body font-semibold text-fg outline-none">{t.wbHistoryPreview.replace("{time}", when(preview.version.createdAt))}</h3>
            <SheetPreview elements={preview.elements} label={t.wbHistoryPreview.replace("{time}", when(preview.version.createdAt))} className="h-72 w-full rounded-ui-md border border-border bg-surface-sunken" />
            {canWrite && (
              <Button variant="secondary" size="sm" onClick={() => void restore(preview.version)} disabled={busy}>
                <RotateCcw aria-hidden className="h-4 w-4" />
                {t.wbHistoryRestore}
              </Button>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
