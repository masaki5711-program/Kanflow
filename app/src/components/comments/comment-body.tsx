"use client"

import { useState, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { splitMentionSegments } from "@/lib/mentions"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"
import { OriginalToggle, PendingBadge } from "@/components/i18n-text"
import { linkifyParts } from "./linkify"

interface Props {
  body: string
  /** Resolved mentions of the comment; a bare `@token` is highlighted only when it names one of them. */
  mentions: readonly { id: string; name: string }[]
  /** Both-language body (field "body"); absent → the stored body is shown as is. */
  i18n?: EntityI18n
  /** Comment id — lets the pending badge offer "translate now". */
  commentId?: string
  /** Called after a "translate now" succeeded (reload the thread). */
  onTranslated?: () => void
  /** Translation record behind the text when it is not this comment (team chat messages). */
  translationEntity?: { type: string; id: string } | null
}

const FIELD = "body"

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "")
}

/** Mentions highlighted, URLs linked, everything else plain (escaped) text. */
function renderSegments(text: string, known: ReadonlySet<string>): ReactNode[] {
  return splitMentionSegments(text).map((seg, i) => {
    if (seg.type === "mention" && (seg.bracket || known.has(fold(seg.name)))) {
      return (
        <span key={i} className="rounded-ui-sm bg-primary-soft px-1 font-medium text-primary-strong" data-mention>
          @{seg.name}
        </span>
      )
    }
    const plain = seg.type === "mention" ? seg.raw : seg.text
    return linkifyParts(plain).map((part, j) =>
      part.type === "url" ? (
        <a key={`${i}-${j}`} href={part.href} target="_blank" rel="noopener noreferrer nofollow"
          className="break-all text-primary-strong underline underline-offset-2 hover:text-primary-hover">
          {part.href}
        </a>
      ) : (
        <span key={`${i}-${j}`}>{part.text}</span>
      ),
    )
  })
}

/**
 * Comment body as plain text: React escapes everything (no HTML is ever
 * interpreted), line breaks are kept with `whitespace-pre-wrap`, @mentions are
 * highlighted and http(s) URLs become links that open in a new tab.
 *
 * Shown in the viewer's language (JA/ID) when a translation exists, with the
 * same "原文" toggle as I18nText; untranslated text carries a pending badge.
 */
export function CommentBody({ body, mentions, i18n, commentId, onTranslated, translationEntity }: Props) {
  const { language } = useLanguage()
  const [showOriginal, setShowOriginal] = useState(false)
  const known = new Set(mentions.map((m) => fold(m.name)))
  const picked = pickText(i18n, FIELD, body, language)
  const source = i18n?.[FIELD]?.source
  const shownLang = picked.translated ? language : source
  const canToggle = picked.translated && !!picked.original
  const textClass = "whitespace-pre-wrap break-words text-body leading-relaxed text-fg"
  return (
    <div>
      <p className={textClass} lang={shownLang && shownLang !== language ? shownLang : undefined}>
        {renderSegments(picked.text, known)}
        {(picked.pending || picked.failed) && (
          <PendingBadge failed={picked.failed} field={FIELD} onDone={onTranslated}
            entity={translationEntity ?? (commentId ? { type: "comment", id: commentId } : undefined)} />
        )}
        {canToggle && <OriginalToggle expanded={showOriginal} onToggle={() => setShowOriginal((v) => !v)} />}
      </p>
      {canToggle && showOriginal && picked.original && (
        <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-caption text-fg-muted" lang={source} data-comment-original>
          {renderSegments(picked.original, known)}
        </p>
      )}
    </div>
  )
}
