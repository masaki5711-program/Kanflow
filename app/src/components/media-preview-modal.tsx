"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useOverlayClose } from "@/lib/use-overlay-close"
import { useBodyScrollLock, useFocusTrap } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { useOptionalToast } from "@/components/ui"

export interface MediaItem {
  id: string
  originalName: string
  mimeType: string
  /** Optional explicit URL. Falls back to `/api/projects/{projectId}/attachments/{id}` when projectId is supplied. */
  url?: string
}

interface Props {
  /** Fallback projectId used when MediaItem.url is not provided. */
  projectId?: string
  items: MediaItem[]
  startIndex: number
  onClose: () => void
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/")
}
function isVideo(mime: string): boolean {
  return mime.startsWith("video/")
}
function isAudio(mime: string): boolean {
  return mime.startsWith("audio/")
}

/**
 * Full-screen media viewer. For images, prev/next within the same set.
 * For videos/audios, uses native HTML5 controls (the GET endpoint serves
 * 206 partial content so seeking/streaming works).
 */
export default function MediaPreviewModal({ projectId, items, startIndex, onClose }: Props) {
  const { t } = useLanguage()
  const toast = useOptionalToast()
  const [index, setIndex] = useState(() => Math.max(0, Math.min(startIndex, items.length - 1)))
  const containerRef = useRef<HTMLDivElement>(null)
  const current = items[index]

  // Images can navigate prev/next within the passed set. Videos/audio don't.
  const imageItems = useMemo(() => items.filter((it) => isImage(it.mimeType)), [items])
  const imageIndex = useMemo(() => imageItems.findIndex((it) => it.id === current?.id), [imageItems, current])
  const canNav = current && isImage(current.mimeType) && imageItems.length > 1
  // Hooks must run before any early return below (rules-of-hooks).
  const overlay = useOverlayClose(onClose)
  // Keep keyboard focus inside the viewer; Escape is handled by the trap
  // (top-most layer only) so a confirm stacked above keeps working.
  useFocusTrap(containerRef, true, { onEscape: onClose })
  useBodyScrollLock(true)

  const goto = useCallback((delta: number) => {
    if (!canNav) return
    const newImgIdx = (imageIndex + delta + imageItems.length) % imageItems.length
    const targetId = imageItems[newImgIdx].id
    const newIdx = items.findIndex((it) => it.id === targetId)
    if (newIdx >= 0) setIndex(newIdx)
  }, [canNav, imageIndex, imageItems, items])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const onFail = () => toast?.error(t.dashboardMediaFullscreenFailed)
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(onFail)
    } else {
      document.exitFullscreen?.().catch(onFail)
    }
  }, [toast, t])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goto(1)
      else if (e.key === "ArrowLeft") goto(-1)
      else if (e.key.toLowerCase() === "f") toggleFullscreen()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goto, toggleFullscreen])

  if (!current) return null
  const baseUrl = current.url ?? (projectId ? `/api/projects/${projectId}/attachments/${current.id}` : "")
  if (!baseUrl) return null
  const src = baseUrl
  const sep = baseUrl.includes("?") ? "&" : "?"
  // A local object URL (a file chosen but not uploaded yet) takes no query string.
  const downloadUrl = baseUrl.startsWith("blob:") ? baseUrl : `${baseUrl}${sep}download=1`

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.originalName}
      tabIndex={-1}
      className="fixed inset-0 z-[110] bg-black/90 flex flex-col outline-none"
      {...overlay}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 text-white shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" title={current.originalName}>{current.originalName}</p>
          {canNav && (
            <p aria-live="polite" className="text-xs text-white/75 mt-0.5">
              {imageIndex + 1} / {imageItems.length}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <a
            href={downloadUrl}
            download={current.originalName}
            className="inline-flex items-center gap-1 min-h-9 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
            {t.dashboardDownload}
          </a>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title={t.dashboardMediaFullscreen}
            aria-label={t.dashboardMediaFullscreen}
          >
            <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 11-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title={`${t.close} (Esc)`}
            aria-label={t.close}
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {canNav && (
          <button
            type="button"
            onClick={() => goto(-1)}
            className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
            title={t.dashboardMediaPrev}
            aria-label={t.dashboardMediaPrev}
          >
            <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
        )}

        <div className="w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          {isImage(current.mimeType) ? (
            // Auth-protected attachment stream: next/image optimisation can't proxy it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.id}
              src={src}
              alt={current.originalName}
              className="max-w-full max-h-full object-contain"
            />
          ) : isVideo(current.mimeType) ? (
            <video
              key={current.id}
              src={src}
              controls
              autoPlay
              className="max-w-full max-h-full"
              preload="metadata"
            >
              {t.dashboardMediaVideoUnsupported}
            </video>
          ) : isAudio(current.mimeType) ? (
            <div className="bg-white/5 rounded-xl p-6 max-w-xl w-full">
              <p className="text-white text-sm mb-4 text-center">{current.originalName}</p>
              <audio key={current.id} src={src} controls autoPlay className="w-full" />
            </div>
          ) : (
            <div className="text-white/75 text-sm">{t.dashboardMediaNoPreview}</div>
          )}
        </div>

        {canNav && (
          <button
            type="button"
            onClick={() => goto(1)}
            className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
            title={t.dashboardMediaNext}
            aria-label={t.dashboardMediaNext}
          >
            <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
