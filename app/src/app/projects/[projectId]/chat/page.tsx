"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { History, MessageSquare, Send, Square } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, SkeletonLines, Textarea, VisuallyHidden, PageHeader, useToast } from "@/components/ui"
import { MessageBubble } from "./message-bubble"
import { useChatStream } from "./use-chat-stream"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { ProposalList } from "./proposal-card"
import { ProposalPermissionsLoader, ProposalProvider } from "./proposal-context"
import { ThreadList } from "./thread-list"
import { useThreadLoader, useThreadParam } from "./use-chat-thread"

export default function ChatPage() {
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.chatTitle)
  const params = useParams()
  const projectId = params.projectId as string

  // P3 chat history: `?thread=<id>` selects a stored conversation.
  const toast = useToast()
  const [threadsVersion, setThreadsVersion] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Thread whose messages are on screen (loaded, or created by this page) — not reloaded.
  const [shownThreadId, setShownThreadId] = useState<string | null>(null)
  const refreshThreads = useCallback(() => setThreadsVersion((v) => v + 1), [])

  // Back / Forward to another conversation empties the view; the loader then fetches it.
  const clearRef = useRef<() => void>(() => undefined)
  const { threadId, setThreadId } = useThreadParam((id) => {
    if (id === shownThreadId) return
    setShownThreadId(null)
    clearRef.current()
  })
  const { messages, streaming, error, send, stop, clear, replaceMessages } = useChatStream({
    projectId,
    language,
    errorTitle: t.chatError,
    threadId: shownThreadId,
    onThreadId: (id) => {
      setShownThreadId(id)
      setThreadId(id, "replace")
      refreshThreads()
    },
  })
  useEffect(() => {
    clearRef.current = clear
  }, [clear])
  const { loading: threadLoading } = useThreadLoader({
    projectId,
    threadId,
    shownThreadId,
    onLoaded: (id, stored) => {
      setShownThreadId(id)
      replaceMessages(stored)
    },
    onError: (_err, notFound) => {
      toast.error(t.chatThreadLoadFailed)
      if (notFound) {
        setThreadId(null, "replace")
        refreshThreads()
      }
    },
  })

  function openThread(id: string) {
    setHistoryOpen(false)
    if (id === threadId) return
    setShownThreadId(null)
    clear()
    setThreadId(id, "push")
  }

  function startNewChat() {
    setHistoryOpen(false)
    setShownThreadId(null)
    clear()
    setThreadId(null, threadId ? "push" : "replace")
  }

  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Return focus to the input once a response finishes (or is stopped).
  useEffect(() => {
    if (!streaming) textareaRef.current?.focus()
  }, [streaming])

  async function sendMessage() {
    const text = input
    if (!text.trim() || streaming) return
    setInput("")
    const ok = await send(text)
    // Restore the question so the user can retry without retyping.
    if (!ok) setInput((cur) => (cur === "" ? text : cur))
    // The answered thread moves to the top of the history list.
    else refreshThreads()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const labels = { you: t.chatYou, assistant: t.chatAssistant, thinking: t.chatThinking, stopped: t.chatStopped }
  const lastMessage = messages[messages.length - 1]
  const waitingForFirstToken = streaming && lastMessage?.role === "assistant" && !lastMessage.content
  // Session / member lookups for the approval buttons only start once the AI
  // actually proposed something.
  const hasProposals = messages.some((m) => (m.proposals?.length ?? 0) > 0)

  return (
    <ProposalProvider>
      {hasProposals && <ProposalPermissionsLoader projectId={projectId} />}
      <div className="flex h-[calc(100vh-180px)] min-h-[500px] gap-4">
        {/* Stored chats: side column on large screens, a drawer on small ones. */}
        <aside
          className={
            historyOpen
              ? "fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-surface p-4 shadow-ui-lg lg:static lg:z-auto lg:w-64 lg:shrink-0 lg:bg-transparent lg:p-0 lg:shadow-none"
              : "hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col"
          }
        >
          <ThreadList
            projectId={projectId}
            activeThreadId={threadId}
            refreshKey={threadsVersion}
            onSelect={openThread}
            onNew={startNewChat}
            onDeleted={(id) => {
              if (id === threadId) startNewChat()
            }}
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <PageHeader
            className="mb-4"
            title={t.chatTitle}
            description={<span className="text-caption">{t.chatContextNote}</span>}
            icon={
              <span className="block p-2 bg-purple-50 rounded-ui-md">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </span>
            }
            actions={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  aria-expanded={historyOpen}
                  onClick={() => setHistoryOpen((v) => !v)}
                  leftIcon={<History className="h-4 w-4" />}
                >
                  {historyOpen ? t.chatThreadsHide : t.chatThreadsShow}
                </Button>
                {messages.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={startNewChat}>
                    {t.chatClear}
                  </Button>
                )}
              </>
            }
          />

          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-busy={streaming}
            aria-label={t.chatConversationLabel}
            tabIndex={0}
            className="flex-1 overflow-y-auto bg-surface-muted rounded-xl border border-border p-4 space-y-3 min-h-0"
          >
            {threadLoading ? (
              <SkeletonLines lines={4} label={t.loading} />
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  icon={<MessageSquare className="h-6 w-6" />}
                  title={t.chatTitle}
                  description={t.chatEmpty}
                  compact
                  headingLevel={2}
                />
              </div>
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  labels={labels}
                  footer={
                    m.proposals && m.proposals.length > 0 ? (
                      <ProposalList
                        projectId={projectId}
                        threadId={shownThreadId}
                        proposals={m.proposals}
                        outcomes={m.proposalOutcomes}
                        pending={m.pending}
                      />
                    ) : undefined
                  }
                />
              ))
            )}
          </div>

          {/* Short status for screen readers; the log above is aria-busy while streaming. */}
          <VisuallyHidden>
            <span role="status">{waitingForFirstToken ? t.chatThinking : ""}</span>
          </VisuallyHidden>

          {error && (
            <p role="alert" className="mt-2 text-caption text-danger px-2">
              {error}
            </p>
          )}

          <form
            className="mt-3 flex gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void sendMessage()
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              {t.chatInputLabel}
            </label>
            <Textarea
              id="chat-input"
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.chatPlaceholder}
              rows={2}
              disabled={streaming}
              className="flex-1 resize-none"
            />
            {streaming ? (
              <Button variant="danger" onClick={stop} leftIcon={<Square className="h-3.5 w-3.5" fill="currentColor" />}>
                {t.chatCancel}
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()} leftIcon={<Send className="h-4 w-4" />}>
                {t.chatSend}
              </Button>
            )}
          </form>
        </div>
      </div>
    </ProposalProvider>
  )
}
