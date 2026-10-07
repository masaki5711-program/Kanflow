"use client"

import { useEffect, useState } from "react"
import { MessageSquare, Pencil, Trash2 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, IconButton, SkeletonLines, useConfirm, useToast } from "@/components/ui"
import { ReactionBar } from "@/components/reactions/reaction-bar"
import { CommentBody } from "./comment-body"
import { CommentComposer } from "./comment-composer"
import { formatFullDateTime, formatRelativeTime } from "./relative-time"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import { markThreadRead, useCommentThread, useMentionMembersState } from "./use-comment-thread"
import type { CommentDto, CommentEntityType, MentionMember } from "./types"

interface Props {
  projectId: string
  entityType: CommentEntityType
  entityId: string
  /** Called with +1 / -1 after a comment is posted / deleted (badge counts). */
  onCountDelta?: (delta: number) => void
  /** Called once the thread was opened and its notifications marked read (unread marks). */
  onRead?: () => void
}

const NOTIFICATION_EVENTS = ["notification"] as const

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Comment thread of one PBI / sprint task / IceBox item: oldest first with
 * "show more", the composer at the bottom, edit / delete of one's own
 * comments (moderators may delete any — the server decides via canDelete).
 */
export function CommentThread({ projectId, entityType, entityId, onCountDelta, onRead }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const thread = useCommentThread(projectId, entityType, entityId)
  // Opening a thread reads it: its mentions / comment notifications are read everywhere (bell, top page, sprint marks).
  useEffect(() => {
    let cancelled = false
    void markThreadRead(projectId, entityType, entityId).then((ok) => {
      if (ok && !cancelled) onRead?.()
    })
    return () => {
      cancelled = true
    }
    // onRead is a notification only; re-running for a new callback identity is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, entityType, entityId])
  // A new mention / comment notification about this thread while it is open: it is being read right now.
  useLiveRefetch(
    () => void markThreadRead(projectId, entityType, entityId).then((ok) => ok && onRead?.()),
    { types: NOTIFICATION_EVENTS, projectId, entityTypes: [entityType], entityIds: entityId, resync: false },
  )
  const { members, isLoading: membersLoading } = useMentionMembersState(projectId)

  async function post(body: string): Promise<boolean> {
    try {
      await thread.create(body)
      onCountDelta?.(1)
      return true
    } catch (err) {
      toast.error(errorText(err), { title: t.commentsPostFailed })
      return false
    }
  }

  async function loadMore() {
    try {
      await thread.loadMore()
    } catch (err) {
      toast.error(errorText(err), { title: t.commentsLoadFailed })
    }
  }

  return (
    <section aria-label={t.commentsTitle} className="space-y-4">
      {thread.isLoading ? (
        <SkeletonLines lines={3} label={t.loading} />
      ) : thread.error && !thread.data ? (
        <EmptyState compact headingLevel={3} title={t.commentsLoadFailed} description={thread.error.message}
          action={<Button variant="secondary" onClick={thread.refetch}>{t.commentsRetry}</Button>} />
      ) : thread.items.length === 0 ? (
        <EmptyState compact headingLevel={3} icon={<MessageSquare className="h-6 w-6" />}
          title={t.commentsEmptyTitle} description={t.commentsEmptyDescription} />
      ) : (
        <ol className="space-y-3">
          {thread.items.map((c) => (
            <CommentItem key={c.id} projectId={projectId} comment={c} members={members} membersLoading={membersLoading} onUpdate={thread.update} onRemove={thread.remove}
              onRemoved={() => onCountDelta?.(-1)} onTranslated={() => void thread.refetch()} />
          ))}
        </ol>
      )}
      {thread.hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={thread.loadingMore} onClick={() => void loadMore()}>
            {t.commentsLoadMore}
          </Button>
        </div>
      )}
      <CommentComposer members={members} membersLoading={membersLoading} onSubmit={post} label={t.commentsBodyLabel} submitLabel={t.commentsSend} />
    </section>
  )
}

interface ItemProps {
  projectId: string
  comment: CommentDto
  members: readonly MentionMember[]
  membersLoading: boolean
  onUpdate: (id: string, body: string) => Promise<unknown>
  onRemove: (id: string) => Promise<void>
  onRemoved: () => void
  /** A "translate now" finished — reload so the translated body shows. */
  onTranslated: () => void
}

function CommentItem({ projectId, comment, members, membersLoading, onUpdate, onRemove, onRemoved, onTranslated }: ItemProps) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const author = comment.author?.name ?? t.commentsUnknownUser

  async function save(body: string): Promise<boolean> {
    try {
      await onUpdate(comment.id, body)
      setEditing(false)
      return true
    } catch (err) {
      toast.error(errorText(err), { title: t.commentsSaveFailed })
      return false
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t.commentsDeleteConfirmTitle,
      message: t.commentsDeleteConfirmMessage,
      confirmLabel: t.commentsDelete,
      variant: "danger",
    })
    if (!ok) return
    setRemoving(true)
    try {
      await onRemove(comment.id)
      onRemoved()
      toast.success(t.commentsDeleteDone)
    } catch (err) {
      toast.error(errorText(err), { title: t.commentsDeleteFailed })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <li className="group rounded-ui-md border border-border bg-surface px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-body font-semibold text-fg">{author}</span>
        <time dateTime={comment.createdAt} title={formatFullDateTime(comment.createdAt, language)} className="text-caption text-fg-muted">
          {formatRelativeTime(comment.createdAt, new Date(), language)}
        </time>
        {comment.editedAt && !comment.deleted && (
          <span className="text-caption text-fg-muted" title={formatFullDateTime(comment.editedAt, language)}>{t.commentsEdited}</span>
        )}
        {!editing && (comment.canEdit || comment.canDelete) && (
          <div className="ml-auto flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {comment.canEdit && (
              <IconButton size="sm" label={t.commentsEdit} icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)} />
            )}
            {comment.canDelete && (
              <IconButton size="sm" label={t.commentsDelete} icon={<Trash2 className="h-4 w-4" />} loading={removing}
                className="hover:bg-danger-soft hover:text-danger-strong" onClick={() => void remove()} />
            )}
          </div>
        )}
      </div>
      {comment.deleted || comment.body === null ? (
        <p className="text-body italic text-fg-muted">{t.commentsDeletedBody}</p>
      ) : editing ? (
        <CommentComposer members={members} membersLoading={membersLoading} initialValue={comment.body} onSubmit={save} autoFocus
          label={t.commentsEditBodyLabel} submitLabel={t.commentsSave} onCancel={() => setEditing(false)} />
      ) : (
        <CommentBody body={comment.body} mentions={comment.mentions} i18n={comment.i18n} commentId={comment.id} onTranslated={onTranslated} />
      )}
      {!comment.deleted && !editing && <ReactionBar projectId={projectId} targetType="comment" targetId={comment.id} />}
    </li>
  )
}
