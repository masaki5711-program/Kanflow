"use client"

import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { extractPartialArrayObjects, type PartialJsonObject } from "@/lib/streaming-json-array"
import { Button, Modal, useToast } from "@/components/ui"
import { apiFetch, emitActivity } from "@/hooks"

export interface PbiDraft {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: number
  rationale: string
}

interface Props {
  projectId: string
  iceboxItemId: string
  onClose: () => void
  onPick: (draft: PbiDraft) => void
  /** Called after a draft is saved as a new Icebox item (parent refetches its list). */
  onAddedToIcebox?: () => void
}

interface DraftView {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: number | null
  rationale: string
  closed: boolean
}

const SP_SCALE = [0, 1, 2, 3, 5, 8, 13, 21] as const
const SLOT_COUNT = 3
const MAX_ERROR_BODY = 200

function snapWorkload(n: number): number {
  let best: number = SP_SCALE[0]
  let bestDist = Math.abs(n - best)
  for (const v of SP_SCALE) {
    const d = Math.abs(n - v)
    if (d < bestDist) {
      best = v
      bestDist = d
    }
  }
  return best
}

function asString(v: unknown): string {
  if (typeof v === "string") return v
  if (Array.isArray(v)) {
    return v
      .map((item, idx) => {
        const s = typeof item === "string" ? item : JSON.stringify(item)
        // If the model already prefixed items with bullets/numbers leave them
        // alone; otherwise add a numeric prefix for readability.
        return /^(\s*[-•*\d])/.test(s) ? s : `${idx + 1}. ${s}`
      })
      .join("\n")
  }
  return ""
}

function toView(obj: PartialJsonObject): DraftView {
  const f = obj.fields
  return {
    initiative: asString(f.initiative),
    epic: asString(f.epic),
    userStory: asString(f.userStory),
    acceptanceCriteria: asString(f.acceptanceCriteria),
    workloadScore: typeof f.workloadScore === "number" ? f.workloadScore : null,
    rationale: asString(f.rationale),
    closed: obj.closed,
  }
}

function viewToDraft(v: DraftView): PbiDraft {
  return {
    initiative: v.initiative,
    epic: v.epic,
    userStory: v.userStory,
    acceptanceCriteria: v.acceptanceCriteria,
    workloadScore: snapWorkload(v.workloadScore ?? 0),
    rationale: v.rationale,
  }
}

/**
 * Streams three AI-generated PBI drafts for an IceBox item. The generation
 * starts on mount (render it with `key={iceboxItemId}`) and is aborted when
 * the dialog closes.
 */
function useDraftStream(projectId: string, iceboxItemId: string) {
  const { t, language } = useLanguage()
  const [drafts, setDrafts] = useState<DraftView[]>([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Language/labels at the time the dialog opened; a later UI language switch
  // must not restart (and discard) a running generation.
  const startRef = useRef({ language, aiFailed: t.aiFailed })

  useEffect(() => {
    const ac = new AbortController()
    const { language: lang, aiFailed } = startRef.current
    emitActivity()
    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/icebox/${iceboxItemId}/ai/generate-pbi-draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang }),
          signal: ac.signal,
        })
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status}: ${body.slice(0, MAX_ERROR_BODY)}`)
        }
        if (!res.body) throw new Error("no response body")
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        while (true) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break
          buf += decoder.decode(value, { stream: true })
          if (buf.includes("[error]")) throw new Error(`stream_error: ${buf.slice(-MAX_ERROR_BODY)}`)
          const parsed = extractPartialArrayObjects(buf, "drafts")
          if (parsed.length > 0) setDrafts(parsed.map(toView))
        }
        const final = extractPartialArrayObjects(buf, "drafts")
        if (final.length > 0) setDrafts(final.map(toView))
        setDone(true)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        const msg = err instanceof Error ? err.message : String(err)
        setError(`${aiFailed} (${msg})`)
      }
    })()
    return () => ac.abort()
  }, [projectId, iceboxItemId])

  return { drafts, done, error }
}

export function PbiDraftPickerModal({ projectId, iceboxItemId, onClose, onPick, onAddedToIcebox }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const { drafts, done, error } = useDraftStream(projectId, iceboxItemId)
  // One PBI is picked from the 3 drafts, but the runner-up ideas are often
  // worth keeping — each card can also be saved back as a new Icebox item.
  const [addedToIcebox, setAddedToIcebox] = useState<number[]>([])
  const [addingIndex, setAddingIndex] = useState<number | null>(null)

  // The dialog can be closed while the POST is in flight; don't touch state
  // or notify the parent after unmount.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  async function handleAddToIcebox(index: number, view: DraftView) {
    if (addingIndex !== null || addedToIcebox.includes(index)) return
    setAddingIndex(index)
    try {
      const request = [view.initiative, view.userStory].filter(Boolean).join("\n")
      const background = [view.rationale, view.acceptanceCriteria].filter(Boolean).join("\n\n")
      await apiFetch(`/api/projects/${projectId}/icebox`, {
        method: "POST",
        json: { request, background: background || undefined },
      })
      if (!aliveRef.current) return
      setAddedToIcebox((prev) => [...prev, index])
      onAddedToIcebox?.()
      toast.success(t.aiDraftAddedToIcebox)
    } catch (err) {
      if (aliveRef.current) toast.error(err instanceof Error ? err.message : String(err), { title: t.aiFailed })
    } finally {
      if (aliveRef.current) setAddingIndex(null)
    }
  }

  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => drafts[i] ?? null)
  const isGenerating = !done && !error

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="text-purple-600">🤖</span>
          {t.aiPbiDraftTitle}
          {isGenerating && <GeneratingDots />}
        </span>
      }
    >
      <p className="sr-only" role="status" aria-live="polite">
        {isGenerating ? t.aiGenerating : done ? t.aiPbiDraftTitle : ""}
      </p>
      {error ? (
        <p role="alert" className="whitespace-pre-wrap break-all text-body text-danger">
          {error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {slots.map((d, i) => (
              <DraftCard
                // Fixed slots: position is the identity of each draft.
                key={`slot-${i}`}
                index={i}
                view={d}
                canPick={done && d !== null && d.closed}
                onPick={() => d && onPick(viewToDraft(d))}
                iceboxLabel={
                  addedToIcebox.includes(i) ? t.aiDraftAddedToIcebox : t.aiAddDraftToIcebox
                }
                iceboxBusy={addingIndex === i}
                iceboxDisabled={addedToIcebox.includes(i) || addingIndex !== null}
                onAddToIcebox={() => d && handleAddToIcebox(i, d)}
              />
            ))}
          </div>
          {done && drafts.length > 0 && <p className="mt-4 text-caption text-fg-muted">{t.aiResultDisclaimer}</p>}
        </>
      )}
    </Modal>
  )
}

function GeneratingDots() {
  return (
    <span className="ml-1 inline-flex gap-1 self-center" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" style={{ animationDelay: "0.15s" }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" style={{ animationDelay: "0.3s" }} />
    </span>
  )
}

interface CardProps {
  index: number
  view: DraftView | null
  canPick: boolean
  onPick: () => void
  iceboxLabel: string
  iceboxBusy: boolean
  iceboxDisabled: boolean
  onAddToIcebox: () => void
}

function DraftCard({ index, view, canPick, onPick, iceboxLabel, iceboxBusy, iceboxDisabled, onAddToIcebox }: CardProps) {
  const { t, pt } = useLanguage()
  const empty = view === null
  const streaming = view !== null && !view.closed
  return (
    <article
      aria-busy={empty || streaming || undefined}
      className={
        "flex flex-col gap-2 rounded-ui-lg p-4 " +
        (empty ? "border border-dashed border-border bg-surface-muted" : "border border-border bg-surface hover:border-purple-300 hover:shadow-ui-sm")
      }
    >
      <div className="flex items-center justify-between text-caption">
        <span className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-fg-muted">
          {t.backlogDraftLabel.replace("{n}", String(index + 1))}
        </span>
        {view && view.workloadScore !== null ? (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-orange-800">{snapWorkload(view.workloadScore)} SP</span>
        ) : (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-fg-muted" aria-hidden="true">…</span>
        )}
      </div>

      <h3 className="min-h-[1.25rem] text-body font-semibold leading-tight text-fg">
        {view?.initiative ?? ""}
        {streaming && view.initiative && !view.epic && <Caret />}
      </h3>

      <div className="inline-flex min-h-[1.25rem] items-center gap-1 text-caption text-fg-muted">
        <span>{pt.backlogEpic}:</span>
        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-fg">
          {view?.epic ?? ""}
          {streaming && view.epic && !view.userStory && <Caret />}
        </span>
      </div>

      <div className="min-h-[3.5rem] whitespace-pre-wrap rounded-ui-md border border-primary-soft bg-primary-soft/30 p-2 text-caption leading-relaxed text-fg">
        <p className="mb-0.5 font-semibold text-primary-active">{pt.backlogUserStory}</p>
        {view?.userStory ?? ""}
        {streaming && view.userStory && !view.acceptanceCriteria && <Caret />}
      </div>

      <div className="min-h-[4rem] whitespace-pre-wrap rounded-ui-md border border-emerald-100 bg-emerald-50/50 p-2 text-caption leading-relaxed text-fg">
        <p className="mb-0.5 font-semibold text-emerald-800">{pt.backlogAcceptanceCriteria}</p>
        {view?.acceptanceCriteria ?? ""}
        {streaming && view.acceptanceCriteria && view.workloadScore === null && <Caret />}
      </div>

      <p className="mt-1 min-h-[1.25rem] text-caption italic text-fg-muted">
        {view?.rationale ? (
          <>
            <span className="font-semibold not-italic text-fg">{t.aiPbiDraftRationale}: </span>
            {view.rationale}
            {streaming && <Caret />}
          </>
        ) : null}
      </p>

      <Button size="sm" onClick={onPick} disabled={!canPick} className="mt-2">
        {t.aiUseThisDraft}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onAddToIcebox}
        disabled={!canPick || iceboxDisabled}
        loading={iceboxBusy}
        leftIcon={<span aria-hidden="true">🧊</span>}
      >
        {iceboxLabel}
      </Button>
    </article>
  )
}

function Caret() {
  return <span aria-hidden="true" className="ml-[1px] inline-block h-[1em] w-[2px] animate-pulse bg-fg-subtle align-text-bottom" />
}
