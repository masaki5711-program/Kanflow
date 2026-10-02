"use client"

import { MessageSquare } from "lucide-react"
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

/** Icon button with a comment-count bubble (hidden when 0 / unknown). */
export function CommentCountButton({ name, count, unread = 0, onClick, className }: ButtonProps) {
  const { t } = useLanguage()
  const hasCount = typeof count === "number" && count > 0
  const hasUnread = unread > 0
  const base = hasCount
    ? `${t.commentsOpenFor.replace("{name}", name)} (${t.commentsCountLabel.replace("{count}", String(count))})`
    : t.commentsOpenFor.replace("{name}", name)
  const label = hasUnread ? `${base} — ${t.commentsUnreadLabel.replace("{count}", String(unread))}` : base
  return (
    <IconButton size="sm" label={label} onClick={onClick} className={cn("relative", className)}
      icon={
        <>
          <MessageSquare className="h-4 w-4" />
          {hasCount && (
            <span aria-hidden="true"
              className={cn(
                "absolute -right-1 -top-1 min-w-[1.1rem] rounded-full px-1 text-center text-caption leading-[1.1rem] text-white",
                hasUnread ? "bg-danger ring-2 ring-surface" : "bg-primary text-primary-fg",
              )}
              data-comment-unread={hasUnread ? "true" : undefined}>
              {count > 99 ? "99+" : count}
            </span>
          )}
          {!hasCount && hasUnread && (
            <span aria-hidden="true" data-comment-unread="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />
          )}
        </>
      } />
  )
}
