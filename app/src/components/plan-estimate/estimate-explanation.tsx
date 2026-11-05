"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles } from "lucide-react"
import { apiFetch } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { candidateAssistFailed, type ExplanationView, type RunSummary } from "./types"

interface Props {
  projectId: string
  runId: string
  /** Absent from a card of an older server: treated as "off". */
  explanation?: ExplanationView
  assist: RunSummary["assist"]
}

const OFF: ExplanationView = { state: "off" }

/**
 * The AI part of an estimate card (plan 12 E6): the explanation text written by the local LLM (asked for once when the
 * run has none yet), or one line saying it cannot be shown to this reader / that there was no AI assistance. The
 * deterministic card above stays what is approved. The text is plain (rendered as text, never as HTML).
 */
export function EstimateExplanation({ projectId, runId, explanation = OFF, assist }: Props) {
  const { t, language } = useLanguage()
  const [view, setView] = useState<ExplanationView>(explanation)
  const asked = useRef<string | null>(null)

  useEffect(() => {
    setView(explanation)
  }, [explanation])

  useEffect(() => {
    if (explanation.state !== "pending" || asked.current === runId) return
    asked.current = runId
    let alive = true
    apiFetch<{ explanation: ExplanationView }>(`/api/projects/${projectId}/plan/estimate-runs/${encodeURIComponent(runId)}/explanation`, { method: "POST" })
      .then((r) => {
        if (alive) setView(r.explanation)
      })
      .catch(() => {
        // The card is complete without it: say there is no AI assistance (the server logged the cause).
        if (alive) setView({ state: "failed" })
      })
    return () => {
      alive = false
    }
  }, [explanation.state, projectId, runId])

  const rejected = assist?.candidates === "applied" && assist.rejected > 0 ? assist.rejected : 0
  const noAssist = view.state === "failed" || candidateAssistFailed(assist?.candidates)
  const status = view.state === "pending" ? t.pesAiWriting : view.state === "hidden" ? t.pesAiHidden : ""
  if (view.state !== "ready" && !status && !noAssist && rejected === 0) return null

  return (
    <div className="space-y-2" aria-labelledby="pes-ai-title" role="group">
      <h3 id="pes-ai-title" className="flex items-center gap-1.5 text-body font-semibold text-fg">
        <Sparkles aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.pesAiTitle}
      </h3>
      {view.state === "ready" && (
        <>
          <p lang={language} className="whitespace-pre-line rounded-ui-md bg-surface-sunken px-3 py-2 text-body text-fg [overflow-wrap:anywhere]">
            {view.text[language]}
          </p>
          <p className="text-caption text-fg-muted">{t.pesAiNote}</p>
        </>
      )}
      {/* Always present, so the line that replaces "writing…" is announced. */}
      <p role="status" className={status ? "text-body text-fg-muted" : "sr-only"}>
        {status}
      </p>
      {noAssist && <p className="text-caption text-fg-muted">{t.pesAiNone}</p>}
      {rejected > 0 && <p className="text-caption text-fg-muted">{fillTemplate(t.pesAiCandidates, { n: rejected })}</p>}
    </div>
  )
}
