"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { MessageSquare, Send, Square } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, Textarea, VisuallyHidden, PageHeader } from "@/components/ui"
import { MessageBubble } from "./message-bubble"
import { useChatStream } from "./use-chat-stream"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

export default function ChatPage() {
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.chatTitle)
  const params = useParams()
  const projectId = params.projectId as string

  const { messages, streaming, error, send, stop, clear } = useChatStream({
    projectId,
    language,
    errorTitle: t.chatError,
  })
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

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
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
          messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              {t.chatClear}
            </Button>
          )
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
        {messages.length === 0 ? (
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
          messages.map((m) => <MessageBubble key={m.id} message={m} labels={labels} />)
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
  )
}
