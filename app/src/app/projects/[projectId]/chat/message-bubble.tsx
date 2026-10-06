"use client"

import type { ReactNode } from "react"
import dynamic from "next/dynamic"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { VisuallyHidden } from "@/components/ui"
import { parseChartSpec } from "./chart-spec"
import type { ChatMessage } from "./use-chat-stream"

// Recharts is heavy — load the chart renderer only when the AI actually
// emits a ```chart block. While streaming (incomplete JSON) the block simply
// falls back to the plain <pre> rendering below.
const ChatChart = dynamic(() => import("./chat-chart"), {
  ssr: false,
  loading: () => (
    <div className="my-2 h-[240px] bg-surface-muted border border-border rounded-lg animate-pulse" aria-hidden />
  ),
})

interface MessageBubbleProps {
  message: ChatMessage
  labels: { you: string; assistant: string; thinking: string; stopped: string }
  /** Extra content under the answer (e.g. AI proposal cards). */
  footer?: ReactNode
}

export function MessageBubble({ message, labels, footer }: MessageBubbleProps) {
  const isUser = message.role === "user"
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-fg rounded-br-md whitespace-pre-wrap"
            : "bg-surface text-fg border border-border rounded-bl-md"
        }`}
      >
        <VisuallyHidden>{`${isUser ? labels.you : labels.assistant}: `}</VisuallyHidden>
        {message.content ? (
          isUser ? message.content : <AssistantMarkdown text={message.content} />
        ) : (
          message.pending && <TypingIndicator label={labels.thinking} />
        )}
        {footer}
        {message.stopped && <p className="mt-1 text-caption text-fg-muted italic">{labels.stopped}</p>}
      </div>
    </div>
  )
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <span className="inline-flex gap-1 items-center">
      <VisuallyHidden>{label}</VisuallyHidden>
      <span aria-hidden className="w-1.5 h-1.5 bg-fg-subtle rounded-full animate-pulse" />
      <span aria-hidden className="w-1.5 h-1.5 bg-fg-subtle rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
      <span aria-hidden className="w-1.5 h-1.5 bg-fg-subtle rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
    </span>
  )
}

/** Links in AI answers open only for https URLs (no javascript:, data:, http: or relative surprises). */
export function isSafeLink(href: string | undefined): href is string {
  if (!href) return false
  try {
    return new URL(href).protocol === "https:"
  } catch {
    return false
  }
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 whitespace-pre-wrap">{children}</p>,
        // AI headings are demoted below the page's h1 (h1→h3 … capped at h6)
        // so answers never break the page outline.
        h1: ({ children }) => <h3 className="text-base font-bold mt-3 mb-2 first:mt-0">{children}</h3>,
        h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">{children}</h4>,
        h3: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h5>,
        h4: ({ children }) => <h6 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h6>,
        h5: ({ children }) => <h6 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h6>,
        h6: ({ children }) => <h6 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h6>,
        ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Citations (e.g. GitLab file links): https only, new tab; anything else stays plain text.
        a: ({ href, children }) =>
          isSafeLink(href) ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ) : (
            <span>{children}</span>
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
              <pre className="bg-surface-sunken border border-border rounded-md p-2 my-2 text-caption font-mono overflow-x-auto">
                <code>{children}</code>
              </pre>
            )
          }
          return (
            <code className="bg-surface-sunken text-pink-700 px-1 py-0.5 rounded text-caption font-mono">{children}</code>
          )
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-border-strong pl-3 my-2 text-fg-muted italic">{children}</blockquote>
        ),
        hr: () => <hr className="my-3 border-border" />,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto -mx-1">
            <table className="min-w-full text-caption border-collapse border border-border-strong">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-surface-sunken">{children}</thead>,
        tbody: ({ children }) => <tbody className="bg-surface">{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-border last:border-b-0">{children}</tr>,
        th: ({ children }) => (
          <th className="border border-border-strong px-2 py-1 text-left font-semibold text-fg align-top">{children}</th>
        ),
        td: ({ children }) => <td className="border border-border-strong px-2 py-1 align-top">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
