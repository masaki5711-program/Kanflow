"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { extractPartialArrayObjects, type PartialJsonObject } from "@/lib/streaming-json-array"
import { useOverlayClose } from "@/lib/use-overlay-close"

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
  const ws = typeof f.workloadScore === "number" ? f.workloadScore : null
  return {
    initiative: asString(f.initiative),
    epic: asString(f.epic),
    userStory: asString(f.userStory),
    acceptanceCriteria: asString(f.acceptanceCriteria),
    workloadScore: ws,
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

export function PbiDraftPickerModal({ projectId, iceboxItemId, onClose, onPick }: Props) {
  const { t, language } = useLanguage()
  const [drafts, setDrafts] = useState<DraftView[]>([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    setError(null)
    setDrafts([])
    setDone(false)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/icebox/${iceboxItemId}/ai/generate-pbi-draft`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lang: language }),
            signal: ac.signal,
          }
        )
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
        }
        if (!res.body) throw new Error("no response body")

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        while (true) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break
          buf += decoder.decode(value, { stream: true })
          if (buf.includes("[error]")) throw new Error(`stream_error: ${buf.slice(-200)}`)
          const parsed = extractPartialArrayObjects(buf, "drafts")
          if (parsed.length > 0) setDrafts(parsed.map(toView))
        }
        const final = extractPartialArrayObjects(buf, "drafts")
        if (final.length > 0) setDrafts(final.map(toView))
        setDone(true)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        const msg = err instanceof Error ? err.message : String(err)
        setError(`${t.aiFailed} (${msg})`)
      }
    })()
    return () => ac.abort()
  }, [projectId, iceboxItemId, t.aiFailed, language])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const slots: (DraftView | null)[] = [drafts[0] ?? null, drafts[1] ?? null, drafts[2] ?? null]
  const overlay = useOverlayClose(onClose)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      {...overlay}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-purple-600">🤖</span>
            <h3 className="text-lg font-bold text-gray-900">{t.aiPbiDraftTitle}</h3>
            {!done && !error && (
              <span className="inline-flex gap-1 ml-2 self-center" aria-label="generating">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
                <span
                  className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"
                  style={{ animationDelay: "0.3s" }}
                />
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
            title={t.close}
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {error ? (
            <p className="text-sm text-red-500 whitespace-pre-wrap break-all">{error}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {slots.map((d, i) => (
                  <DraftCard
                    key={i}
                    index={i}
                    view={d}
                    canPick={done && d !== null && d.closed}
                    onPick={() => d && onPick(viewToDraft(d))}
                    rationaleLabel={t.aiPbiDraftRationale}
                    pickLabel={t.aiUseThisDraft}
                  />
                ))}
              </div>
              {done && drafts.length > 0 && (
                <p className="mt-4 text-[11px] text-gray-400">{t.aiResultDisclaimer}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface CardProps {
  index: number
  view: DraftView | null
  canPick: boolean
  onPick: () => void
  rationaleLabel: string
  pickLabel: string
}

function DraftCard({ index, view, canPick, onPick, rationaleLabel, pickLabel }: CardProps) {
  const empty = view === null
  return (
    <article
      className={
        "rounded-xl p-4 flex flex-col gap-2 transition-all " +
        (empty
          ? "bg-gray-50 border border-dashed border-gray-200"
          : "bg-white border border-gray-200 hover:border-purple-300 hover:shadow-sm")
      }
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
          Draft #{index + 1}
        </span>
        {view && view.workloadScore !== null ? (
          <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
            {snapWorkload(view.workloadScore)} SP
          </span>
        ) : (
          <span className="bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">…</span>
        )}
      </div>

      <h4 className="text-sm font-semibold text-gray-900 leading-tight min-h-[1.25rem]">
        {view?.initiative ?? ""}
        {view && !view.closed && view.initiative && !view.epic && <Caret />}
      </h4>

      <div className="text-[11px] text-gray-500 inline-flex items-center gap-1 min-h-[1.25rem]">
        <span>Epic:</span>
        <span className="bg-gray-50 text-gray-700 px-1.5 py-0.5 rounded">
          {view?.epic ?? ""}
          {view && !view.closed && view.epic && !view.userStory && <Caret />}
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-blue-50/50 border border-blue-100 rounded-lg p-2 whitespace-pre-wrap leading-relaxed min-h-[3.5rem]">
        <p className="text-[10px] font-semibold text-blue-700 mb-0.5">User Story</p>
        {view?.userStory ?? ""}
        {view && !view.closed && view.userStory && !view.acceptanceCriteria && <Caret />}
      </div>

      <div className="text-xs text-gray-700 bg-emerald-50/50 border border-emerald-100 rounded-lg p-2 whitespace-pre-wrap leading-relaxed min-h-[4rem]">
        <p className="text-[10px] font-semibold text-emerald-700 mb-0.5">受入条件</p>
        {view?.acceptanceCriteria ?? ""}
        {view && !view.closed && view.acceptanceCriteria && view.workloadScore === null && <Caret />}
      </div>

      <p className="text-[11px] text-gray-500 italic mt-1 min-h-[1.25rem]">
        {view?.rationale ? (
          <>
            <span className="font-semibold not-italic text-gray-600">{rationaleLabel}: </span>
            {view.rationale}
            {view && !view.closed && <Caret />}
          </>
        ) : null}
      </p>

      <button
        type="button"
        onClick={onPick}
        disabled={!canPick}
        className={
          "mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors " +
          (canPick
            ? "bg-purple-600 text-white hover:bg-purple-700"
            : "bg-gray-100 text-gray-400 cursor-not-allowed")
        }
      >
        {pickLabel}
      </button>
    </article>
  )
}

function Caret() {
  return (
    <span className="inline-block w-[2px] h-[1em] bg-gray-400 align-text-bottom animate-pulse ml-[1px]" />
  )
}
