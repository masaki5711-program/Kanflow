"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "@/components/ui"
import { emitActivity, isAbortError, parseErrorMessage } from "@/hooks"
import { decodeChatStream, proposalsOf, type ChatProposal } from "@/lib/chat-proposals"
import { toRequestHistory } from "./chat-history"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** Assistant message still streaming. */
  pending?: boolean
  /** Generation was stopped by the user before completion. */
  stopped?: boolean
  /** Approval-based write proposals the server sent with this answer (P3). */
  proposals?: ChatProposal[]
}

/** Visible text + proposals of the raw stream (frames never reach the markdown). */
function decodeAnswer(raw: string): Pick<ChatMessage, "content" | "proposals"> {
  const { text, events } = decodeChatStream(raw)
  const proposals = proposalsOf(events)
  return proposals.length > 0 ? { content: text, proposals } : { content: text }
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
  /** P3 chat history: the stored thread to continue (null = the next question starts a new one). */
  threadId?: string | null
  /** The server stored the question in this thread (a new thread on the first question). */
  onThreadId?: (threadId: string) => void
}

/** Response header naming the stored thread (see the chat route). */
const THREAD_HEADER = "X-Chat-Thread-Id"

/**
 * Streams chat completions from `/api/projects/:id/chat`.
 * `stop()` aborts the request (the server stops generating when the request is
 * aborted) and keeps whatever text had already arrived.
 */
export function useChatStream({ projectId, language, errorTitle, threadId = null, onThreadId }: UseChatStreamOptions) {
  const toast = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stoppedByUserRef = useRef(false)
  // Thread of the next question: follows the prop, and the id the server
  // assigns on a new chat (set before the parent re-renders with it).
  const threadRef = useRef<string | null>(threadId)
  const onThreadIdRef = useRef(onThreadId)
  useEffect(() => {
    threadRef.current = threadId
  }, [threadId])
  useEffect(() => {
    onThreadIdRef.current = onThreadId
  })

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
            messages: toRequestHistory(history),
            lang: language,
            threadId: threadRef.current ?? undefined,
          }),
          signal: ac.signal,
        })
        if (!res.ok || !res.body) throw new Error(await readErrorMessage(res))
        const storedIn = res.headers.get(THREAD_HEADER)
        if (storedIn && storedIn !== threadRef.current) {
          threadRef.current = storedIn
          onThreadIdRef.current?.(storedIn)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          patchMessage(assistantMsg.id, decodeAnswer(acc))
        }
        patchMessage(assistantMsg.id, { ...decodeAnswer(acc), pending: false })
        return true
      } catch (err) {
        if (isAbortError(err)) {
          // User pressed stop (or left the page): keep the partial answer.
          patchMessage(assistantMsg.id, { ...decodeAnswer(acc), pending: false, stopped: stoppedByUserRef.current })
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

  /** Show a stored conversation (aborts any answer in flight). */
  const replaceMessages = useCallback((next: ChatMessage[]) => {
    abortRef.current?.abort()
    setMessages(next)
    setError(null)
  }, [])

  return { messages, streaming, error, send, stop, clear, replaceMessages }
}
