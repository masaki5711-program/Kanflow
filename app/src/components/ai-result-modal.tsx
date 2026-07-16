"use client"

import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { useOverlayClose } from "@/lib/use-overlay-close"

interface Props {
  title: string
  /**
   * Async generator that the modal will iterate to receive streaming chunks.
   * The modal handles fetch + streaming itself; consumer just provides the URL + body.
   */
  fetchUrl: string
  fetchBody: unknown
  onClose: () => void
  /**
   * Optional footer slot, e.g., "use this draft" / "add to KPT" buttons.
   * Receives the full streamed text once complete.
   */
  footer?: (fullText: string, done: boolean) => React.ReactNode
}

/**
 * Generic modal that POSTs to an AI endpoint and streams the response into the body.
 * Used by INVEST review, retro synthesis, progress report, etc.
 */
export function AIResultModal({ title, fetchUrl, fetchBody, onClose, footer }: Props) {
  const { t } = useLanguage()
  const [text, setText] = useState("")
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const acRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ac = new AbortController()
    acRef.current = ac
    setText("")
    setDone(false)
    setError(null)

    ;(async () => {
      try {
        const res = await fetch(fetchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fetchBody),
          signal: ac.signal,
        })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ""
        while (true) {
          const { done: rdone, value } = await reader.read()
          if (rdone) break
          acc += decoder.decode(value, { stream: true })
          setText(acc)
        }
        setDone(true)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(t.aiFailed)
      }
    })()

    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUrl, JSON.stringify(fetchBody)])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [text])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function copyToClipboard() {
    if (!text) return
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const overlay = useOverlayClose(onClose)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      {...overlay}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-purple-600">🤖</span>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : !text ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                <span
                  className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse"
                  style={{ animationDelay: "0.3s" }}
                />
              </span>
              <span>{t.aiThinking}</span>
            </div>
          ) : (
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{text}</div>
          )}
          {done && (
            <p className="mt-4 text-[11px] text-gray-400">{t.aiResultDisclaimer}</p>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/60 rounded-b-2xl">
          {footer?.(text, done)}
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!text}
            className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
          >
            {t.aiCopy}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  )
}
