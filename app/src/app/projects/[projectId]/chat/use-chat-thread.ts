"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { apiFetch, isAbortError } from "@/hooks"
import { THREAD_PARAM, threadUrl, toChatMessages, toStoredThread } from "./chat-history"
import type { ChatMessage } from "./use-chat-stream"

function readThreadParam(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get(THREAD_PARAM) || null
}

/** In-page URL writes (History API) do not fire popstate; subscribers are told here. */
const urlListeners = new Set<() => void>()

function subscribeUrl(onChange: () => void): () => void {
  urlListeners.add(onChange)
  window.addEventListener("popstate", onChange)
  return () => {
    urlListeners.delete(onChange)
    window.removeEventListener("popstate", onChange)
  }
}

/**
 * `?thread=<id>` of the chat page. Written with the History API (the App
 * Router picks it up; no re-render of the route) — `push` for an explicit
 * selection so Back returns to the previous thread, `replace` otherwise.
 * `onNavigate` fires on Back / Forward (not for this page's own writes).
 */
export function useThreadParam(onNavigate?: (threadId: string | null) => void): {
  threadId: string | null
  setThreadId: (id: string | null, mode?: "push" | "replace") => void
} {
  const threadId = useSyncExternalStore(subscribeUrl, readThreadParam, () => null)

  const onNavigateRef = useRef(onNavigate)
  useEffect(() => {
    onNavigateRef.current = onNavigate
  })
  useEffect(() => {
    const onPop = () => onNavigateRef.current?.(readThreadParam())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const setThreadId = useCallback((id: string | null, mode: "push" | "replace" = "replace") => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set(THREAD_PARAM, id)
    else url.searchParams.delete(THREAD_PARAM)
    if (url.href === window.location.href) return
    if (mode === "push") window.history.pushState(window.history.state, "", url)
    else window.history.replaceState(window.history.state, "", url)
    for (const listener of urlListeners) listener()
  }, [])

  return { threadId, setThreadId }
}

interface UseThreadLoaderOptions {
  projectId: string
  threadId: string | null
  /** Thread whose messages are already on screen (e.g. the thread this page just created) — not reloaded. */
  shownThreadId: string | null
  onLoaded: (threadId: string, messages: ChatMessage[]) => void
  /** The thread is gone (deleted, not the caller's) or could not be loaded. */
  onError: (error: Error, notFound: boolean) => void
}

/** Load the stored messages whenever `threadId` changes to a thread not on screen yet. */
export function useThreadLoader({ projectId, threadId, shownThreadId, onLoaded, onError }: UseThreadLoaderOptions): {
  loading: boolean
} {
  // Last thread whose request settled (success or failure).
  const [settledId, setSettledId] = useState<string | null>(null)
  const callbacks = useRef({ onLoaded, onError })
  useEffect(() => {
    callbacks.current = { onLoaded, onError }
  })

  const needsLoad = threadId !== null && threadId !== shownThreadId

  useEffect(() => {
    if (!needsLoad || !threadId) return
    const controller = new AbortController()
    apiFetch<unknown>(threadUrl(projectId, threadId), { signal: controller.signal })
      .then((raw) => {
        const stored = toStoredThread(raw)
        if (!stored) throw new Error("invalid thread response")
        callbacks.current.onLoaded(threadId, toChatMessages(stored.messages))
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return
        const error = err instanceof Error ? err : new Error(String(err))
        callbacks.current.onError(error, (err as { status?: unknown }).status === 404)
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettledId(threadId)
      })
    return () => controller.abort()
  }, [projectId, threadId, needsLoad])

  return { loading: needsLoad && settledId !== threadId }
}
