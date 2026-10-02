"use client"

import { memo, useState } from "react"
import Link from "next/link"
import { AtSign, CornerUpLeft, FileIcon, MessageSquareQuote, Reply, Trash2 } from "lucide-react"
import { IconButton, cn } from "@/components/ui"
import { CommentBody } from "@/components/comments/comment-body"
import { formatFullDateTime, formatRelativeTime } from "@/components/comments/relative-time"
import MediaPreviewModal from "@/components/media-preview-modal"
import { useLanguage } from "@/lib/language-context"
import { attachmentUrl } from "./use-team-chat"
import { isImage, sourceHref, sourceText, type TeamMessage } from "./types"

interface Props {
  projectId: string
  message: TeamMessage
  now: Date
  onReply: (m: TeamMessage) => void
  onDelete: (m: TeamMessage) => void
  /** Scroll to and flash the quoted message. */
  onJump: (id: string) => void
}

const initial = (name: string | null | undefined) => name?.trim().charAt(0).toUpperCase() || "·"

/**
 * One chat message: author / time, where it came from (sprint task, PBI,
 * IceBox comment), a Teams-style quote of the message it answers, the text
 * with highlighted @mentions, attachments and the reply / delete actions.
 * Messages that mention the viewer stand out (accent bar, tint, tag).
 */
export const MessageItem = memo(function MessageItem({ projectId, message: m, now, onReply, onDelete, onJump }: Props) {
  const { t, language } = useLanguage()
  const forMe = m.mentionsMe || m.repliesToMe
  return (
    <li
      id={`talk-${m.id}`}
      data-talk-message={m.id}
      data-for-me={forMe ? "true" : undefined}
      className={cn(
        "group relative flex gap-3 rounded-ui-md border-l-4 px-3 py-2.5 transition-colors",
        forMe ? "border-l-primary bg-primary-soft/50" : "border-l-transparent hover:bg-surface-muted",
      )}
    >
      <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-caption font-semibold text-fg-muted">
        {initial(m.author?.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-body font-semibold text-fg">{m.author?.name ?? "—"}</span>
          <time dateTime={m.createdAt} title={formatFullDateTime(m.createdAt, language)} className="text-caption text-fg-muted">
            {formatRelativeTime(m.createdAt, now, language)}
          </time>
          {m.editedAt && <span className="text-caption text-fg-subtle">{t.talkEdited}</span>}
          {m.mentionsMe && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary px-2 text-caption font-semibold leading-5 text-white">
              <AtSign aria-hidden="true" className="h-3 w-3" />
              {t.talkForYouTag.replace(/^@/, "")}
            </span>
          )}
          {!m.mentionsMe && m.repliesToMe && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft px-2 text-caption font-semibold leading-5 text-primary-strong ring-1 ring-primary/40">
              <CornerUpLeft aria-hidden="true" className="h-3 w-3" />
              {t.talkReplyToYouTag}
            </span>
          )}
          {m.source && !m.postedToThread && (
            <Link href={sourceHref(projectId, m.source)} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-sunken px-2 text-caption text-fg-muted hover:text-primary-strong">
              <MessageSquareQuote aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">{t.talkFromSource.replace("{source}", sourceText(t, m.source))}</span>
            </Link>
          )}
        </p>
        {m.replyTo && <ReplyQuote quote={m.replyTo} onJump={onJump} />}
        {m.body && <CommentBody body={m.body} mentions={m.mentions} i18n={m.i18n} translationEntity={m.translation} />}
        {m.attachments.length > 0 && <Attachments projectId={projectId} files={m.attachments} />}
        {m.postedToThread && m.source && (
          <Link href={sourceHref(projectId, m.source)} className="mt-1 inline-flex items-center gap-1 text-caption text-fg-muted hover:text-primary-strong">
            <CornerUpLeft aria-hidden="true" className="h-3 w-3" />
            {t.talkPostedToThread.replace("{source}", sourceText(t, m.source))}
          </Link>
        )}
      </div>
      <div className="absolute right-2 top-1.5 flex gap-0.5 rounded-ui-sm bg-surface opacity-100 shadow-ui-sm [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
        <IconButton size="sm" label={`${t.talkReply}: ${m.author?.name ?? ""}`} icon={<Reply className="h-4 w-4" />} onClick={() => onReply(m)} />
        {m.canDelete && <IconButton size="sm" label={t.talkDelete} icon={<Trash2 className="h-4 w-4 text-danger" />} onClick={() => onDelete(m)} />}
      </div>
    </li>
  )
})

/** Teams-style quote of the answered message (click → jump to it). */
function ReplyQuote({ quote, onJump }: { quote: NonNullable<TeamMessage["replyTo"]>; onJump: (id: string) => void }) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={() => onJump(quote.id)}
      data-talk-quote={quote.id}
      className="my-1 block w-full max-w-xl rounded-ui-sm border-l-4 border-l-fg-subtle bg-surface-sunken px-2.5 py-1.5 text-left hover:bg-surface-muted"
    >
      <span className="block text-caption font-semibold text-fg-muted">{quote.authorName ?? "—"}</span>
      <span className="block line-clamp-2 whitespace-pre-line text-caption text-fg-muted">
        {quote.deleted ? t.talkQuoteDeleted : quote.excerpt}
        {quote.attachmentCount > 0 && <span className="ml-1">{t.talkQuoteFiles.replace("{n}", String(quote.attachmentCount))}</span>}
      </span>
    </button>
  )
}

function Attachments({ projectId, files }: { projectId: string; files: TeamMessage["attachments"] }) {
  const { t } = useLanguage()
  const images = files.filter((f) => isImage(f.mimeType))
  const others = files.filter((f) => !isImage(f.mimeType))
  // Images open full screen in the app (same viewer as the dashboard), not in a new tab.
  const [previewAt, setPreviewAt] = useState<number | null>(null)
  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f, i) => (
            <button
              key={f.id}
              type="button"
              data-talk-image={f.id}
              onClick={() => setPreviewAt(i)}
              aria-label={t.talkOpenFile.replace("{name}", f.originalName)}
              className="cursor-zoom-in rounded-ui-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {/* Authenticated API URL → plain <img> (next/image cannot fetch it). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachmentUrl(projectId, f.id)} alt={f.originalName} loading="lazy" decoding="async" className="h-28 max-w-[14rem] rounded-ui-sm border border-border object-cover" />
            </button>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {others.map((f) => (
            <li key={f.id}>
              <a
                href={attachmentUrl(projectId, f.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-ui-sm border border-border bg-surface px-2 py-1 text-caption text-primary-strong hover:underline"
              >
                <FileIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{f.originalName}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {previewAt !== null && (
        <MediaPreviewModal
          items={images.map((f) => ({ id: f.id, originalName: f.originalName, mimeType: f.mimeType, url: attachmentUrl(projectId, f.id) }))}
          startIndex={previewAt}
          onClose={() => setPreviewAt(null)}
        />
      )}
    </div>
  )
}
