"use client"

import { useState } from "react"
import { MessageSquare, Pencil, Trash2 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, IconButton, SkeletonLines, useConfirm, useToast } from "@/components/ui"
import { CommentBody } from "./comment-body"
import { CommentComposer } from "./comment-composer"
import { formatFullDateTime, formatRelativeTime } from "./relative-time"
import { useCommentThread, useMentionMembers } from "./use-comment-thread"
import type { CommentDto, CommentEntityType, MentionMember } from "./types"

interface Props {
  projectId: string
  entityType: CommentEntityType
  entityId: string
  /** Called with +1 / -1 after a comment is posted / deleted (badge counts). */
  onCountDelta?: (delta: number) => void
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Comment thread of one PBI / sprint task / IceBox item: oldest first with
 * "show more", the composer at the bottom, edit / delete of one's own
 * comments (moderators may delete any — the server decides via canDelete).
 */
export function CommentThread({ projectId, entityType, entityId, onCountDelta }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const thread = useCommentThread(projectId, entityType, entityId)
  const members = useMentionMembers(projectId)

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
            <CommentItem key={c.id} comment={c} members={members} onUpdate={thread.update} onRemove={thread.remove}
              onRemoved={() => onCountDelta?.(-1)} />
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
      <CommentComposer members={members} onSubmit={post} label={t.commentsBodyLabel} submitLabel={t.commentsSend} />
    </section>
  )
}

interface ItemProps {
  comment: CommentDto
  members: readonly MentionMember[]
  onUpdate: (id: string, body: string) => Promise<unknown>
  onRemove: (id: string) => Promise<void>
  onRemoved: () => void
}

function CommentItem({ comment, members, onUpdate, onRemove, onRemoved }: ItemProps) {
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
        <CommentComposer members={members} initialValue={comment.body} onSubmit={save} autoFocus
          label={t.commentsEditBodyLabel} submitLabel={t.commentsSave} onCancel={() => setEditing(false)} />
      ) : (
        <CommentBody body={comment.body} mentions={comment.mentions} />
      )}
    </li>
  )
}
