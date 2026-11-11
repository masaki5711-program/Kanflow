"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { Button, Input, Modal, Spinner } from "@/components/ui"
import type { PbiSummary } from "./use-board-collab"

interface PbiLinkDialogProps {
  projectId: string
  boardId: string
  /** The box is linked now (offers unlinking). */
  linked: boolean
  onPick: (item: PbiSummary) => void
  onUnlink: () => void
  onClose: () => void
}

/** Finds a backlog item (by number or words) to link the selected box to, or unlinks it. */
export function PbiLinkDialog({ projectId, boardId, linked, onPick, onUnlink, onClose }: PbiLinkDialogProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<PbiSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      apiFetch<{ items: PbiSummary[] }>(`/api/projects/${projectId}/boards/${boardId}/pbis?q=${encodeURIComponent(query)}`)
        .then((body) => {
          if (live) {
            setItems(body.items)
            setFailed(false)
          }
        })
        .catch(() => {
          if (live) setFailed(true)
        })
    }, 200)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [projectId, boardId, query])

  const status = (s: string) => (s === "completed" ? t.wbPbiStatusCompleted : s === "ready" ? t.wbPbiStatusReady : t.wbPbiStatusNotReady)

  return (
    <Modal
      open
      onClose={onClose}
      title={t.wbPbiLinkTitle}
      size="md"
      footer={
        linked ? (
          <Button variant="secondary" onClick={onUnlink}>
            {t.wbPbiUnlink}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3" data-testid="board-pbi-link">
        <Input data-autofocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.wbPbiSearch} aria-label={t.wbPbiSearch} />
        {failed ? (
          <p role="alert" className="text-body text-danger-strong">
            {t.wbPbiNone}
          </p>
        ) : !items ? (
          <p role="status" className="flex items-center gap-2 text-body text-fg-muted">
            <Spinner size="xs" />
            {t.loading}
          </p>
        ) : items.length === 0 ? (
          <p role="status" className="text-body text-fg-muted">
            {t.wbPbiNone}
          </p>
        ) : (
          <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto rounded-ui-md border border-border">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onPick(item)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-sunken focus-visible:bg-primary-soft">
                  <span className="shrink-0 font-mono text-caption text-fg-muted">#{item.displayId}</span>
                  <span className="min-w-0 flex-1 text-body text-fg">
                    {item.title || "—"}
                    {item.confidential && <span className="ml-1 text-caption text-danger-strong">({t.wbPbiConfidential})</span>}
                  </span>
                  <span className="shrink-0 text-caption text-fg-muted">{status(item.status)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
