"use client"

import { splitMentionSegments } from "@/lib/mentions"
import { linkifyParts } from "./linkify"

interface Props {
  body: string
  /** Resolved mentions of the comment; a bare `@token` is highlighted only when it names one of them. */
  mentions: readonly { id: string; name: string }[]
}

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "")
}

/**
 * Comment body as plain text: React escapes everything (no HTML is ever
 * interpreted), line breaks are kept with `whitespace-pre-wrap`, @mentions are
 * highlighted and http(s) URLs become links that open in a new tab.
 */
export function CommentBody({ body, mentions }: Props) {
  const known = new Set(mentions.map((m) => fold(m.name)))
  return (
    <p className="whitespace-pre-wrap break-words text-body leading-relaxed text-fg">
      {splitMentionSegments(body).map((seg, i) => {
        if (seg.type === "mention" && (seg.bracket || known.has(fold(seg.name)))) {
          return (
            <span key={i} className="rounded-ui-sm bg-primary-soft px-1 font-medium text-primary-strong" data-mention>
              @{seg.name}
            </span>
          )
        }
        const text = seg.type === "mention" ? seg.raw : seg.text
        return linkifyParts(text).map((part, j) =>
          part.type === "url" ? (
            <a key={`${i}-${j}`} href={part.href} target="_blank" rel="noopener noreferrer nofollow"
              className="break-all text-primary-strong underline underline-offset-2 hover:text-primary-hover">
              {part.href}
            </a>
          ) : (
            <span key={`${i}-${j}`}>{part.text}</span>
          ),
        )
      })}
    </p>
  )
}
