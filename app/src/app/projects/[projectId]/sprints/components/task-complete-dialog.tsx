"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { BilingualButton } from "@/components/bilingual-button"
import { streamTranslate } from "@/lib/streaming-translate"
import { useOverlayClose } from "@/lib/use-overlay-close"

interface Props {
  taskName: string | null
  onCancel: () => void
  onConfirm: (comment: string) => void
}

export default function TaskCompleteDialog({ taskName, onCancel, onConfirm }: Props) {
  const { t } = useLanguage()
  const [comment, setComment] = useState("")
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  async function handleBilingualize() {
    if (!comment.trim() || translating) return
    setTranslating(true)
    try {
      await streamTranslate(comment.trim(), (acc) => setComment(acc))
    } catch {
      alert(t.bilingualizeFailed)
    } finally {
      setTranslating(false)
    }
  }

  const overlay = useOverlayClose(onCancel)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      {...overlay}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            {t.sprintTaskCompleteTitle}
          </h3>
          {taskName && (
            <p className="text-sm text-gray-500 mt-1 truncate">{taskName}</p>
          )}
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              {t.sprintTaskCompletionComment}
            </label>
            <BilingualButton
              onClick={handleBilingualize}
              disabled={!comment.trim()}
              translating={translating}
            />
          </div>
          <p className="text-xs text-gray-500">{t.sprintTaskCompleteHint}</p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-y"
          />
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/60 rounded-b-2xl">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm("")}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors"
          >
            {t.sprintTaskCompleteSkip}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(comment.trim())}
            disabled={!comment.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {t.sprintTaskCompleteTitle}
          </button>
        </div>
      </div>
    </div>
  )
}
