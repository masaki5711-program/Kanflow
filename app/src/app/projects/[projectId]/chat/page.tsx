"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"
import { useLanguage } from "@/lib/language-context"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { parseChartSpec } from "./chart-spec"

// Recharts is heavy — load the chart renderer only when the AI actually
// emits a ```chart block. While streaming (incomplete JSON) the block simply
// falls back to the plain <pre> rendering below.
const ChatChart = dynamic(() => import("./chat-chart"), {
  ssr: false,
  loading: () => (
    <div className="my-2 h-[240px] bg-gray-50 border border-gray-200 rounded-lg animate-pulse" aria-hidden />
  ),
})

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  pending?: boolean
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ChatPage() {
  const { t, language } = useLanguage()
  const params = useParams()
  const projectId = params.projectId as string

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  async function sendMessage() {
    const trimmed = input.trim()
    if (!trimmed || streaming) return

    setError(null)
    setInput("")

    const userMsg: Message = { id: genId(), role: "user", content: trimmed }
    const assistantMsg: Message = { id: genId(), role: "assistant", content: "", pending: true }

    const history = [...messages, userMsg]
    setMessages([...history, assistantMsg])
    setStreaming(true)

    const ac = new AbortController()
    abortRef.current = ac

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

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: acc, pending: true } : m
          )
        )
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc, pending: false } : m))
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // user navigated away; ignore
      } else {
        setError(t.chatError)
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      sendMessage()
    }
  }

  function cancelStreaming() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    // Keep whatever text has already streamed in; mark the assistant message
    // as no longer pending and clear the loading state.
    setMessages((prev) =>
      prev.map((m) => (m.pending ? { ...m, pending: false } : m))
    )
    setStreaming(false)
  }

  function clearHistory() {
    if (streaming) abortRef.current?.abort()
    setMessages([])
    setError(null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-xl">
            <svg className="w-6 h-6 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t.chatTitle}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{t.chatContextNote}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            {t.chatClear}
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gray-50/50 rounded-xl border border-gray-200 p-4 space-y-3 min-h-0"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-gray-400 text-center max-w-md">{t.chatEmpty}</p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500 px-2">{error}</p>
      )}

      <div className="mt-3 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.chatPlaceholder}
          rows={2}
          disabled={streaming}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 resize-none"
        />
        {streaming ? (
          <button
            type="button"
            onClick={cancelStreaming}
            className="px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium shadow-sm transition-all inline-flex items-center gap-1.5"
            title={t.chatCancel ?? "停止"}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <rect x="5" y="5" width="10" height="10" rx="1" />
            </svg>
            {t.chatCancel ?? "停止"}
          </button>
        ) : (
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm transition-all"
          >
            {t.chatSend}
          </button>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white rounded-br-md whitespace-pre-wrap"
            : "bg-white text-gray-800 border border-gray-200 rounded-bl-md"
        }`}
      >
        {message.content
          ? (isUser ? message.content : <AssistantMarkdown text={message.content} />)
          : (message.pending && (
              <span className="inline-flex gap-1 text-gray-400 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
              </span>
            ))}
      </div>
    </div>
  )
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 whitespace-pre-wrap">{children}</p>,
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            {children}
          </a>
        ),
        code: ({ className, children }) => {
          const isBlock = className?.startsWith("language-")
          // ```chart blocks: parse the JSON spec and render a real chart.
          // Invalid/partial JSON (e.g. mid-stream) falls through to <pre>.
          if (className === "language-chart") {
            const spec = parseChartSpec(String(children).trim())
            if (spec) return <ChatChart spec={spec} />
          }
          if (isBlock) {
            return (
              <pre className="bg-gray-100 border border-gray-200 rounded-md p-2 my-2 text-[12px] font-mono overflow-x-auto">
                <code>{children}</code>
              </pre>
            )
          }
          return <code className="bg-gray-100 text-pink-700 px-1 py-0.5 rounded text-[12px] font-mono">{children}</code>
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-300 pl-3 my-2 text-gray-600 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-gray-200" />,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto -mx-1">
            <table className="min-w-full text-[12px] border-collapse border border-gray-300">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
        tbody: ({ children }) => <tbody className="bg-white">{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-gray-200 last:border-b-0">{children}</tr>,
        th: ({ children }) => (
          <th className="border border-gray-300 px-2 py-1 text-left font-semibold text-gray-700 align-top">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-300 px-2 py-1 align-top">{children}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
