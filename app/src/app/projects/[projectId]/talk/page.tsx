"use client"

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { MessagesSquare } from "lucide-react"
import { Button, EmptyState, PageHeader, SkeletonLines, cn, useConfirm, useToast } from "@/components/ui"
import { useMentionMembersState, useSignedInUserId } from "@/components/comments/use-comment-thread"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { useSession } from "next-auth/react"
import { useApiQuery, useStableHandlers } from "@/hooks"
import { can, type ProjectActor } from "@/lib/authz/policy"
import { ConvertMessageDialog } from "./convert-message-dialog"
import { useLanguage } from "@/lib/language-context"
import { ChatComposer } from "./chat-composer"
import { MessageItem } from "./message-item"
import { firstUnreadIndex, type TeamMessage } from "./types"
import { useTeamChat } from "./use-team-chat"

/** Project team chat (チームチャット). useSearchParams needs the Suspense boundary. */
export default function TalkPage() {
  return (
    <Suspense fallback={<SkeletonLines lines={6} />}>
      <TalkContent />
    </Suspense>
  )
}

function TalkContent() {
  const { t } = useLanguage()
  useProjectDocumentTitle(t.talkTitle)
  const { projectId } = useParams<{ projectId: string }>()
  const search = useSearchParams()
  const toast = useToast()
  const confirm = useConfirm()
  const selfId = useSignedInUserId()
  const [forMe, setForMe] = useState(false)
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null)
  const [convertMessage, setConvertMessage] = useState<TeamMessage | null>(null)
  const { data: session } = useSession()
  const roster = useApiQuery<{ role: string; user: { id: string } }[]>(`/api/projects/${encodeURIComponent(projectId)}/members`)
  // UI hints from the shared authz policy; the create APIs enforce the same rules.
  const actor: ProjectActor = {
    userId: selfId ?? "",
    systemRole: (session?.user as { role?: string } | undefined)?.role ?? "member",
    projectRole: roster.data?.find((m) => m.user.id === selfId)?.role ?? null,
    isSectionManagerOfProject: false,
  }
  const canPbi = can(actor, "backlog.write")
  const canIcebox = can(actor, "icebox.write")
  const canTask = can(actor, "task.write")
  const [now] = useState(() => new Date())
  const chat = useTeamChat(projectId, forMe)
  const mention = useMentionMembersState(projectId)
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const unreadAt = useMemo(() => firstUnreadIndex(chat.messages, chat.readMark, selfId), [chat.messages, chat.readMark, selfId])

  // Follow new messages while the user is at the bottom; reading older ones is not interrupted.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  const jump = useCallback((id: string) => {
    const el = document.getElementById(`talk-${id}`)
    if (!el) return
    el.scrollIntoView({ block: "center", behavior: "smooth" })
    el.classList.add("ring-2", "ring-primary")
    window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1600)
  }, [])

  // ?message=<id> (notifications): show it once loaded.
  const target = search.get("message")
  useEffect(() => {
    if (!target || chat.loading) return
    stickToBottom.current = false
    requestAnimationFrame(() => jump(target))
  }, [target, chat.loading, jump])

  async function send(body: string, files: File[]): Promise<boolean> {
    try {
      stickToBottom.current = true
      await chat.send(body, files, replyTo?.id ?? null)
      setReplyTo(null)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: t.talkSendFailed })
      return false
    }
  }

  async function deleteMessage(m: TeamMessage) {
    const ok = await confirm({ message: t.talkDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    try {
      await chat.remove(m.id)
      toast.success(t.talkDeleted)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  // Stable identities keep the memoized message rows from re-rendering on every poll.
  const rowHandlers = useStableHandlers({
    onReply: (m: TeamMessage) => setReplyTo(m),
    onConvert: (m: TeamMessage) => setConvertMessage(m),
    onDelete: (m: TeamMessage) => void deleteMessage(m),
    onJump: (id: string) => jump(id),
  })

  return (
    <div className="mx-auto flex max-w-4xl flex-col">
      <PageHeader title={t.talkTitle} description={t.talkDescription} icon={<MessagesSquare className="h-7 w-7 text-primary" />} />
      <div role="group" aria-label={t.talkTitle} className="mb-2 inline-flex self-start rounded-ui-md bg-surface-sunken p-0.5 text-caption font-medium">
        {([false, true] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={forMe === v}
            onClick={() => setForMe(v)}
            className={cn("min-h-8 rounded-ui-sm px-3", forMe === v ? "bg-surface text-primary-active shadow-ui-sm" : "text-fg-muted hover:text-fg")}
          >
            {v ? t.talkTabForMe : t.talkTabAll}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        data-talk-list=""
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="mb-3 max-h-[calc(100dvh-22rem)] min-h-64 overflow-y-auto rounded-ui-lg border border-border bg-surface p-2 shadow-ui-sm"
      >
        {chat.loading ? (
          <SkeletonLines lines={6} label={t.loading} />
        ) : chat.error ? (
          <EmptyState compact title={t.talkLoadFailed} description={chat.error.message} />
        ) : chat.messages.length === 0 ? (
          <EmptyState compact icon={<MessagesSquare className="h-6 w-6" />} title={forMe ? t.talkEmptyForMe : t.talkEmpty} />
        ) : (
          <>
            {chat.hasMore && (
              <div className="flex justify-center py-1">
                <Button variant="ghost" size="sm" onClick={() => void chat.loadOlder()}>{t.talkLoadOlder}</Button>
              </div>
            )}
            <ol className="space-y-1">
              {chat.messages.map((m, i) => (
                <MessageRow key={m.id} showDivider={i === unreadAt} label={t.talkUnreadDivider}>
                  <MessageItem projectId={projectId} message={m} now={now} {...rowHandlers} onConvert={canPbi || canIcebox || canTask ? rowHandlers.onConvert : undefined} />
                </MessageRow>
              ))}
            </ol>
          </>
        )}
      </div>
      {convertMessage && (
        <ConvertMessageDialog projectId={projectId} message={convertMessage} canPbi={canPbi} canIcebox={canIcebox} canTask={canTask} onClose={() => setConvertMessage(null)} />
      )}
      <ChatComposer members={mention.members} membersLoading={mention.isLoading} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={send} />
    </div>
  )
}

function MessageRow({ showDivider, label, children }: { showDivider: boolean; label: string; children: React.ReactNode }) {
  return (
    <>
      {showDivider && (
        <li aria-hidden="false" data-talk-unread="" className="my-2 flex items-center gap-2 text-caption font-semibold text-danger">
          <span className="h-px flex-1 bg-danger/50" />
          {label}
          <span className="h-px flex-1 bg-danger/50" />
        </li>
      )}
      {children}
    </>
  )
}
