"use client"

import { MessageSquare, MessageSquareText } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Button, IconButton, Modal, cn, useModalClose } from "@/components/ui"
import { CommentThread } from "./comment-thread"
import type { CommentEntityType } from "./types"

interface DialogProps {
  projectId: string
  entityType: CommentEntityType
  entityId: string
  /** Name of the commented item (dialog title). */
  name: string
  onClose: () => void
  onCountDelta?: (delta: number) => void
  onRead?: () => void
}

/** Modal with one item's comment thread (sprint tasks, IceBox items). */
export function CommentsDialog({ projectId, entityType, entityId, name, onClose, onCountDelta, onRead }: DialogProps) {
  const { t } = useLanguage()
  return (
    <Modal open onClose={onClose} size="lg" title={t.commentsOpenFor.replace("{name}", name)} footer={<CloseFooter />}>
      <CommentThread projectId={projectId} entityType={entityType} entityId={entityId} onCountDelta={onCountDelta} onRead={onRead} />
    </Modal>
  )
}

function CloseFooter() {
  const { t } = useLanguage()
  const close = useModalClose()
  return <Button variant="secondary" onClick={close}>{t.close}</Button>
}

interface ButtonProps {
  /** Item name for the accessible label. */
  name: string
  count: number | undefined
  /** Unread mentions / comments for the viewer (red mark). */
  unread?: number
  onClick: () => void
  className?: string
}

/**
 * Comment button. The red number is ONLY the viewer's unread mentions /
 * comments (people read any number on this icon as "unread", so the total
 * never shows as a badge). With comments but nothing unread, the icon turns
 * into a "has comments" icon and the total stays in the label / tooltip.
 */
export function CommentCountButton({ name, count, unread = 0, onClick, className }: ButtonProps) {
  const { t } = useLanguage()
  const hasCount = typeof count === "number" && count > 0
  const hasUnread = unread > 0
  const base = hasCount
    ? `${t.commentsOpenFor.replace("{name}", name)} (${t.commentsCountLabel.replace("{count}", String(count))})`
    : t.commentsOpenFor.replace("{name}", name)
  const label = hasUnread ? `${base} — ${t.commentsUnreadLabel.replace("{count}", String(unread))}` : base
  const Icon = hasCount ? MessageSquareText : MessageSquare
  return (
    <IconButton size="sm" label={label} title={label} onClick={onClick} className={cn("relative", className)}
      icon={
        <>
          <Icon className={cn("h-4 w-4", hasCount && !hasUnread && "text-primary-strong")} data-comment-has={hasCount ? "true" : undefined} />
          {hasUnread && (
            <span aria-hidden="true" data-comment-unread="true"
              className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-danger px-1 text-center text-caption leading-[1.1rem] text-white ring-2 ring-surface">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </>
      } />
  )
}
