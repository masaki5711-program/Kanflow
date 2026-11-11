"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PenTool } from "lucide-react"
import { apiFetch } from "@/hooks"
import { elementFromData, type BoardElement, type StoredElement } from "@/lib/board/model"
import { useLanguage } from "@/lib/language-context"
import { boardFileUrl, sheetUrl } from "./board-api"
import { BoardRenderContextValue, type BoardRenderContext } from "./element-view"
import { SheetPreview } from "./sheet-preview"

interface LinkedBoard {
  boardId: string
  boardTitle: string
  sheetId: string
  sheetName: string
  elementId: string
}

/** How many linked sheets are drawn as a preview (the rest are links only). */
const PREVIEWS = 2

/**
 * In a PBI's detail: the White Board shapes that stand for it — a picture of the sheet around the shape and a link
 * that opens the board on it. Hidden for people who cannot see boards, and while there are none.
 */
export function PbiBoardsSection({ projectId, pbiId }: { projectId: string; pbiId: string }) {
  const { t } = useLanguage()
  const [links, setLinks] = useState<LinkedBoard[] | null>(null)

  useEffect(() => {
    let live = true
    apiFetch<{ links: LinkedBoard[] }>(`/api/projects/${projectId}/backlog/${pbiId}/boards`)
      .then((body) => {
        if (live) setLinks(body.links)
      })
      .catch(() => {
        // No board access (403) or a failed read: the section is simply not shown.
        if (live) setLinks([])
      })
    return () => {
      live = false
    }
  }, [projectId, pbiId])

  if (!links || links.length === 0) return null
  return (
    <section aria-label={t.wbLinkedBoardsTitle} className="space-y-2" data-testid="pbi-boards">
      <h3 className="flex items-center gap-1.5 text-body font-semibold text-fg">
        <PenTool aria-hidden className="h-4 w-4 text-fg-muted" />
        {t.wbLinkedBoardsTitle}
      </h3>
      <ul className="space-y-3">
        {links.map((link, i) => {
          const href = `/projects/${encodeURIComponent(projectId)}/boards/${encodeURIComponent(link.boardId)}?sheet=${encodeURIComponent(link.sheetId)}&element=${encodeURIComponent(link.elementId)}`
          const name = t.wbLinkedBoardsOpen.replace("{board}", link.boardTitle).replace("{sheet}", link.sheetName)
          return (
            <li key={`${link.sheetId}:${link.elementId}`} className="space-y-1">
              <Link href={href} className="text-body text-primary-strong underline-offset-2 hover:underline">
                {name}
              </Link>
              {i < PREVIEWS && <LinkedSheetPreview projectId={projectId} link={link} label={name} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function LinkedSheetPreview({ projectId, link, label }: { projectId: string; link: LinkedBoard; label: string }) {
  const { t } = useLanguage()
  const [elements, setElements] = useState<Record<string, BoardElement> | null>(null)
  useEffect(() => {
    let live = true
    apiFetch<{ elements: StoredElement[] }>(`${sheetUrl(projectId, link.boardId, link.sheetId)}/elements`)
      .then((body) => {
        if (!live) return
        const map: Record<string, BoardElement> = {}
        for (const row of body.elements) if (!row.deleted) map[row.id] = elementFromData(row.id, row.data)
        setElements(map)
      })
      .catch(() => {
        if (live) setElements(null)
      })
    return () => {
      live = false
    }
  }, [projectId, link.boardId, link.sheetId])
  const context = useMemo<BoardRenderContext>(
    () => ({
      fileUrl: (fileId) => boardFileUrl(projectId, link.boardId, fileId),
      userId: null,
      linkLabel: (url) => url,
      imageAlt: t.wbImageAlt,
      timerLabels: { aria: t.wbTimerAria, done: t.wbTimerDone, budget: t.wbVoteBudget },
      pbi: () => null,
    }),
    [projectId, link.boardId, t],
  )
  if (!elements) return null
  return (
    <BoardRenderContextValue.Provider value={context}>
      <SheetPreview elements={elements} focusId={link.elementId} label={label} className="h-48 w-full rounded-ui-md border border-border bg-surface-sunken" />
    </BoardRenderContextValue.Provider>
  )
}
