"use client"

import { useRef, useState } from "react"
import { CornerUpLeft, FileIcon, Paperclip, X } from "lucide-react"
import { IconButton, cn, useToast } from "@/components/ui"
import { CommentComposer } from "@/components/comments/comment-composer"
import type { MentionMember } from "@/components/comments/types"
import { useFileIntake } from "@/components/file-intake/use-file-intake"
import { compressImageFile } from "@/lib/image-compress"
import { useLanguage } from "@/lib/language-context"
import { checkTeamChatFiles, TEAM_CHAT_MAX_FILES, type FileRejection } from "@/lib/team-chat-limits"
import { sourceText, type TeamMessage } from "./types"

interface Props {
  members: readonly MentionMember[]
  membersLoading: boolean
  replyTo: TeamMessage | null
  onCancelReply: () => void
  /** Resolve true when sent (the composer then clears). */
  onSend: (body: string, files: File[]) => Promise<boolean>
}

const formatSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/**
 * Bottom of the chat: the message being answered (Teams-style quote; a note
 * when the reply also goes to the sprint / backlog thread), chosen files and
 * the @mention text box. Files: picker, drag & drop or Ctrl+V; too many or
 * too large files are refused here with the reason (the API enforces the same).
 */
export function ChatComposer({ members, membersLoading, replyTo, onCancelReply, onSend }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [files, setFiles] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function explain(r: FileRejection) {
    if (r.reason === "too_many") toast.error(t.talkTooManyFiles)
    else if (r.reason === "too_large") toast.error(t.talkFileTooLarge.replace("{name}", r.name))
    else toast.error(t.talkTotalTooLarge)
  }

  async function add(incoming: File[]) {
    // Photos are shrunk first, so a phone picture rarely hits the size limit.
    const prepared = await Promise.all(incoming.map((f) => (f.type.startsWith("image/") ? compressImageFile(f) : f)))
    const next = [...files, ...prepared]
    const rejection = checkTeamChatFiles(next)
    if (rejection) {
      explain(rejection)
      // Keep what fits: drop oversized files, then cut to the per-message count.
      const fitting = next.filter((f) => !checkTeamChatFiles([f])).slice(0, TEAM_CHAT_MAX_FILES)
      if (!checkTeamChatFiles(fitting)) setFiles(fitting)
      return
    }
    setFiles(next)
  }
  const intake = useFileIntake((incoming) => void add(incoming))

  async function submit(body: string) {
    const ok = await onSend(body, files)
    if (ok) setFiles([])
    return ok
  }

  return (
    <div
      {...intake.dropProps}
      onPaste={intake.onPaste}
      data-talk-composer=""
      className={cn("rounded-ui-lg border bg-surface p-3 shadow-ui-sm", intake.dragActive ? "border-primary bg-primary-soft/40" : "border-border")}
    >
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-ui-sm border-l-4 border-l-primary bg-surface-sunken px-2.5 py-1.5" data-talk-replying={replyTo.id}>
          <CornerUpLeft aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-fg">{t.talkReplyingTo.replace("{name}", replyTo.author?.name ?? "—")}</p>
            <p className="line-clamp-2 whitespace-pre-line text-caption text-fg-muted">{replyTo.body || t.talkQuoteFiles.replace("{n}", String(replyTo.attachments.length))}</p>
            {replyTo.source && (
              <p className="mt-0.5 text-caption font-medium text-primary-strong">{t.talkReplyAlsoThread.replace("{source}", sourceText(t, replyTo.source))}</p>
            )}
          </div>
          <IconButton size="sm" label={t.talkReplyCancel} icon={<X className="h-4 w-4" />} onClick={onCancelReply} />
        </div>
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-ui-sm border border-border bg-surface-muted py-0.5 pl-2 pr-0.5 text-caption">
              <FileIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              <span className="truncate" title={f.name}>{f.name}</span>
              <span className="shrink-0 text-fg-muted">{formatSize(f.size)}</span>
              <IconButton size="sm" label={t.talkRemoveFile.replace("{name}", f.name)} icon={<X className="h-3.5 w-3.5" />} onClick={() => setFiles(files.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      <CommentComposer
        members={members}
        membersLoading={membersLoading}
        onSubmit={submit}
        label={t.talkComposerLabel}
        submitLabel={t.talkSend}
        allowEmpty={files.length > 0}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void add(Array.from(e.target.files ?? []))
            e.target.value = ""
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-ui-sm px-2 text-caption font-medium text-fg-muted hover:bg-surface-sunken hover:text-fg"
        >
          <Paperclip aria-hidden="true" className="h-4 w-4" />
          {t.talkAttach}
        </button>
        <span className="text-caption text-fg-subtle">{t.talkAttachHint}</span>
      </div>
    </div>
  )
}
