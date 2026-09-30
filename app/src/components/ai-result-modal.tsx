"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Button, Modal, VisuallyHidden, useModalClose, useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { emitActivity } from "@/hooks/activity"
import { ReportDocument, normalizeStructured } from "@/components/structured-report-document"
import { structuredReportToMarkdown } from "@/lib/report-markdown"
import { extractPartialObject } from "@/lib/streaming-json-array"
import type { StructuredReport } from "@/lib/report-tool"

interface Props {
  title: string
  /** Endpoint that streams the AI response; the modal POSTs `fetchBody` as JSON. */
  fetchUrl: string
  fetchBody: unknown
  onClose: () => void
  /**
   * Structured-report mode: the endpoint streams a StructuredReport-shaped
   * JSON object; the modal incrementally parses it and live-renders the
   * formal report document section by section as tokens arrive.
   * `triggerLabel` fills the report's meta table.
   */
  structured?: boolean
  triggerLabel?: string
  /**
   * Optional footer slot, e.g., "use this draft" / "add to KPT" buttons.
   * Receives the full streamed text once complete.
   */
  footer?: (fullText: string, done: boolean) => ReactNode
}

/**
 * Generic modal that POSTs to an AI endpoint and streams the response into the body.
 * Used by INVEST review, retro synthesis, progress report, etc.
 */
export function AIResultModal({ title, fetchUrl, fetchBody, onClose, structured = false, triggerLabel, footer }: Props) {
  const bodyJson = JSON.stringify(fetchBody)
  // A new request (URL/body/mode) remounts the stream so its state starts fresh.
  return (
    <AIResultStream
      key={`${fetchUrl}|${bodyJson}|${structured}`}
      title={title}
      fetchUrl={fetchUrl}
      bodyJson={bodyJson}
      onClose={onClose}
      structured={structured}
      triggerLabel={triggerLabel}
      footer={footer}
    />
  )
}

interface StreamState {
  text: string
  report: StructuredReport | null
  generatedAt: Date | null
  done: boolean
  failed: boolean
  /** HTTP status of a refused request (e.g. 403 = no permission), null otherwise. */
  failedStatus: number | null
  /** Stopped by the user (Cancel). */
  cancelled: boolean
  /** No token yet after MODEL_LOAD_HINT_MS — the model is most likely still loading. */
  slowStart: boolean
}

const INITIAL: StreamState = {
  text: "",
  report: null,
  generatedAt: null,
  done: false,
  failed: false,
  failedStatus: null,
  cancelled: false,
  slowStart: false,
}

/** Thrown for a non-OK response so the modal can tell "no permission" from other failures. */
class StreamHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

/**
 * After this long without a first token, tell the user the model is loading.
 * Ollama needs ~8-10s to swap models when another app used a different one.
 */
export const MODEL_LOAD_HINT_MS = 3000

interface AiStream extends StreamState {
  cancel: () => void
  retry: () => void
}

function useAiStream(fetchUrl: string, bodyJson: string, structured: boolean): AiStream {
  const [state, setState] = useState<StreamState>(INITIAL)
  // Bumped by retry(): re-runs the effect, which starts a fresh request.
  const [attempt, setAttempt] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    abortRef.current = ac
    let gotToken = false
    const slowTimer = setTimeout(() => {
      if (!gotToken) setState((s) => ({ ...s, slowStart: true }))
    }, MODEL_LOAD_HINT_MS)
    // Streaming responses can't go through apiFetch; signal activity so the
    // idle-logout watcher counts the request (and its completion) as use.
    emitActivity()
    ;(async () => {
      try {
        const res = await fetch(fetchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyJson,
          signal: ac.signal,
        })
        if (!res.ok || !res.body) throw new StreamHttpError(res.status)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          if (!gotToken && acc) {
            gotToken = true
            clearTimeout(slowTimer)
          }
          // Live-render the report document as the JSON streams in:
          // sections appear one by one while the model is still writing.
          const partial = structured ? extractPartialObject(acc) : null
          const rep = partial ? normalizeStructured(partial.fields) : null
          const text = acc
          setState((s) => ({ ...s, text, report: rep ?? s.report, slowStart: false }))
        }
        let finalReport: StructuredReport | null = null
        if (structured) {
          // Final strict parse for fidelity; keep the last partial on failure.
          try {
            finalReport = normalizeStructured(JSON.parse(acc))
          } catch {
            finalReport = null
          }
        }
        emitActivity()
        setState((s) => ({
          ...s,
          report: finalReport ?? s.report,
          generatedAt: structured ? new Date() : s.generatedAt,
          done: true,
          slowStart: false,
        }))
      } catch (err) {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return
        const failedStatus = err instanceof StreamHttpError ? err.status : null
        setState((s) => ({ ...s, failed: true, failedStatus, slowStart: false }))
      } finally {
        clearTimeout(slowTimer)
      }
    })()
    return () => {
      clearTimeout(slowTimer)
      ac.abort()
    }
  }, [fetchUrl, bodyJson, structured, attempt])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState((s) => (s.done || s.failed ? s : { ...s, cancelled: true, slowStart: false }))
  }, [])

  const retry = useCallback(() => {
    setState(INITIAL)
    setAttempt((n) => n + 1)
  }, [])

  return { ...state, cancel, retry }
}

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-body text-fg-muted">
      <span aria-hidden="true" className="inline-flex gap-1">
        <span className="w-1.5 h-1.5 bg-fg-subtle rounded-full animate-pulse" />
        <span className="w-1.5 h-1.5 bg-fg-subtle rounded-full animate-pulse [animation-delay:0.15s]" />
        <span className="w-1.5 h-1.5 bg-fg-subtle rounded-full animate-pulse [animation-delay:0.3s]" />
      </span>
      <span>{label}</span>
    </div>
  )
}

function CloseButton() {
  const { t } = useLanguage()
  const close = useModalClose()
  return <Button variant="secondary" size="sm" onClick={close}>{t.close}</Button>
}

function AIResultStream({ title, fetchUrl, bodyJson, onClose, structured, triggerLabel, footer }: Omit<Props, "fetchBody"> & { bodyJson: string; structured: boolean }) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const { text, report, generatedAt, done, failed, failedStatus, cancelled, slowStart, cancel, retry } = useAiStream(
    fetchUrl,
    bodyJson,
    structured,
  )
  const stopped = failed || cancelled
  const isRunning = !done && !stopped
  const endRef = useRef<HTMLDivElement>(null)

  // Keep the newest streamed content in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [text])

  async function copyToClipboard() {
    // Structured reports copy as readable markdown, not the raw JSON stream.
    const out = report ? structuredReportToMarkdown(report, language) : text
    if (!out) return
    try {
      await navigator.clipboard.writeText(out)
      toast.success(t.aiReportCopied)
    } catch {
      toast.error(t.aiReportCopyFailed)
    }
  }

  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"
  const waitingLabel = slowStart ? t.aiLoadingModel : t.aiThinking
  const isForbidden = failedStatus === 403
  // A failure is announced once, by the visible role="alert" below (not also by the status region).
  const status = failed
    ? ""
    : cancelled
      ? t.aiCancelled
      : done
        ? t.aiReportGenerationDone
        : waitingLabel

  let body: ReactNode
  if (stopped) {
    body = (
      <div className="space-y-3">
        {failed ? (
          <p role="alert" className="text-body text-danger">{isForbidden ? t.apiErrForbidden : t.aiFailed}</p>
        ) : (
          <p className="text-body text-fg-muted">{t.aiCancelled}</p>
        )}
        {text && !report && <div className="text-body text-fg whitespace-pre-wrap leading-relaxed">{text}</div>}
        {/* Retrying cannot help without the permission. */}
        {!isForbidden && <Button variant="primary" size="sm" onClick={retry}>{t.errorRetry}</Button>}
      </div>
    )
  } else if (report) {
    body = (
      <>
        <ReportDocument
          report={report}
          docTitle={title}
          trigger={triggerLabel ?? title}
          createdAt={(generatedAt ?? new Date()).toLocaleString(locale, {
            year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })}
          t={t}
        />
        {!done && <div className="mt-3"><ThinkingIndicator label={waitingLabel} /></div>}
      </>
    )
  } else if (!text || (structured && !done)) {
    // Raw JSON is accumulating but no renderable fields yet — keep the
    // indicator instead of dumping JSON tokens on the user.
    body = <ThinkingIndicator label={waitingLabel} />
  } else {
    body = <div className="text-body text-fg whitespace-pre-wrap leading-relaxed">{text}</div>
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><span aria-hidden="true">🤖</span>{title}</span>}
      size={structured ? "xl" : "lg"}
      // Read-only viewer: backdrop click closes it — but only once generation finished,
      // so a stray click never throws away a running AI stream.
      closeOnOverlayClick={!isRunning}
      footer={
        <>
          {footer?.(text, done)}
          {isRunning && (
            <Button variant="secondary" size="sm" onClick={cancel}>
              {t.aiCancel}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={copyToClipboard} disabled={!text}>
            {t.aiCopy}
          </Button>
          <CloseButton />
        </>
      }
    >
      <VisuallyHidden>
        <span role="status" aria-live="polite">{status}</span>
      </VisuallyHidden>
      <div aria-busy={isRunning}>{body}</div>
      {done && <p className="mt-4 text-caption text-fg-muted">{t.aiResultDisclaimer}</p>}
      <div ref={endRef} />
    </Modal>
  )
}
