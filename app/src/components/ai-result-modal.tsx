"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
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
}

const INITIAL: StreamState = { text: "", report: null, generatedAt: null, done: false, failed: false }

function useAiStream(fetchUrl: string, bodyJson: string, structured: boolean): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL)

  useEffect(() => {
    const ac = new AbortController()
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
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          // Live-render the report document as the JSON streams in:
          // sections appear one by one while the model is still writing.
          const partial = structured ? extractPartialObject(acc) : null
          const rep = partial ? normalizeStructured(partial.fields) : null
          const text = acc
          setState((s) => ({ ...s, text, report: rep ?? s.report }))
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
        }))
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setState((s) => ({ ...s, failed: true }))
      }
    })()
    return () => ac.abort()
  }, [fetchUrl, bodyJson, structured])

  return state
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
  const { text, report, generatedAt, done, failed } = useAiStream(fetchUrl, bodyJson, structured)
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
  const status = failed ? t.aiFailed : done ? t.aiReportGenerationDone : t.aiThinking

  let body: ReactNode
  if (failed) {
    body = <p role="alert" className="text-body text-danger">{t.aiFailed}</p>
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
        {!done && <div className="mt-3"><ThinkingIndicator label={t.aiThinking} /></div>}
      </>
    )
  } else if (!text || (structured && !done)) {
    // Raw JSON is accumulating but no renderable fields yet — keep the
    // indicator instead of dumping JSON tokens on the user.
    body = <ThinkingIndicator label={t.aiThinking} />
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
      closeOnOverlayClick={done || failed}
      footer={
        <>
          {footer?.(text, done)}
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
      <div aria-busy={!done && !failed}>{body}</div>
      {done && <p className="mt-4 text-caption text-fg-muted">{t.aiResultDisclaimer}</p>}
      <div ref={endRef} />
    </Modal>
  )
}
