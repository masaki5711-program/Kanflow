"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { apiFetch } from "@/hooks"
import { elementFromData, isBox, isLine, type BoardElement, type StoredElement } from "@/lib/board/model"
import { useLanguage } from "@/lib/language-context"
import { Input, Modal, Spinner } from "@/components/ui"
import type { BoardSheetDto } from "./board-api"
import { kindName } from "./describe"

/** One place a search found its words. */
export interface SearchHit {
  sheetId: string
  sheetName: string
  elementId: string
  kind: string
  excerpt: string
}

/** Every text of an element a person can read: its text, a frame's body, a table's cells, a line's label. */
export function searchableText(el: BoardElement): string {
  if (isLine(el)) return el.label ?? ""
  if (!isBox(el)) return ""
  if (el.type === "table") return (el.cells ?? []).map((row) => row.join(" ")).join(" ")
  return [el.text, el.body ?? ""].filter(Boolean).join(" ")
}

const fold = (s: string) => s.normalize("NFKC").toLocaleLowerCase()

/** The elements of the sheets whose text holds every word of the query (case and width folded), sheet by sheet. */
export function searchSheets(query: string, sheets: readonly { id: string; name: string; elements: readonly BoardElement[] }[], kind: (el: BoardElement) => string, limit = 200): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits: SearchHit[] = []
  for (const sheet of sheets) {
    for (const el of sheet.elements) {
      const text = searchableText(el)
      const folded = fold(text)
      if (!text || !words.every((w) => folded.includes(w))) continue
      const at = Math.max(0, folded.indexOf(words[0]) - 20)
      const flat = text.replace(/\s+/g, " ")
      hits.push({ sheetId: sheet.id, sheetName: sheet.name, elementId: el.id, kind: kind(el), excerpt: (at > 0 ? "…" : "") + flat.slice(at, at + 80) + (flat.length > at + 80 ? "…" : "") })
      if (hits.length >= limit) return hits
    }
  }
  return hits
}

interface BoardSearchProps {
  elementsUrl: (sheetId: string) => string
  sheets: readonly BoardSheetDto[]
  onPick: (hit: SearchHit) => void
  onClose: () => void
}

/** Searches the text of every sheet of the board (read once when opened) and goes to what is picked. */
export function BoardSearch({ elementsUrl, sheets, onPick, onClose }: BoardSearchProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [loaded, setLoaded] = useState<{ id: string; name: string; elements: BoardElement[] }[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const listId = useId()

  useEffect(() => {
    let live = true
    Promise.all(
      sheets.map(async (sheet) => {
        const body = await apiFetch<{ elements: StoredElement[] }>(elementsUrl(sheet.id))
        return { id: sheet.id, name: sheet.name, elements: body.elements.filter((row) => !row.deleted).map((row) => elementFromData(row.id, row.data)) }
      }),
    )
      .then((all) => {
        if (live) setLoaded(all)
      })
      .catch((error: unknown) => {
        if (live) setFailed(error instanceof Error && error.message ? error.message : t.wbSearchNone)
      })
    return () => {
      live = false
    }
    // Read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hits = useMemo(() => (loaded ? searchSheets(query, loaded, (el) => kindName(el, t)) : []), [loaded, query, t])

  return (
    <Modal open onClose={onClose} title={t.wbSearchLabel} size="md">
      <div className="space-y-3" data-testid="board-search">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <Input
            data-autofocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.wbSearchPlaceholder}
            aria-label={t.wbSearchPlaceholder}
            aria-controls={listId}
            className="pl-8"
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                e.preventDefault()
                onPick(hits[0])
              }
            }}
          />
        </div>
        {failed ? (
          <p role="alert" className="text-body text-danger-strong">
            {failed}
          </p>
        ) : !loaded ? (
          <p role="status" className="flex items-center gap-2 text-body text-fg-muted">
            <Spinner size="xs" />
            {t.wbSearchLoading}
          </p>
        ) : (
          <>
            <p role="status" className="text-caption text-fg-muted">
              {query.trim() === "" ? "" : hits.length === 0 ? t.wbSearchNone : t.wbSearchCount.replace("{count}", String(hits.length))}
            </p>
            <ul id={listId} className="max-h-[50dvh] divide-y divide-border overflow-y-auto rounded-ui-md border border-border empty:hidden">
              {hits.map((hit) => (
                <li key={`${hit.sheetId}:${hit.elementId}`}>
                  <button type="button" onClick={() => onPick(hit)} className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-sunken focus-visible:bg-primary-soft">
                    <span className="text-caption text-fg-muted">
                      {hit.sheetName} · {hit.kind}
                    </span>
                    <span className="text-body text-fg">{hit.excerpt}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}
