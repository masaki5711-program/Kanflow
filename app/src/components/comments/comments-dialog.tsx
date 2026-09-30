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
}

/** Modal with one item's comment thread (sprint tasks, IceBox items). */
export function CommentsDialog({ projectId, entityType, entityId, name, onClose, onCountDelta }: DialogProps) {
  const { t } = useLanguage()
  return (
    <Modal open onClose={onClose} size="lg" title={t.commentsOpenFor.replace("{name}", name)} footer={<CloseFooter />}>
      <CommentThread projectId={projectId} entityType={entityType} entityId={entityId} onCountDelta={onCountDelta} />
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
  onClick: () => void
  className?: string
}

/** Icon button with a comment-count bubble (hidden when 0 / unknown). */
export function CommentCountButton({ name, count, onClick, className }: ButtonProps) {
  const { t } = useLanguage()
  const hasCount = typeof count === "number" && count > 0
  const label = hasCount
    ? `${t.commentsOpenFor.replace("{name}", name)} (${t.commentsCountLabel.replace("{count}", String(count))})`
    : t.commentsOpenFor.replace("{name}", name)
  return (
    <IconButton size="sm" label={label} onClick={onClick} className={cn("relative", className)}
      icon={
        <>
          <MessageSquare className="h-4 w-4" />
          {hasCount && (
            <span aria-hidden="true"
              className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-primary px-1 text-center text-caption leading-[1.1rem] text-primary-fg">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </>
      } />
  )
}
