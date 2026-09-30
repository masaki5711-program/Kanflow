"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { CommentCountButton, CommentsDialog } from "./comments-dialog"
import { useCommentCounts } from "./use-comment-thread"
import type { CommentEntityType } from "./types"

/** The counts endpoint takes at most this many ids; later items just show no badge. */
const MAX_COUNT_IDS = 200

interface CommentsContextValue {
  counts: Record<string, number>
  open: (entityId: string, name: string) => void
}

const CommentsContext = createContext<CommentsContextValue | null>(null)

interface ProviderProps {
  projectId: string
  entityType: CommentEntityType
  /** Items listed under this provider (one counts request for all of them). */
  entityIds: readonly string[]
  children: ReactNode
}

/**
 * Comment counts (one request per list) and the comment dialog for a list of
 * items (a sprint card's tasks, an IceBox section). Rows render
 * `CommentsButton`, which reads this context.
 */
export function CommentsProvider({ projectId, entityType, entityIds, children }: ProviderProps) {
  const ids = useMemo(() => entityIds.slice(0, MAX_COUNT_IDS), [entityIds])
  const { counts, adjustCount } = useCommentCounts(projectId, entityType, ids)
  const [openItem, setOpenItem] = useState<{ id: string; name: string } | null>(null)
  const open = useCallback((id: string, name: string) => setOpenItem({ id, name }), [])
  const value = useMemo(() => ({ counts, open }), [counts, open])

  return (
    <CommentsContext.Provider value={value}>
      {children}
      {openItem && (
        <CommentsDialog projectId={projectId} entityType={entityType} entityId={openItem.id} name={openItem.name}
          onClose={() => setOpenItem(null)} onCountDelta={(d) => adjustCount(openItem.id, d)} />
      )}
    </CommentsContext.Provider>
  )
}

/** Comment button with count for one item (renders nothing outside a provider). */
export function CommentsButton({ entityId, name, className }: { entityId: string; name: string; className?: string }) {
  const ctx = useContext(CommentsContext)
  if (!ctx) return null
  return <CommentCountButton name={name} count={ctx.counts[entityId]} onClick={() => ctx.open(entityId, name)} className={className} />
}
