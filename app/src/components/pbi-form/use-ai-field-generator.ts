"use client"

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useToast } from "@/components/ui"
import { emitActivity } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

/** The PBI field an AI draft can be generated for. */
export type GeneratedField = "userStory" | "acceptanceCriteria"

/** The text fields the AI reads as context (any PBI form shape that has them). */
export interface AiSourceFields {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
}

/**
 * Streams an AI-drafted user story / acceptance criteria into the form.
 * Calling `generate` again for the running field cancels the stream. On
 * cancel or failure the field is restored to its pre-generation content so
 * no partial output or "[error]" marker can be saved by accident.
 */
export function useAiFieldGenerator<F extends AiSourceFields>(
  projectId: string,
  form: F,
  setForm: Dispatch<SetStateAction<F>>,
) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const [generating, setGenerating] = useState<GeneratedField | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Abort an in-flight generation on unmount so a slow stream doesn't keep
  // occupying the local Ollama instance in the background.
  useEffect(() => () => abortRef.current?.abort(), [])

  async function generate(field: GeneratedField) {
    if (generating === field) {
      abortRef.current?.abort()
      return
    }
    if (generating) return
    if (!form.initiative.trim() && !form.userStory.trim() && !form.acceptanceCriteria.trim()) {
      toast.info(t.aiGenerateNeedsInitiative)
      return
    }
    const before = form[field]
    const ac = new AbortController()
    abortRef.current = ac
    setGenerating(field)
    emitActivity()
    try {
      const res = await fetch(`/api/projects/${projectId}/ai/generate-pbi-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          initiative: form.initiative,
          epic: form.epic,
          userStory: form.userStory,
          acceptanceCriteria: form.acceptanceCriteria,
          lang: language,
        }),
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
        const current = acc
        setForm((f) => ({ ...f, [field]: current }))
      }
      if (/\[error\][^\n]*$/.test(acc)) throw new Error("stream_error")
    } catch (err) {
      setForm((f) => ({ ...f, [field]: before }))
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error(t.aiFailed)
      }
    } finally {
      abortRef.current = null
      setGenerating(null)
    }
  }

  return { generating, generate }
}
