"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "@/components/ui"
import { emitActivity, isAbortError, parseErrorMessage } from "@/hooks"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** Assistant message still streaming. */
  pending?: boolean
  /** Generation was stopped by the user before completion. */
  stopped?: boolean
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : text
  } catch {
    // plain-text body
  }
  return parseErrorMessage(body, res.status, res.statusText)
}

interface UseChatStreamOptions {
  projectId: string
  language: string
  errorTitle: string
}

/**
 * Streams chat completions from `/api/projects/:id/chat`.
 * `stop()` aborts the request (the server stops generating when the request is
 * aborted) and keeps whatever text had already arrived.
 */
export function useChatStream({ projectId, language, errorTitle }: UseChatStreamOptions) {
  const toast = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stoppedByUserRef = useRef(false)

  // Abort any in-flight generation when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), [])

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }, [])

  /** Returns false when the send failed (caller may restore the input). */
  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim()
      if (!trimmed || abortRef.current) return true

      const userMsg: ChatMessage = { id: genId(), role: "user", content: trimmed }
      const assistantMsg: ChatMessage = { id: genId(), role: "assistant", content: "", pending: true }
      const history = [...messages, userMsg]

      setError(null)
      setMessages([...history, assistantMsg])
      setStreaming(true)
      emitActivity()

      const ac = new AbortController()
      abortRef.current = ac
      stoppedByUserRef.current = false
      let acc = ""

      try {
        const res = await fetch(`/api/projects/${projectId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            lang: language,
          }),
          signal: ac.signal,
        })
        if (!res.ok || !res.body) throw new Error(await readErrorMessage(res))

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          patchMessage(assistantMsg.id, { content: acc })
        }
        patchMessage(assistantMsg.id, { content: acc, pending: false })
        return true
      } catch (err) {
        if (isAbortError(err)) {
          // User pressed stop (or left the page): keep the partial answer.
          patchMessage(assistantMsg.id, { content: acc, pending: false, stopped: stoppedByUserRef.current })
          return true
        }
        const message = err instanceof Error && err.message ? err.message : errorTitle
        setError(errorTitle)
        toast.error(message, { title: errorTitle })
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id && m.id !== userMsg.id))
        return false
      } finally {
        if (abortRef.current === ac) abortRef.current = null
        setStreaming(false)
      }
    },
    [messages, projectId, language, errorTitle, toast, patchMessage],
  )

  const stop = useCallback(() => {
    if (!abortRef.current) return
    stoppedByUserRef.current = true
    abortRef.current.abort()
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
  }, [])

  return { messages, streaming, error, send, stop, clear }
}
